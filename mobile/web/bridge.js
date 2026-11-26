// Мобильный мост вместо preload Electron: та же форма window.soundcloudAPI, что ждут скрипты страницы, но без main.
// Журнал волны, отметки и полка живут в localStorage сайта; то, что на ПК считает main (рекомендации, радар, вкус,
// полный трек, скачивание, джем), в прототипе отвечает пусто, и скрипты страницы идут своим запасным путём.
// Трек и его состояние уходят в Android (window.SC2Native) для уведомления-плеера и управления с экрана блокировки
(() => {
    if (window.soundcloudAPI && window.soundcloudAPI.__mobile) return;
    const native = window.SC2Native || null;
    const PREFIX = 'sc2m:';
    const read = (key, fallback) => {
        try {
            const raw = localStorage.getItem(PREFIX + key);
            return raw ? JSON.parse(raw) : fallback;
        } catch {
            return fallback;
        }
    };
    const write = (key, value) => {
        try {
            localStorage.setItem(PREFIX + key, JSON.stringify(value));
        } catch {
            // переполнено или запрещено: прототип живёт без записи
        }
    };
    const user = (id) => (Number.isSafeInteger(id) && id > 0 ? String(id) : '0');
    const nothing = () => Promise.resolve(null);
    const none = () => Promise.resolve([]);
    const ignore = () => undefined;
    const send = (method, payload) => {
        try {
            if (native && typeof native[method] === 'function') native[method](JSON.stringify(payload));
        } catch {
            // мост Android недоступен (открыто в обычном браузере для проверки)
        }
    };
    // Журнал прослушанного: последние 5000 id на аккаунт, как окно журнала на ПК по смыслу
    const JOURNAL_LIMIT = 5000;
    window.soundcloudAPI = {
        __mobile: true,
        library: { loadSession: nothing, saveSession: nothing, loadCatalog: nothing, saveCatalog: nothing, listMixes: none, saveMix: nothing, removeMix: nothing },
        recommend: {
            recordUploads: nothing, uploads: none, recordingLinks: none, setRecordingLink: nothing, syncStart: nothing, syncPage: nothing,
            syncFinish: nothing, syncState: nothing, libraryMembers: none, radarPlan: nothing, catalogChecked: nothing, artistResolved: nothing,
        },
        radar: { view: nothing, found: nothing, rebuild: nothing, state: nothing, channels: none },
        playback: (command) => send('command', { command }),
        sendProfileUpdate: ignore,
        sendTrackUpdate: (data, reason) => send('track', { data, reason }),
        waveJournal: {
            load: (userId) => Promise.resolve(read('journal:' + user(userId), [])),
            add: (userId, ids) => {
                if (!Array.isArray(ids)) return;
                const key = 'journal:' + user(userId);
                const list = read(key, []).concat(ids.filter((id) => Number.isSafeInteger(id) && id > 0));
                write(key, list.slice(-JOURNAL_LIMIT));
            },
        },
        waveSignals: { add: ignore },
        reportWaveEmpty: ignore,
        reportWaveFiltered: ignore,
        reportCrossfade: ignore,
        reportSeekBack: ignore,
        reportSite: (state) => send('log', { site: state }),
        reportPlayerArea: ignore,
        setBeat: ignore,
        setEffectsMode: ignore,
        openHistory: ignore,
        sendTrackMeta: ignore,
        waveExclusions: {
            load: (userId) => Promise.resolve(read('exclusions:' + user(userId), null)),
            set: (userId, kind, entry, excluded) => {
                // На ПК отметки проверяет и хранит main; здесь простой список по виду, чтобы «Не нравится» переживал перезапуск
                const key = 'exclusions:' + user(userId);
                const all = read(key, {}) || {};
                const list = Array.isArray(all[kind]) ? all[kind] : [];
                const id = entry && (entry.id ?? entry.key);
                all[kind] = excluded ? list.filter((item) => (item.id ?? item.key) !== id).concat([entry]) : list.filter((item) => (item.id ?? item.key) !== id);
                write(key, all);
                return Promise.resolve(true);
            },
        },
        waveTaste: { load: nothing },
        waveShelf: {
            load: (userId) => Promise.resolve(read('shelf:' + user(userId), null)),
            save: (userId, snapshot) => {
                write('shelf:' + user(userId), snapshot);
                return Promise.resolve(true);
            },
        },
        vibe: { plan: nothing, status: nothing },
        fullTrack: nothing,
        lyrics: nothing,
        downloadTrack: () => Promise.resolve({ ok: false, error: 'mobile' }),
        onDownloadProgress: () => ignore,
        revealDownload: nothing,
        clipRecord: { arm: () => Promise.resolve(false), save: () => Promise.resolve(false) },
        jam: {
            create: () => Promise.reject(new Error('Джем пока только на ПК')),
            join: () => Promise.reject(new Error('Джем пока только на ПК')),
            leave: nothing,
            send: nothing,
            snapshot: nothing,
            copy: nothing,
            onState: () => ignore,
        },
        waveOptions: { set: nothing },
        waveLibrary: { load: nothing, save: nothing, heard: none, recent: none },
    };
})();
