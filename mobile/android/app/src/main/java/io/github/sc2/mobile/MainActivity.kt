package io.github.sc2.mobile

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject

/**
 * soundcloud.com в WebView с теми же скриптами страницы, что внедряет клиент на ПК (волна, меню трека, серия лайков,
 * плавность). Мост bridge.js ставится до скриптов сайта вместо preload Electron, page.js после загрузки страницы.
 * WebView не ставится на паузу при уходе в фон: звук продолжает играть, процесс держит PlaybackService
 */
class MainActivity : Activity() {
    companion object {
        private const val HOME = "https://soundcloud.com/discover"
        // Сайт отдаёт полную версию, а не m.soundcloud.com: скрипты клиента написаны под неё
        private const val DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36"
        private val INSIDE = Regex("""^(?:[a-z0-9-]+\.)*(soundcloud\.com|sndcdn\.com)$""")
    }

    private lateinit var web: WebView
    private lateinit var bridgeJs: String
    private lateinit var pageJs: String
    private var documentStart = false

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        bridgeJs = assets.open("bridge.js").bufferedReader().use { it.readText() }
        pageJs = assets.open("page.js").bufferedReader().use { it.readText() }
        WebView.setWebContentsDebuggingEnabled(true)

        val root = FrameLayout(this)
        root.setBackgroundColor(Color.BLACK)
        web = WebView(this)
        web.setBackgroundColor(Color.parseColor("#121212"))
        root.addView(web, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        setContentView(root)
        // Android 15 рисует приложение под системными панелями: сайт сдвигается на их высоту
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            WindowInsetsCompat.CONSUMED
        }

        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
            userAgentString = DESKTOP_UA
            // Ширина страницы как у узкого окна клиента на ПК, без уменьшенного «обзора» полной версии
            useWideViewPort = false
            loadWithOverviewMode = false
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
        }
        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true)
        web.addJavascriptInterface(NativeBridge(), "SC2Native")
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            WebViewCompat.addDocumentStartJavaScript(web, bridgeJs, setOf("https://soundcloud.com", "https://*.soundcloud.com"))
            documentStart = true
        }
        web.webViewClient = Client()
        web.webChromeClient = Chrome()

        PlaybackHub.commandSink = { command ->
            val safe = JSONObject.quote(command)
            web.post { web.evaluateJavascript("window.__sc2Command ? window.__sc2Command($safe) : false", null) }
        }

        askNotifications()
        if (savedInstanceState != null) web.restoreState(savedInstanceState) else web.loadUrl(linkOf(intent) ?: HOME)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        linkOf(intent)?.let { web.loadUrl(it) }
    }

    private fun linkOf(intent: Intent?): String? {
        val data = intent?.data ?: return null
        return if (data.scheme == "https" && INSIDE.matches(data.host ?: "")) data.toString() else null
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    // Нарочно без web.onPause(): иначе WebView глушит звук, как только приложение уходит в фон
    @Deprecated("Системная «Назад» ведёт по истории сайта")
    override fun onBackPressed() {
        if (web.canGoBack()) web.goBack() else moveTaskToBack(true)
    }

    override fun onDestroy() {
        PlaybackHub.commandSink = null
        PlaybackService.stop(this)
        web.destroy()
        super.onDestroy()
    }

    private fun askNotifications() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
        }
    }

    private inner class Client : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val url = request.url
            val host = url.host ?: return false
            // Сайт, его CDN и вход (Google, Apple, Facebook) остаются внутри; остальные ссылки открывает браузер
            if (INSIDE.matches(host) || host.endsWith("google.com") || host.endsWith("apple.com") || host.endsWith("facebook.com")) return false
            if (url.scheme == "http" || url.scheme == "https") {
                try {
                    startActivity(Intent(Intent.ACTION_VIEW, url))
                } catch (_: Exception) {
                    // некому открыть
                }
                return true
            }
            return true
        }

        override fun onPageStarted(view: WebView, url: String, favicon: android.graphics.Bitmap?) {
            // Старый WebView без скриптов до загрузки: мост ставится как можно раньше вручную
            if (!documentStart && isSite(url)) view.evaluateJavascript(bridgeJs, null)
        }

        override fun onPageFinished(view: WebView, url: String) {
            if (!isSite(url)) return
            if (!documentStart) view.evaluateJavascript(bridgeJs, null)
            view.evaluateJavascript(pageJs, null)
        }

        private fun isSite(url: String): Boolean = INSIDE.matches(Uri.parse(url).host ?: "")
    }

    private inner class Chrome : WebChromeClient() {
        // Защищённые потоки лейблов (Widevine): WebView спрашивает разрешение, остальное не выдаётся
        override fun onPermissionRequest(request: PermissionRequest) {
            val allowed = request.resources.filter { it == PermissionRequest.RESOURCE_PROTECTED_MEDIA_ID }
            runOnUiThread { if (allowed.isNotEmpty()) request.grant(allowed.toTypedArray()) else request.deny() }
        }
    }

    /** Мост страницы: вызывается из bridge.js в потоке WebView */
    private inner class NativeBridge {
        @JavascriptInterface
        fun track(json: String) {
            TrackState.parse(json)?.let { PlaybackService.update(applicationContext, it) }
        }

        @JavascriptInterface
        fun command(json: String) {
            Log.d("SC2", "command $json")
        }

        @JavascriptInterface
        fun log(json: String) {
            Log.d("SC2", json.take(500))
        }
    }
}
