// Режим «Для роликов» (2.9.0): обложка играющего трека на всё окно, чтобы снять видео для TikTok. Фон из той же обложки,
// размытый; поверх минимум: название, исполнитель, полоса времени. Вертикальный кадр 9:16 одной кнопкой, подписи
// и полоса прячутся, панель кнопок исчезает, пока мышь не двигается, и в ролик не попадает.
// Esc, кнопка «Закрыть» или повторное нажатие кнопки режима сворачивают обратно; F — полный экран, V — кадр 9:16,
// H — спрятать подписи, пробел — пауза.
// Раздел страницы волны: installClip уходит на страницу текстом (pageHelpers в wave.ts) и ни на что снаружи не ссылается
export interface ClipNow {
    title: string;
    artist: string;
    /** Обложка 500×500; крупнее страница пробует сама */
    art: string;
    /** 0..1 */
    progress: number;
    playing: boolean;
}
export interface ClipCore {
    lang: 'ru' | 'en';
    now(): ClipNow | null;
    togglePlay(): void;
    disposed(): boolean;
}
export interface ClipSection {
    /** Кнопка режима для карточки волны: каждый раз тот же узел */
    button(): HTMLButtonElement;
    open(): void;
    close(): void;
    isOpen(): boolean;
    /** Кнопка в нижнем баре, если сайт его перерисовал */
    sync(): void;
    dispose(): void;
}

/** Обложка крупнее: у SoundCloud картинка «original» лежит рядом с t500x500 */
export function clipArtwork(url: string): string {
    return /-t500x500\.(jpg|png)(\?|$)/.test(url) ? url.replace(/-t500x500\.(jpg|png)/, '-original.$1') : url;
}
/** Размер кадра 9:16 в окне: во всю высоту, а в узком окне во всю ширину */
export function verticalFrame(width: number, height: number): { width: number; height: number } {
    if (!(width > 0) || !(height > 0)) return { width: 0, height: 0 };
    const byHeight = Math.round((height * 9) / 16);
    return byHeight <= width ? { width: byHeight, height: Math.round(height) } : { width: Math.round(width), height: Math.round((width * 16) / 9) };
}

export function installClip(core: ClipCore): ClipSection {
    const ru = core.lang === 'ru';
    const T = ru
        ? { mode: 'Для роликов', open: 'Обложка на всё окно для роликов', close: 'Свернуть, Esc', vertical: 'Кадр 9:16, V', text: 'Подписи, H', full: 'Полный экран, F', nothing: 'Сейчас ничего не играет' }
        : { mode: 'For videos', open: 'Full-window cover for videos', close: 'Close, Esc', vertical: '9:16 frame, V', text: 'Captions, H', full: 'Full screen, F', nothing: 'Nothing is playing' };
    const ICON: Record<string, string> = {
        clip: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 1h7A1.5 1.5 0 0 1 13 2.5v11a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 13.5v-11A1.5 1.5 0 0 1 4.5 1zm.2 1.5v11h6.6v-11zM6.9 5.6l3.2 2.1-3.2 2.1z"/></svg>',
        close: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 2.4 8 6.9l4.5-4.5 1.1 1.1L9.1 8l4.5 4.5-1.1 1.1L8 9.1l-4.5 4.5-1.1-1.1L6.9 8 2.4 3.5z"/></svg>',
        vertical: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 1h6a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1zm.5 1.5v11h5v-11z"/></svg>',
        text: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 2.5h12V5h-1.5V4h-3.75v8.5H10V14H6v-1.5h1.25V4H3.5v1H2z"/></svg>',
        full: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 1.5H6V3H3v3H1.5zm8.5 0h4.5V6H13V3h-3zM1.5 10H3v3h3v1.5H1.5zm11.5 0h1.5v4.5H10V13h3z"/></svg>',
    };
    const STYLE_ID = 'sc-clip-style';
    if (!document.getElementById(STYLE_ID)) {
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = [
            '.scc{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;overflow:hidden;background:#05060a;color:#fff;font:600 14px/1.3 system-ui,-apple-system,"Segoe UI",sans-serif;opacity:0;transition:opacity .3s ease}',
            '.scc.on{opacity:1}',
            '.scc-bg{position:absolute;inset:-12%;background:center/cover no-repeat;filter:blur(60px) saturate(1.6) brightness(.55);transform:scale(1.1);transition:background-image .6s ease}',
            '.scc-bg::after{content:"";position:absolute;inset:0;background:radial-gradient(120% 90% at 50% 40%,transparent,rgba(0,0,0,.55))}',
            // Кадр: всё окно или вертикальный 9:16 по центру. Размер кадра ставит скрипт, внутри всё в долях кадра
            '.scc-frame{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:calc(var(--scc-h) * .035);box-sizing:border-box;padding:calc(var(--scc-h) * .06) calc(var(--scc-w) * .07);width:var(--scc-w);height:var(--scc-h);overflow:hidden}',
            '.scc.vertical .scc-frame{box-shadow:0 0 0 100vmax rgba(0,0,0,.55),0 30px 80px -20px rgba(0,0,0,.9)}',
            '.scc-art{position:relative;flex:none;width:min(calc(var(--scc-w) * .86),calc(var(--scc-h) * .62));aspect-ratio:1;border-radius:calc(var(--scc-h) * .018);background:center/cover no-repeat rgba(255,255,255,.06);box-shadow:0 40px 90px -30px rgba(0,0,0,.95),0 0 0 1px rgba(255,255,255,.08);transition:transform .5s cubic-bezier(.2,.8,.2,1)}',
            '.scc:not(.playing) .scc-art{transform:scale(.97)}',
            '.scc-text{width:100%;text-align:center;transition:opacity .25s ease}',
            '.scc-title{font-size:clamp(18px,calc(var(--scc-h) * .042),64px);line-height:1.15;font-weight:900;letter-spacing:-.02em;text-shadow:0 2px 20px rgba(0,0,0,.6);overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}',
            '.scc-artist{margin-top:.4em;font-size:clamp(13px,calc(var(--scc-h) * .026),36px);font-weight:700;color:rgba(255,255,255,.72);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
            '.scc-bar{width:min(100%,calc(var(--scc-h) * .62));height:max(3px,calc(var(--scc-h) * .005));border-radius:999px;background:rgba(255,255,255,.22);overflow:hidden;transition:opacity .25s ease}',
            '.scc-bar>i{display:block;height:100%;width:calc(var(--scc-p,0) * 100%);border-radius:inherit;background:#fff;transition:width .25s linear}',
            '.scc.bare .scc-text,.scc.bare .scc-bar{opacity:0}',
            // Панель кнопок: исчезает через 2 с без движения мыши, курсор тоже
            '.scc-tools{position:absolute;top:16px;right:16px;z-index:2;display:flex;gap:6px;padding:5px;border-radius:999px;background:rgba(10,11,16,.6);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);box-shadow:inset 0 0 0 1px rgba(255,255,255,.12);transition:opacity .25s ease,transform .25s ease}',
            '.scc.idle .scc-tools{opacity:0;transform:translateY(-6px);pointer-events:none}',
            '.scc.idle{cursor:none}',
            '.scc-tools button{all:unset;box-sizing:border-box;width:36px;height:36px;border-radius:999px;display:grid;place-items:center;cursor:pointer;color:rgba(255,255,255,.8);transition:background .15s,color .15s}',
            '.scc-tools button:hover{background:rgba(255,255,255,.14);color:#fff}',
            '.scc-tools button[aria-pressed="true"]{background:#fff;color:#0b0c10}',
            '.scc-tools button:focus-visible{outline:2px solid #fff;outline-offset:2px}',
            '.scc-tools svg{width:16px;height:16px;fill:currentColor}',
            '.scc-empty{font-size:18px;color:rgba(255,255,255,.7)}',
            // Кнопка режима в карточке и в баре
            '.scc-open{all:unset;box-sizing:border-box;width:32px;height:32px;border-radius:999px;display:inline-grid;place-items:center;flex:none;cursor:pointer;color:rgba(255,255,255,.75);transition:background-color .15s,color .15s,transform .15s}',
            '.scc-open:hover{background:rgba(255,255,255,.12);color:#fff}',
            '.scc-open:active{transform:scale(.9)}',
            '.scc-open:focus-visible{outline:2px solid var(--sc2-accent,#fff);outline-offset:2px}',
            '.scc-open svg{width:17px;height:17px;fill:currentColor}',
            '.playControls .scc-open{background:rgba(255,255,255,.06);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08);margin:0 4px}',
            '.playControls .scc-open svg{width:16px;height:16px}',
            'html.scm-reduce .scc,html.scm-reduce .scc *{transition:none!important}',
            '@media (prefers-reduced-motion:reduce){.scc,.scc *{transition:none!important}}',
        ].join('\n');
        document.head.append(style);
    }

    const opener = (): HTMLButtonElement => {
        const node = document.createElement('button');
        node.type = 'button';
        node.className = 'scc-open';
        node.dataset.clip = 'open';
        node.setAttribute('aria-label', T.open);
        node.title = T.open;
        node.innerHTML = ICON.clip;
        node.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (layer) close();
            else open();
        });
        return node;
    };
    let cardButton: HTMLButtonElement | null = null;
    let barButton: HTMLButtonElement | null = null;

    // Выбор кадра и подписей помнится между запусками режима
    const saved = (key: string): boolean => {
        try {
            return localStorage.getItem(key) === 'on';
        } catch {
            return false;
        }
    };
    const save = (key: string, on: boolean): void => {
        try {
            localStorage.setItem(key, on ? 'on' : 'off');
        } catch {
            // не сохранилось: до перезагрузки страницы
        }
    };
    let vertical = saved('sc2-clip-vertical');
    let bare = saved('sc2-clip-bare');

    let layer: HTMLElement | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    let shownArt = '';
    let returnFocus: HTMLElement | null = null;
    const tool = (act: string, label: string, icon: string): HTMLButtonElement => {
        const node = document.createElement('button');
        node.type = 'button';
        node.dataset.clip = act;
        node.setAttribute('aria-label', label);
        node.title = label;
        node.innerHTML = ICON[icon];
        return node;
    };
    function layout(): void {
        if (!layer) return;
        const size = vertical ? verticalFrame(window.innerWidth, window.innerHeight) : { width: window.innerWidth, height: window.innerHeight };
        layer.style.setProperty('--scc-w', size.width + 'px');
        layer.style.setProperty('--scc-h', size.height + 'px');
        layer.classList.toggle('vertical', vertical);
        layer.classList.toggle('bare', bare);
        layer.querySelector('[data-clip="vertical"]')?.setAttribute('aria-pressed', String(vertical));
        layer.querySelector('[data-clip="text"]')?.setAttribute('aria-pressed', String(!bare));
    }
    function paint(): void {
        if (!layer || core.disposed()) return;
        const now = core.now();
        const frame = layer.querySelector<HTMLElement>('.scc-frame');
        if (!frame) return;
        layer.classList.toggle('playing', !!now?.playing);
        if (!now) {
            if (!frame.querySelector('.scc-empty')) {
                frame.textContent = '';
                const empty = document.createElement('div');
                empty.className = 'scc-empty';
                empty.textContent = T.nothing;
                frame.append(empty);
            }
            return;
        }
        if (!frame.querySelector('.scc-art')) {
            frame.textContent = '';
            const art = document.createElement('div');
            art.className = 'scc-art';
            const text = document.createElement('div');
            text.className = 'scc-text';
            const title = document.createElement('div');
            title.className = 'scc-title';
            const artist = document.createElement('div');
            artist.className = 'scc-artist';
            text.append(title, artist);
            const bar = document.createElement('div');
            bar.className = 'scc-bar';
            bar.append(document.createElement('i'));
            frame.append(art, text, bar);
        }
        const title = frame.querySelector<HTMLElement>('.scc-title');
        const artist = frame.querySelector<HTMLElement>('.scc-artist');
        if (title && title.textContent !== now.title) title.textContent = now.title;
        if (artist && artist.textContent !== now.artist) artist.textContent = now.artist;
        frame.querySelector<HTMLElement>('.scc-bar')?.style.setProperty('--scc-p', String(Math.max(0, Math.min(1, now.progress))));
        if (now.art !== shownArt) {
            shownArt = now.art;
            const cover = (url: string): string => (url ? 'url("' + url.replace(/["\\]/g, '') + '")' : 'none');
            const art = frame.querySelector<HTMLElement>('.scc-art');
            const bg = layer.querySelector<HTMLElement>('.scc-bg');
            if (art) art.style.backgroundImage = cover(now.art);
            if (bg) bg.style.backgroundImage = cover(now.art);
            // Крупная обложка подменяет 500×500, когда загрузится; нет её — остаётся 500×500
            const big = clipArtwork(now.art);
            if (big !== now.art) {
                const probe = new Image();
                probe.onload = () => {
                    if (shownArt !== now.art || !layer) return;
                    if (art) art.style.backgroundImage = cover(big);
                };
                probe.src = big;
            }
        }
    }
    const wake = (): void => {
        if (!layer) return;
        layer.classList.remove('idle');
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => layer?.classList.add('idle'), 2000);
    };
    const onKey = (event: KeyboardEvent): void => {
        if (!layer || event.ctrlKey || event.metaKey || event.altKey) return;
        const key = event.key.toLowerCase();
        if (event.key === 'Escape') {
            // В полном экране Esc сначала выходит из него сам браузер
            if (document.fullscreenElement) return;
            event.preventDefault();
            close();
        } else if (key === 'v' || key === 'м') toggleVertical();
        else if (key === 'h' || key === 'р') toggleText();
        else if (key === 'f' || key === 'а') void toggleFull();
        else if (event.key === ' ') core.togglePlay();
        else return;
        event.preventDefault();
        event.stopPropagation();
        wake();
    };
    function toggleVertical(): void {
        vertical = !vertical;
        save('sc2-clip-vertical', vertical);
        layout();
    }
    function toggleText(): void {
        bare = !bare;
        save('sc2-clip-bare', bare);
        layout();
    }
    async function toggleFull(): Promise<void> {
        try {
            if (document.fullscreenElement) await document.exitFullscreen();
            else await layer?.requestFullscreen?.();
        } catch {
            // полный экран запрещён: остаётся на всё окно
        }
    }
    function open(): void {
        if (layer || core.disposed()) return;
        returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        layer = document.createElement('div');
        layer.className = 'scc';
        layer.setAttribute('role', 'dialog');
        layer.setAttribute('aria-modal', 'true');
        layer.setAttribute('aria-label', T.mode);
        const bg = document.createElement('div');
        bg.className = 'scc-bg';
        const frame = document.createElement('div');
        frame.className = 'scc-frame';
        const tools = document.createElement('div');
        tools.className = 'scc-tools';
        tools.append(tool('vertical', T.vertical, 'vertical'), tool('text', T.text, 'text'), tool('full', T.full, 'full'), tool('close', T.close, 'close'));
        tools.addEventListener('click', (event) => {
            const control = (event.target as Element | null)?.closest<HTMLElement>('[data-clip]');
            switch (control?.dataset.clip) {
                case 'vertical': toggleVertical(); break;
                case 'text': toggleText(); break;
                case 'full': void toggleFull(); break;
                case 'close': close(); break;
            }
        });
        // Щелчок по обложке ставит на паузу и снова включает
        frame.addEventListener('click', (event) => {
            if ((event.target as Element | null)?.closest('.scc-art')) core.togglePlay();
        });
        layer.append(bg, frame, tools);
        document.body.append(layer);
        layer.addEventListener('pointermove', wake);
        window.addEventListener('keydown', onKey, true);
        window.addEventListener('resize', layout);
        shownArt = '';
        layout();
        paint();
        wake();
        void layer.offsetWidth;
        layer.classList.add('on');
        tools.querySelector<HTMLElement>('[data-clip="close"]')?.focus({ preventScroll: true });
        timer = setInterval(paint, 250);
        for (const node of [cardButton, barButton]) node?.setAttribute('aria-pressed', 'true');
    }
    function close(): void {
        if (!layer) return;
        const node = layer;
        layer = null;
        clearInterval(timer);
        clearTimeout(idleTimer);
        window.removeEventListener('keydown', onKey, true);
        window.removeEventListener('resize', layout);
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
        node.remove();
        for (const button of [cardButton, barButton]) button?.setAttribute('aria-pressed', 'false');
        if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
        returnFocus = null;
    }
    function sync(): void {
        if (core.disposed()) return;
        // Кнопка в баре рядом с громкостью: обложку на всё окно можно открыть с любой страницы сайта
        const host = document.querySelector('.playControls .scv[data-kind="bar"]')?.parentElement;
        if (!host) return;
        barButton ??= opener();
        const volume = host.querySelector('.scv[data-kind="bar"]');
        if (barButton.parentElement !== host || barButton.nextElementSibling !== volume) host.insertBefore(barButton, volume);
    }
    return {
        button() {
            cardButton ??= opener();
            cardButton.setAttribute('aria-pressed', String(!!layer));
            return cardButton;
        },
        open,
        close,
        isOpen: () => !!layer,
        sync,
        dispose() {
            close();
            cardButton?.remove();
            barButton?.remove();
            document.getElementById(STYLE_ID)?.remove();
        },
    };
}
