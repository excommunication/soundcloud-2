package io.github.sc2.mobile

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * Фоновый плеер: сервис переднего плана с уведомлением держит процесс живым, пока играет WebView, и даёт управление
 * с экрана блокировки, шторки, наушников и часов через MediaSession. Сам звук играет сайт внутри WebView
 */
class PlaybackService : Service() {
    companion object {
        private const val CHANNEL = "playback"
        private const val NOTIFICATION_ID = 1
        private const val ACTION_COMMAND = "io.github.sc2.mobile.COMMAND"
        private const val EXTRA_COMMAND = "command"

        @Volatile
        private var instance: PlaybackService? = null

        @Volatile
        private var pending: TrackState? = null

        /** Трек из страницы (поток моста JS): первый с названием запускает сервис, дальше просто обновляет его */
        fun update(context: Context, state: TrackState) {
            pending = state
            val running = instance
            if (running != null) {
                running.handler.post { running.show(state) }
                return
            }
            if (state.title.isEmpty() || !state.playing) return
            try {
                ContextCompat.startForegroundService(context, Intent(context, PlaybackService::class.java))
            } catch (_: Exception) {
                // Android не дал запустить сервис из фона: запустится на следующем треке, когда приложение впереди
            }
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, PlaybackService::class.java))
        }
    }

    private val handler = Handler(Looper.getMainLooper())
    private val loader = Executors.newSingleThreadExecutor()
    private lateinit var session: MediaSessionCompat
    private var artworkUrl = ""
    private var artwork: Bitmap? = null
    private var current: TrackState? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel(CHANNEL, getString(R.string.channel_playback), NotificationManager.IMPORTANCE_LOW).apply {
            setShowBadge(false)
        })
        session = MediaSessionCompat(this, "SoundCloud2").apply {
            setCallback(object : MediaSessionCompat.Callback() {
                override fun onPlay() = PlaybackHub.command("play")
                override fun onPause() = PlaybackHub.command("pause")
                override fun onSkipToNext() = PlaybackHub.command("next")
                override fun onSkipToPrevious() = PlaybackHub.command("previous")
                override fun onStop() = PlaybackHub.command("pause")
            })
            setSessionActivity(openAppIntent())
            isActive = true
        }
        instance = this
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Сначала сразу уведомление: Android требует startForeground в первые секунды после запуска
        val state = pending ?: current ?: TrackState("", "", "", "", false, false, 0, 0)
        startInForeground(build(state))
        if (intent?.action == ACTION_COMMAND) intent.getStringExtra(EXTRA_COMMAND)?.let { PlaybackHub.command(it) }
        show(state)
        return START_NOT_STICKY
    }

    private fun startInForeground(notification: Notification) {
        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK else 0
        ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, type)
    }

    private fun show(state: TrackState) {
        current = state
        if (state.artwork != artworkUrl) {
            artworkUrl = state.artwork
            artwork = null
            if (state.artwork.isNotEmpty()) loadArtwork(state.artwork)
        }
        session.setMetadata(
            MediaMetadataCompat.Builder()
                .putString(MediaMetadataCompat.METADATA_KEY_TITLE, state.title)
                .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, state.author)
                .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, state.durationMs)
                .apply { artwork?.let { putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, it) } }
                .build(),
        )
        session.setPlaybackState(
            PlaybackStateCompat.Builder()
                .setActions(
                    PlaybackStateCompat.ACTION_PLAY or PlaybackStateCompat.ACTION_PAUSE or PlaybackStateCompat.ACTION_PLAY_PAUSE or
                        PlaybackStateCompat.ACTION_SKIP_TO_NEXT or PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS or PlaybackStateCompat.ACTION_STOP,
                )
                .setState(if (state.playing) PlaybackStateCompat.STATE_PLAYING else PlaybackStateCompat.STATE_PAUSED, state.elapsedMs, if (state.playing) 1f else 0f)
                .build(),
        )
        getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID, build(state))
    }

    private fun loadArtwork(url: String) {
        loader.execute {
            val bitmap = try {
                val connection = URL(url).openConnection() as HttpURLConnection
                connection.connectTimeout = 8000
                connection.readTimeout = 8000
                connection.inputStream.use { BitmapFactory.decodeStream(it) }
            } catch (_: Exception) {
                null
            }
            handler.post {
                if (url == artworkUrl && bitmap != null) {
                    artwork = bitmap
                    current?.let { show(it) }
                }
            }
        }
    }

    private fun openAppIntent(): PendingIntent = PendingIntent.getActivity(
        this, 0, Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    private fun commandIntent(command: String, code: Int): PendingIntent = PendingIntent.getService(
        this, code, Intent(this, PlaybackService::class.java).setAction(ACTION_COMMAND).putExtra(EXTRA_COMMAND, command),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    private fun build(state: TrackState): Notification {
        val playPause = if (state.playing) {
            NotificationCompat.Action(R.drawable.ic_pause, getString(R.string.pause), commandIntent("pause", 2))
        } else {
            NotificationCompat.Action(R.drawable.ic_play, getString(R.string.play), commandIntent("play", 2))
        }
        return NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat)
            .setContentTitle(state.title.ifEmpty { getString(R.string.app_name) })
            .setContentText(state.author)
            .setLargeIcon(artwork)
            .setContentIntent(openAppIntent())
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setOngoing(state.playing)
            .addAction(R.drawable.ic_previous, getString(R.string.previous), commandIntent("previous", 1))
            .addAction(playPause)
            .addAction(R.drawable.ic_next, getString(R.string.next), commandIntent("next", 3))
            .setStyle(androidx.media.app.NotificationCompat.MediaStyle().setMediaSession(session.sessionToken).setShowActionsInCompactView(0, 1, 2))
            .build()
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        // Приложение смахнули из недавних: WebView со звуком уже уничтожен, плеер больше не нужен
        stopSelf()
    }

    override fun onDestroy() {
        instance = null
        session.isActive = false
        session.release()
        loader.shutdownNow()
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        super.onDestroy()
    }
}
