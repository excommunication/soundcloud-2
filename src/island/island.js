// Остров: рисует то, что прислал main, раскрывается при наведении и на смене трека, ловит мышь только над плашкой
(() => {
    const root = document.documentElement;
    const island = document.getElementById('island');
    const $ = (id) => document.getElementById(id);
    // Без preload (открыт как файл для проверки вёрстки) остров показывает пример
    const api = window.islandAPI || demoApi();

    const TEXT = {
        ru: { open: 'Открыть SoundCloud 2', like: 'Лайк', play: 'Играть', pause: 'Пауза', previous: 'Предыдущий', next: 'Следующий', mute: 'Звук вкл/выкл', volume: 'Громкость' },
        en: { open: 'Open SoundCloud 2', like: 'Like', play: 'Play', pause: 'Pause', previous: 'Previous', next: 'Next', mute: 'Mute/unmute', volume: 'Volume' },
    };
    let state = null;
    let text = TEXT.ru;
    let hovered = false;
    let expandTimer = 0;
    let collapseTimer = 0;
    let announceUntil = 0;
    let pinned = false;
    let position = { elapsed: 0, duration: 0, at: 0 };
    let ticker = 0;

    function seconds(value) {
        if (typeof value !== 'string' || !value) return 0;
        return value.split(':').reduce((total, part) => total * 60 + (Number(part) || 0), 0);
    }
    function clock(total) {
        total = Math.max(0, Math.floor(total));
        const h = Math.floor(total / 3600);
        const m = Math.floor((total % 3600) / 60);
        const s = String(total % 60).padStart(2, '0');
        return h ? h + ':' + String(m).padStart(2, '0') + ':' + s : m + ':' + s;
    }
    function artUrl(url) {
        // У SoundCloud обложка 500x500 через суффикс; маленькая плашка берёт поменьше
        return typeof url === 'string' && /^https:/.test(url) ? url : '';
    }

    // Цвет полосок из обложки: средний насыщенный цвет, слишком тёмный подсвечивается. Без CORS остаётся оранжевый
    let accentFor = '';
    function pickAccent(url) {
        if (!url || url === accentFor) return;
        accentFor = url;
        const image = new window.Image();
        image.crossOrigin = 'anonymous';
        image.onload = () => {
            if (accentFor !== url) return;
            try {
                const canvas = document.createElement('canvas');
                canvas.width = canvas.height = 16;
                const context = canvas.getContext('2d', { willReadFrequently: true });
                context.drawImage(image, 0, 0, 16, 16);
                const data = context.getImageData(0, 0, 16, 16).data;
                let best = null;
                let bestScore = -1;
                for (let i = 0; i < data.length; i += 4) {
                    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
                    const max = Math.max(r, g, b);
                    const min = Math.min(r, g, b);
                    const saturation = max ? (max - min) / max : 0;
                    const score = saturation * 0.7 + (max / 255) * 0.3;
                    if (score > bestScore) {
                        bestScore = score;
                        best = [r, g, b];
                    }
                }
                if (!best || bestScore < 0.35) return root.style.removeProperty('--accent');
                const lift = Math.max(1, 170 / Math.max(...best));
                root.style.setProperty('--accent', 'rgb(' + best.map((c) => Math.min(255, Math.round(c * lift))).join(',') + ')');
            } catch {
                root.style.removeProperty('--accent');
            }
        };
        image.onerror = () => root.style.removeProperty('--accent');
        image.src = url;
    }

    // Громкость: читается при раскрытии, ползунок тянется мышью и колесом, значок выключает звук
    const volumeBox = $('volume');
    const volumeTrack = $('vol-track');
    let volume = -1;
    let volumeDrag = false;
    let volumeSentAt = 0;
    let volumeTimer = 0;
    function renderVolume(level) {
        if (typeof level !== 'number' || level < 0) {
            volumeBox.hidden = true;
            return;
        }
        volume = Math.max(0, Math.min(1, level));
        volumeBox.hidden = false;
        volumeBox.dataset.level = volume === 0 ? '0' : volume < 0.5 ? '1' : '2';
        $('vol-fill').style.setProperty('--v', String(volume));
        volumeTrack.setAttribute('aria-valuenow', String(Math.round(volume * 100)));
    }
    function readVolume() {
        if (api.volume) void api.volume().then((level) => !volumeDrag && renderVolume(level));
    }
    // Пока тянут, громкость уходит не чаще раза в 60 мс; последнее значение отправляется всегда
    function sendVolume(level) {
        renderVolume(level);
        clearTimeout(volumeTimer);
        const send = () => {
            volumeSentAt = Date.now();
            void api.volume(volume);
        };
        if (Date.now() - volumeSentAt >= 60) send();
        else volumeTimer = setTimeout(send, 60);
    }
    function volumeAt(event) {
        const rect = volumeTrack.getBoundingClientRect();
        return rect.width ? Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) : volume;
    }
    volumeTrack.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        volumeDrag = true;
        volumeTrack.classList.add('dragging');
        volumeTrack.setPointerCapture(event.pointerId);
        sendVolume(volumeAt(event));
    });
    volumeTrack.addEventListener('pointermove', (event) => volumeDrag && sendVolume(volumeAt(event)));
    const stopDrag = () => {
        volumeDrag = false;
        volumeTrack.classList.remove('dragging');
    };
    volumeTrack.addEventListener('pointerup', stopDrag);
    volumeTrack.addEventListener('pointercancel', stopDrag);
    volumeBox.addEventListener('wheel', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (volume < 0) return;
        sendVolume(Math.round((volume + (event.deltaY < 0 ? 0.05 : -0.05)) * 100) / 100);
    }, { passive: false });
    $('vol-mute').addEventListener('click', () => {
        if (api.volume) void api.volume('mute').then(renderVolume);
    });

    function setExpanded(on) {
        if (on && !expanded()) readVolume();
        island.dataset.state = on ? 'expanded' : 'compact';
        island.querySelector('.compact').setAttribute('aria-hidden', String(on));
        island.querySelector('.expanded').setAttribute('aria-hidden', String(!on));
        renderProgress();
        syncTicker();
    }
    function expanded() {
        return island.dataset.state === 'expanded';
    }
    function shouldStayOpen() {
        return hovered || pinned || Date.now() < announceUntil;
    }
    function scheduleCollapse(delay) {
        clearTimeout(collapseTimer);
        collapseTimer = setTimeout(() => {
            if (!shouldStayOpen()) setExpanded(false);
        }, delay);
    }

    function render() {
        if (!state) return;
        const track = state.track || {};
        const settings = state.settings || {};
        text = state.language === 'en' ? TEXT.en : TEXT.ru;
        root.lang = state.language === 'en' ? 'en' : 'ru';
        root.dataset.position = settings.position || 'center';
        root.classList.toggle('titled', settings.showTitle !== false);
        root.classList.toggle('playing', track.isPlaying === true);
        root.classList.toggle('reduce-motion', state.reduceMotion === true);
        root.classList.toggle('winter', state.winter === true);
        const art = artUrl(track.artwork);
        for (const id of ['art-sm', 'art-lg']) $(id).style.backgroundImage = art ? 'url("' + art.replace(/"/g, '%22') + '")' : '';
        pickAccent(art);
        $('title-sm').textContent = track.title || '';
        $('title').textContent = track.title || '';
        $('author').textContent = track.author || '';
        $('like').setAttribute('aria-pressed', String(track.isLiked === true));
        $('like').setAttribute('aria-label', text.like);
        $('play').setAttribute('aria-label', track.isPlaying ? text.pause : text.play);
        $('vol-mute').setAttribute('aria-label', text.mute);
        volumeTrack.setAttribute('aria-label', text.volume);
        for (const button of document.querySelectorAll('[data-act="open"]')) button.setAttribute('aria-label', text.open);
        for (const button of document.querySelectorAll('[data-act="previous"]')) button.setAttribute('aria-label', text.previous);
        for (const button of document.querySelectorAll('[data-act="next"]')) button.setAttribute('aria-label', text.next);
        island.title = [track.title, track.author].filter(Boolean).join(' — ');
        position = { elapsed: seconds(track.elapsed), duration: seconds(track.duration), at: Date.now(), playing: track.isPlaying === true };
        renderProgress();
        syncTicker();
        snow(state.winter === true && state.reduceMotion !== true);
    }

    // Прогресс тикает сам между обновлениями из main, но только пока плашка раскрыта и трек играет
    function renderProgress() {
        if (!expanded()) return;
        const passed = position.playing ? (Date.now() - position.at) / 1000 : 0;
        const elapsed = position.duration ? Math.min(position.duration, position.elapsed + passed) : position.elapsed + passed;
        $('elapsed').textContent = clock(elapsed);
        $('duration').textContent = position.duration ? clock(position.duration) : '—';
        $('fill').style.transform = 'scaleX(' + (position.duration ? Math.min(1, elapsed / position.duration) : 0) + ')';
    }
    function syncTicker() {
        const need = expanded() && position.playing;
        if (need && !ticker) ticker = setInterval(renderProgress, 1000);
        else if (!need && ticker) {
            clearInterval(ticker);
            ticker = 0;
        }
    }

    let snowOn = false;
    function snow(on) {
        if (on === snowOn) return;
        snowOn = on;
        const box = $('snow');
        box.textContent = '';
        if (!on) return;
        for (let i = 0; i < 14; i++) {
            const flake = document.createElement('i');
            const size = 1.6 + Math.random() * 2.2;
            flake.style.cssText = '--s:' + size.toFixed(1) + 'px;--d:' + (4.5 + Math.random() * 4).toFixed(1) + 's;--delay:-' + (Math.random() * 8).toFixed(1) + 's;--drift:' + Math.round(Math.random() * 24 - 12) + 'px;--o:' + (0.45 + Math.random() * 0.45).toFixed(2) + ';left:' + (Math.random() * 100).toFixed(1) + '%';
            box.append(flake);
        }
    }

    // Мышь: окно пропускает её насквозь, пока она не над плашкой; main переключает это по сигналу отсюда
    function inside(event) {
        const rect = island.getBoundingClientRect();
        return event.clientX >= rect.left - 2 && event.clientX <= rect.right + 2 && event.clientY >= rect.top - 2 && event.clientY <= rect.bottom + 2;
    }
    function setHovered(on) {
        if (on === hovered) return;
        hovered = on;
        api.hover(on);
        clearTimeout(expandTimer);
        if (on) {
            if (state?.settings?.expandOnHover !== false) expandTimer = setTimeout(() => hovered && setExpanded(true), 160);
        } else {
            pinned = false;
            scheduleCollapse(380);
        }
    }
    document.addEventListener('mousemove', (event) => setHovered(inside(event)));
    document.addEventListener('mouseleave', () => setHovered(false));
    document.addEventListener('click', (event) => {
        const target = event.target instanceof window.Element ? event.target.closest('[data-act]') : null;
        if (target && expanded()) {
            api.act(target.dataset.act);
            return;
        }
        // Без раскрытия по наведению плашка раскрывается кликом
        if (island.contains(event.target) && !expanded()) {
            pinned = true;
            setExpanded(true);
        }
    });
    document.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        if (island.contains(event.target)) api.act('menu');
    });
    // Колесо над раскрытой плашкой: вверх предыдущий, вниз следующий трек (с паузой, чтобы не пролистать очередь)
    let wheelAt = 0;
    island.addEventListener('wheel', (event) => {
        if (!expanded() || volumeBox.contains(event.target) || Math.abs(event.deltaY) < 20 || Date.now() - wheelAt < 600) return;
        wheelAt = Date.now();
        api.act(event.deltaY > 0 ? 'next' : 'previous');
    }, { passive: true });

    api.onState((next) => {
        state = next;
        render();
    });
    // Новый трек: плашка раскрывается на пару секунд и сама сворачивается
    api.onAnnounce(() => {
        announceUntil = Date.now() + 3200;
        setExpanded(true);
        scheduleCollapse(3300);
    });
    void api.state().then((initial) => {
        if (initial) {
            state = initial;
            render();
        }
        api.act('ready');
    });

    function demoApi() {
        const demo = {
            track: { title: 'Ночной город', author: 'SoundCloud 2', artwork: '', isPlaying: true, isLiked: false, elapsed: '1:12', duration: '3:24' },
            settings: { position: 'center', expandOnHover: true, showTitle: true },
            winter: true,
            reduceMotion: false,
            language: 'ru',
            volume: 0.6,
        };
        const listeners = [];
        return {
            state: () => Promise.resolve(demo),
            act: (act) => {
                if (act === 'toggle') demo.track.isPlaying = !demo.track.isPlaying;
                if (act === 'like') demo.track.isLiked = !demo.track.isLiked;
                listeners.forEach((listener) => listener(demo));
            },
            hover: () => undefined,
            volume: (value) => {
                if (value === 'mute') demo.volume = demo.volume ? 0 : 0.6;
                else if (typeof value === 'number') demo.volume = value;
                return Promise.resolve(demo.volume);
            },
            onState: (listener) => listeners.push(listener),
            onAnnounce: () => undefined,
        };
    }
})();
