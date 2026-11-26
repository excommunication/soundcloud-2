// Остров: рисует то, что прислал main, раскрывается при наведении и на смене трека, ловит мышь только над плашкой
(() => {
    const root = document.documentElement;
    const island = document.getElementById('island');
    const $ = (id) => document.getElementById(id);
    // Без preload (открыт как файл для проверки вёрстки) остров показывает пример
    const api = window.islandAPI || demoApi();

    const TEXT = {
        ru: { open: 'Открыть SoundCloud 2', like: 'Лайк', play: 'Играть', pause: 'Пауза', previous: 'Предыдущий', next: 'Следующий', mute: 'Звук вкл/выкл', volume: 'Громкость', more: 'Ещё', hide: 'Скрыть до следующего трека', hideShort: 'Скрыть', seek: 'Перемотка' },
        en: { open: 'Open SoundCloud 2', like: 'Like', play: 'Play', pause: 'Pause', previous: 'Previous', next: 'Next', mute: 'Mute/unmute', volume: 'Volume', more: 'More', hide: 'Hide until next track', hideShort: 'Hide', seek: 'Seek' },
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
    let shownKey = '';
    let shownArt = '';
    let shownArtLg = '';
    let artLgFor = '';
    let backAt = 0;

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

    // Крупную обложку ставим, только когда она загрузилась: пока грузится (или нет такого размера), остаётся маленькая
    function showLarge(large, small, css) {
        if (large === artLgFor) return;
        artLgFor = large;
        shownArtLg = small;
        for (const id of ['art-lg', 'backdrop']) $(id).style.backgroundImage = small;
        if (!large || css(large) === small) return;
        const probe = new window.Image();
        probe.onload = () => {
            if (artLgFor !== large) return;
            shownArtLg = css(large);
            for (const id of ['art-lg', 'backdrop']) $(id).style.backgroundImage = shownArtLg;
        };
        probe.src = large;
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
        volumeTrack.style.setProperty('--p', String(volume));
        volumeTrack.setAttribute('aria-valuenow', String(Math.round(volume * 100)));
        $('vol-out').textContent = String(Math.round(volume * 100));
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
        // Захват может не удаться (нажатие уже закончилось): ползунок всё равно должен сработать по клику
        try {
            volumeTrack.setPointerCapture(event.pointerId);
        } catch { /* без захвата тянется, пока мышь над полосой */ }
        sendVolume(volumeAt(event));
    });
    const stopDrag = () => {
        volumeDrag = false;
        volumeTrack.classList.remove('dragging');
    };
    volumeTrack.addEventListener('pointermove', (event) => {
        if (!volumeDrag) return;
        // Кнопку отпустили мимо страницы: тянуть дальше нельзя
        if (!(event.buttons & 1)) return stopDrag();
        sendVolume(volumeAt(event));
    });
    volumeTrack.addEventListener('pointerup', stopDrag);
    volumeTrack.addEventListener('pointercancel', stopDrag);
    volumeTrack.addEventListener('lostpointercapture', stopDrag);
    volumeBox.addEventListener('wheel', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (volume < 0) return;
        sendVolume(Math.round((volume + (event.deltaY < 0 ? 0.05 : -0.05)) * 100) / 100);
    }, { passive: false });
    $('vol-mute').addEventListener('click', () => {
        if (api.volume) void api.volume('mute').then(renderVolume);
    });


    // Перемотка: зажать полосу и вести мышью, как в нижнем баре. Пока тянут, за мышью идёт только полоса (раз в кадр),
    // а плеер перематывается один раз, когда отпустили: перемотка на каждом шаге заставляла сайт дёргать звук, и всё лагало
    const seekTrack = $('seek');
    let seeking = false;
    let seekFrame = 0;
    let seekWant = 0;
    function seekAt(event) {
        const rect = seekTrack.getBoundingClientRect();
        return rect.width ? Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) : 0;
    }
    function seekTo(fraction, final) {
        seekWant = fraction;
        if (final) {
            cancelAnimationFrame(seekFrame);
            seekFrame = 0;
            position = { ...position, elapsed: position.duration * fraction, at: Date.now() };
            renderProgress();
            api.seek(fraction);
            // Плеер отвечает не сразу: старое время из main первые мгновения не должно отбрасывать полосу назад
            seekHoldUntil = Date.now() + 900;
            return;
        }
        if (seekFrame) return;
        seekFrame = requestAnimationFrame(() => {
            seekFrame = 0;
            position = { ...position, elapsed: position.duration * seekWant, at: Date.now() };
            renderProgress();
        });
    }
    let seekHoldUntil = 0;
    seekTrack.addEventListener('pointerdown', (event) => {
        if (event.button !== 0 || !position.duration) return;
        event.stopPropagation();
        seeking = true;
        island.classList.add('seeking');
        island.classList.remove('live');
        try {
            seekTrack.setPointerCapture(event.pointerId);
        } catch { /* без захвата тянется, пока мышь над полосой */ }
        seekTo(seekAt(event), false);
    });
    seekTrack.addEventListener('pointermove', (event) => {
        if (!seeking) return;
        // Кнопку отпустили мимо страницы: перемотать туда, где отпустили, и закончить
        if (!(event.buttons & 1)) return stopSeek(event);
        seekTo(seekAt(event), false);
    });
    const stopSeek = (event) => {
        if (!seeking) return;
        seeking = false;
        island.classList.remove('seeking');
        seekTo(seekAt(event), true);
        settleProgress();
    };
    seekTrack.addEventListener('pointerup', stopSeek);
    seekTrack.addEventListener('pointercancel', stopSeek);
    seekTrack.addEventListener('lostpointercapture', stopSeek);

    // Режим совместимости NVIDIA: окно без прозрачности обрезается по плашке, поэтому main должен знать её размер.
    // Там размер меняется сразу, без пружины: обрезка не успевала бы за анимацией
    let shapeKey = '';
    // Прямоугольник плашки нужен main и без обрезки: по нему он понимает, ушёл ли курсор (сквозной режим)
    let shapeLate = 0;
    function reportShape() {
        if (!api.shape) return;
        // Без обрезки размер меняется пружиной: второй замер, когда она доехала
        if (!state?.shaped) {
            clearTimeout(shapeLate);
            shapeLate = setTimeout(() => {
                shapeKey = '';
                measureShape();
            }, 650);
        }
        measureShape();
    }
    function measureShape() {
        requestAnimationFrame(() => {
            const rect = island.getBoundingClientRect();
            const radius = parseFloat(window.getComputedStyle(island).borderTopLeftRadius) || 0;
            const shape = { x: rect.left, y: rect.top, width: rect.width, height: rect.height, radius };
            const key = JSON.stringify(shape);
            if (key === shapeKey) return;
            shapeKey = key;
            api.shape(shape);
        });
    }
    window.addEventListener('resize', () => {
        shapeKey = '';
        reportShape();
    });

    function setExpanded(on) {
        if (on && dragging) return;
        if (on && !expanded()) readVolume();
        island.dataset.state = on ? 'expanded' : 'compact';
        reportShape();
        renderProgress();
        settleProgress();
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

    // Вид плашки: стекло, чёрная, белая, свой цвет, градиент. Цвет текста (светлый/тёмный) выбирается по яркости фона
    const HEX = /^#[0-9a-f]{6}$/i;
    function luminance(hex) {
        const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }
    // Цвет #rrggbb с прозрачностью; при alpha 1 остаётся как есть
    function withAlpha(hex, alpha) {
        if (alpha >= 1) return hex;
        const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
        return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
    }
    function applyLook(settings, shaped) {
        const look = ['glass', 'black', 'white', 'color', 'gradient'].includes(settings.look) ? settings.look : 'glass';
        const first = HEX.test(settings.color) ? settings.color : '#2b1055';
        const second = HEX.test(settings.color2) ? settings.color2 : '#ff5500';
        root.dataset.look = look;
        let light = look === 'white';
        if (look === 'color') light = luminance(first) > 0.6;
        if (look === 'gradient') light = (luminance(first) + luminance(second)) / 2 > 0.6;
        root.dataset.tone = light ? 'light' : 'dark';
        // Непрозрачность только в прозрачном окне: в режиме совместимости (shaped) фон за плашкой чёрный и сквозь неё не виден
        const alpha = shaped || !(settings.opacity >= 0.3 && settings.opacity <= 1) ? 1 : settings.opacity;
        if (look === 'white') root.style.setProperty('--island-bg', withAlpha('#f5f5f7', alpha));
        else if (look === 'black') root.style.setProperty('--island-bg', withAlpha('#000000', alpha));
        else if (look === 'color') root.style.setProperty('--island-bg', withAlpha(first, alpha));
        else if (look === 'gradient') root.style.setProperty('--island-bg', 'linear-gradient(135deg,' + withAlpha(first, alpha) + ',' + withAlpha(second, alpha) + ')');
        else root.style.removeProperty('--island-bg');
    }

    function render() {
        if (!state) return;
        const track = state.track || {};
        const settings = state.settings || {};
        text = state.language === 'en' ? TEXT.en : TEXT.ru;
        root.lang = state.language === 'en' ? 'en' : 'ru';
        root.dataset.position = settings.position || 'center';
        root.dataset.layout = settings.layout === 'cover' ? 'cover' : 'classic';
        applyLook(settings, state.shaped === true);
        root.classList.toggle('titled', settings.showTitle !== false);
        root.classList.toggle('playing', track.isPlaying === true);
        root.classList.toggle('reduce-motion', state.reduceMotion === true);
        root.classList.toggle('winter', state.winter === true);
        root.classList.toggle('shaped', state.shaped === true);
        const art = artUrl(track.artwork);
        const key = (track.title || '') + '\n' + (track.author || '');
        if (shownKey && track.title && key !== shownKey) switchTrack(shownArt, shownArtLg, Date.now() - backAt < 4000 ? -1 : 1);
        if (track.title) shownKey = key;
        const css = (url) => (url ? 'url("' + url.replace(/"/g, '%22') + '")' : '');
        const image = css(art);
        shownArt = image;
        $('art-sm').style.backgroundImage = image;
        // Большая обложка и фон берут 500x500: у плеера сайта обложка 50x50 и в 116 px была мыльной
        showLarge(artUrl(track.artworkLarge) || art, image, css);
        pickAccent(art);
        $('title-sm').textContent = track.title || '';
        $('title').textContent = track.title || '';
        $('author').textContent = track.author || '';
        $('like').setAttribute('aria-pressed', String(track.isLiked === true));
        $('like').setAttribute('aria-label', text.like);
        $('play').setAttribute('aria-label', track.isPlaying ? text.pause : text.play);
        $('vol-mute').setAttribute('aria-label', text.mute);
        $('more').setAttribute('aria-label', text.more);
        $('hide').setAttribute('aria-label', text.hide);
        $('hide').title = text.hide;
        $('hide-label').textContent = text.hideShort;
        $('seek').setAttribute('aria-label', text.seek);
        volumeTrack.setAttribute('aria-label', text.volume);
        for (const button of document.querySelectorAll('[data-act="open"]')) button.setAttribute('aria-label', text.open);
        for (const button of document.querySelectorAll('[data-act="previous"]')) button.setAttribute('aria-label', text.previous);
        for (const button of document.querySelectorAll('[data-act="next"]')) button.setAttribute('aria-label', text.next);
        island.title = [track.title, track.author].filter(Boolean).join(' — ');
        const next = { elapsed: seconds(track.elapsed), duration: seconds(track.duration), at: Date.now(), playing: track.isPlaying === true };
        // Трек сменился или перемотали: без плавного хода, чтобы линия не ехала назад
        if (Math.abs(next.elapsed - position.elapsed - (position.playing ? (next.at - position.at) / 1000 : 0)) > 2.5 || next.duration !== position.duration) settleProgress();
        if (!seeking && !(Date.now() < seekHoldUntil && Math.abs(next.elapsed - position.elapsed) > 2.5)) position = next;
        setLyrics(root.dataset.layout === 'cover' && Array.isArray(state.lyrics) ? state.lyrics : []);
        renderProgress();
        syncTicker();
        snow(state.winter === true && state.reduceMotion !== true);
        reportShape();
    }

    // Прогресс тикает сам между обновлениями из main, но только пока плашка раскрыта и трек играет
    function renderProgress() {
        const passed = position.playing ? (Date.now() - position.at) / 1000 : 0;
        const elapsed = position.duration ? Math.min(position.duration, position.elapsed + passed) : position.elapsed + passed;
        const ratio = position.duration ? Math.min(1, elapsed / position.duration) : 0;
        const share = 'scaleX(' + ratio + ')';
        $('seek').style.setProperty('--p', String(ratio));
        // Линия в свёрнутой плашке считается всегда, поэтому при раскрытии полоса уже на месте и не «догоняет»
        $('mini-fill').style.transform = share;
        $('fill').style.transform = share;
        if (!expanded()) return;
        syncLyric(elapsed);
        $('elapsed').textContent = clock(elapsed);
        $('duration').textContent = position.duration ? clock(position.duration) : '—';
    }
    // Текст песни (только «Большая обложка»): main присылает строки один раз на трек, текущую выбирает остров по своим часам.
    // Следующая смена строки ставится таймером на её время, чтобы строка не опаздывала до секунды тиков
    let lyrics = [];
    let lyricShown = -2;
    let lyricTimer = 0;
    function setLyrics(lines) {
        const clean = lines.filter((line) => line && typeof line.at === 'number' && typeof line.text === 'string');
        // Те же строки приходят с каждым обновлением состояния: сравниваем по длине и краям, а не по ссылке
        const same = clean.length === lyrics.length && (!clean.length || (clean[0].at === lyrics[0].at && clean[clean.length - 1].at === lyrics[lyrics.length - 1].at && clean[0].text === lyrics[0].text));
        if (same) return;
        lyrics = clean;
        lyricShown = -2;
        root.classList.toggle('lyric-on', clean.length > 0);
        if (!clean.length) {
            clearTimeout(lyricTimer);
            $('lyric-now').textContent = $('lyric-next').textContent = '';
        }
    }
    function syncLyric(elapsed) {
        clearTimeout(lyricTimer);
        if (!lyrics.length) return;
        const ms = elapsed * 1000 + 120;
        // Последняя строка, начавшаяся до сейчас (бинарный поиск: строк сотни, а вызов идёт на каждый кадр перемотки)
        let low = 0;
        let high = lyrics.length - 1;
        let index = -1;
        while (low <= high) {
            const mid = (low + high) >> 1;
            if (lyrics[mid].at <= ms) {
                index = mid;
                low = mid + 1;
            } else high = mid - 1;
        }
        if (index !== lyricShown) {
            const changed = lyricShown !== -2;
            lyricShown = index;
            const now = $('lyric-now');
            now.textContent = index >= 0 ? lyrics[index].text : '';
            $('lyric-next').textContent = lyrics[index + 1] ? lyrics[index + 1].text : '';
            if (changed && state?.reduceMotion !== true && !state?.shaped && now.animate) now.animate([{ opacity: 0.2, transform: 'translateY(5px)' }, { opacity: 1, transform: 'none' }], { duration: 240, easing: 'ease-out' });
        }
        const next = lyrics[index + 1];
        if (next && position.playing && expanded()) lyricTimer = setTimeout(renderProgress, Math.max(30, next.at - ms + 10));
    }

    // Удар в треке: короткий толчок полосок поверх их обычной анимации. Анимируется обёртка .bars (WAAPI), а не сами
    // полоски: их keyframes `bar` остаются нетронутыми и ползут дальше. Нет ударов, ничего не приходит, и полоски просто ползут
    let kickAt = 0;
    api.onBeat?.((strength) => {
        if (state?.reduceMotion === true || state?.shaped === true || state?.track?.isPlaying !== true || document.hidden) return;
        const now = window.performance.now();
        if (now - kickAt < 110) return;
        kickAt = now;
        const box = island.querySelector(expanded() ? '.bars.big' : '.compact .bars');
        if (!box || !box.animate) return;
        box.animate([{ transform: 'scaleY(' + (1 + 0.35 + 0.35 * strength).toFixed(2) + ')', filter: 'brightness(1.5)' }, { transform: 'scaleY(1)', filter: 'brightness(1)' }], { duration: 280, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)' });
    });

    // Плавный ход полосы включается только после того, как она встала на место: иначе при раскрытии она ползла бы с нуля
    let liveFrame = 0;
    function settleProgress() {
        island.classList.remove('live');
        cancelAnimationFrame(liveFrame);
        liveFrame = requestAnimationFrame(() => {
            liveFrame = requestAnimationFrame(() => island.classList.add('live'));
        });
    }
    function syncTicker() {
        const need = position.playing;
        if (need && !ticker) ticker = setInterval(renderProgress, 1000);
        else if (!need && ticker) {
            clearInterval(ticker);
            ticker = 0;
        }
    }

    // Смена трека: старая обложка улетает карточкой в сторону, новая влетает с пружиной, текст выезжает снизу,
    // плашка подпрыгивает и по ней проходит блик цвета обложки. Всё на transform/opacity, без пересчёта вёрстки
    let switchTimer = 0;
    function switchTrack(oldImage, oldLarge, direction) {
        if (state?.reduceMotion === true || state?.shaped === true) return;
        const name = direction < 0 ? 'switch-prev' : 'switch-next';
        island.classList.remove('switch-next', 'switch-prev');
        void island.offsetWidth;
        island.classList.add(name);
        clearTimeout(switchTimer);
        switchTimer = setTimeout(() => island.classList.remove('switch-next', 'switch-prev'), 900);
        if (!oldImage) return;
        for (const id of ['art-sm', 'art-lg']) {
            const art = $(id);
            const old = id === 'art-lg' ? oldLarge || oldImage : oldImage;
            if (!art.offsetWidth) continue;
            const ghost = document.createElement('div');
            ghost.className = 'art-ghost ' + (direction < 0 ? 'prev' : 'next');
            ghost.style.cssText = 'left:' + art.offsetLeft + 'px;top:' + art.offsetTop + 'px;width:' + art.offsetWidth + 'px;height:' + art.offsetHeight + 'px;border-radius:' + window.getComputedStyle(art).borderTopLeftRadius;
            ghost.style.backgroundImage = old;
            art.parentElement.append(ghost);
            setTimeout(() => ghost.remove(), 600);
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
    // Сквозной режим: на свёрнутую плашку курсор сначала заходит «призраком» — main делает её бледной и пропускает клики
    // насквозь, пока курсор движется. Остановился — main присылает wake, плашка оживает и раскрывается
    let ghosting = false;
    // main мог не начать «призрак» (идёт перетаскивание) и тогда не пришлёт ни wake, ни sleep: без сторожа ghosting
    // остался бы true навсегда, и страница перестала бы сообщать main, что курсор над плашкой
    let ghostGuard = 0;
    function setHovered(on) {
        if (ghosting) return;
        if (on === hovered) return;
        if (on && !expanded() && !pinned) {
            ghosting = true;
            clearTimeout(ghostGuard);
            ghostGuard = setTimeout(() => {
                ghosting = false;
            }, 1500);
            api.hover('ghost');
            return;
        }
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
    // Перетаскивание: зажать плашку и повести дальше 5 px. Окно двигает main за курсором, страница говорит только
    // «началось» и «отпустили». Кнопки, ползунки и клик без сдвига работают как обычно
    let press = null;
    let dragging = false;
    // После настоящего перетаскивания клик в конце не считается. Флаг сбрасывается на следующем нажатии, а не по таймеру:
    // нажатие всегда раньше клика, поэтому устаревшим флаг остаться не может
    let swallowClick = false;
    let hoverSyncAt = 0;
    function endDragState() {
        dragging = false;
        press = null;
        island.classList.remove('dragging');
    }
    // Любое новое нажатие левой кнопкой начинается с чистого листа, в том числе на ползунках (они гасят всплытие)
    document.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        swallowClick = false;
        // Новое нажатие не бывает посреди перетаскивания: значит, его конец потерялся
        if (dragging) {
            endDragState();
            api.drag('end');
        }
        // Нажатие дошло до страницы: окно точно ловит мышь, «призрак» не нужен. Напомнить об этом main
        if (ghosting || !hovered) {
            ghosting = false;
            clearTimeout(ghostGuard);
            hovered = true;
            clearTimeout(collapseTimer);
            api.hover(true);
        }
    }, true);
    island.addEventListener('pointerdown', (event) => {
        // Кнопки тоже могут начать перетаскивание (в раскрытой плашке почти всё кнопки): клик без сдвига остаётся кликом
        if (event.button !== 0 || (event.target instanceof window.Element && event.target.closest('.vol-track, .track'))) return;
        press = { x: event.screenX, y: event.screenY, id: event.pointerId };
        api.drag('press');
    });
    api.onDragState?.((on) => {
        if (on) {
            swallowClick = true;
            if (dragging) return;
            dragging = true;
            clearTimeout(expandTimer);
            island.classList.add('dragging');
            setExpanded(false);
        } else {
            endDragState();
        }
    });
    api.onWake?.((wake) => {
        ghosting = false;
        clearTimeout(ghostGuard);
        if (wake) {
            hovered = true;
            clearTimeout(collapseTimer);
            if (state?.settings?.expandOnHover !== false) setExpanded(true);
        } else {
            hovered = false;
            pinned = false;
            scheduleCollapse(380);
        }
    });
    island.addEventListener('pointermove', (event) => {
        if (!press || dragging || event.pointerId !== press.id) return;
        // Кнопка уже отпущена, а отпускание страница не услышала: это не перетаскивание
        if (!(event.buttons & 1)) {
            press = null;
            return;
        }
        if (Math.hypot(event.screenX - press.x, event.screenY - press.y) < 5) return;
        dragging = true;
        swallowClick = true;
        clearTimeout(expandTimer);
        try {
            island.setPointerCapture(event.pointerId);
        } catch { /* main и так ведёт окно */ }
        island.classList.add('dragging');
        setExpanded(false);
        api.drag('start');
    });
    const release = (event) => {
        if (!press || event.pointerId !== press.id) return;
        const was = dragging;
        endDragState();
        if (was) api.drag('end');
    };
    island.addEventListener('pointerup', release);
    island.addEventListener('pointercancel', release);

    document.addEventListener('mousemove', (event) => {
        if (dragging) return;
        const on = inside(event);
        setHovered(on);
        // Окно могло остаться сквозным, пока страница считает курсор над плашкой (main потерял сигнал): напомнить, не чаще раза в 300 мс
        if (on && hovered && !ghosting && Date.now() - hoverSyncAt > 300) {
            hoverSyncAt = Date.now();
            api.hover(true);
        }
    });
    // Во время перетаскивания окно едет за курсором с запозданием, курсор может на миг выйти за плашку: это не уход
    document.addEventListener('mouseleave', () => !dragging && setHovered(false));
    document.addEventListener('click', (event) => {
        if (swallowClick) {
            swallowClick = false;
            return;
        }
        const target = event.target instanceof window.Element ? event.target.closest('[data-act]') : null;
        if (target && expanded()) {
            if (target.dataset.act === 'previous') backAt = Date.now();
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
        if (event.deltaY < 0) backAt = Date.now();
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
        const wakeListeners = [];
        return {
            state: () => Promise.resolve(demo),
            act: (act) => {
                if (act === 'toggle') demo.track.isPlaying = !demo.track.isPlaying;
                if (act === 'like') demo.track.isLiked = !demo.track.isLiked;
                if (act === 'next' || act === 'previous') {
                    demo.n = (demo.n || 0) + (act === 'next' ? 1 : -1);
                    demo.track = { ...demo.track, title: ['Ночной город', 'Северное сияние', 'Под водой'][((demo.n % 3) + 3) % 3], author: 'SoundCloud 2 · ' + demo.n, elapsed: '0:00' };
                }
                listeners.forEach((listener) => listener(demo));
            },
            hover: (on) => {
                if (on === 'ghost') setTimeout(() => wakeListeners.forEach((listener) => listener(true)), 380);
            },
            onDragState: () => undefined,
            onWake: (listener) => wakeListeners.push(listener),
            drag: () => undefined,
            shape: () => undefined,
            seek: () => undefined,
            volume: (value) => {
                if (value === 'mute') demo.volume = demo.volume ? 0 : 0.6;
                else if (typeof value === 'number') demo.volume = value;
                return Promise.resolve(demo.volume);
            },
            onState: (listener) => listeners.push(listener),
            onAnnounce: () => undefined,
            onBeat: () => undefined,
        };
    }
})();
