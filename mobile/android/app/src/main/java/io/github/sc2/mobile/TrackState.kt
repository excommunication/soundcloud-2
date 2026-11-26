package io.github.sc2.mobile

import org.json.JSONObject

/** Трек из audioMonitor страницы (тот же TrackInfo, что на ПК уходит в main) */
data class TrackState(
    val title: String,
    val author: String,
    val artwork: String,
    val url: String,
    val playing: Boolean,
    val liked: Boolean,
    val elapsedMs: Long,
    val durationMs: Long,
) {
    companion object {
        fun parse(json: String): TrackState? = try {
            val data = JSONObject(json).getJSONObject("data")
            TrackState(
                title = data.optString("title"),
                author = data.optString("author"),
                artwork = bigArtwork(data.optString("artwork")),
                url = data.optString("url"),
                playing = data.optBoolean("isPlaying"),
                liked = data.optBoolean("isLiked"),
                elapsedMs = clockMs(data.optString("elapsed")),
                durationMs = clockMs(data.optString("duration")),
            )
        } catch (_: Exception) {
            null
        }

        /** «1:05» или «1:02:03» в миллисекунды */
        fun clockMs(text: String): Long {
            if (text.isBlank()) return 0
            var total = 0L
            for (part in text.trim().split(":")) total = total * 60 + (part.toLongOrNull() ?: return 0)
            return total * 1000
        }

        /** Обложка SoundCloud побольше для уведомления и экрана блокировки */
        private fun bigArtwork(url: String): String =
            if (url.startsWith("https://")) url.replace(Regex("-(large|t\\d+x\\d+|small|badge|tiny|mini)\\.(jpg|png)"), "-t500x500.$2") else ""
    }
}
