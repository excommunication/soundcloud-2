package io.github.sc2.mobile

/** Связка уведомления и страницы: команды плеера уходят в WebView, который держит MainActivity */
object PlaybackHub {
    @Volatile
    var commandSink: ((String) -> Unit)? = null

    /** play, pause, toggle, next, previous, like: тот же набор, что у PlaybackController на ПК */
    fun command(name: String) {
        commandSink?.invoke(name)
    }
}
