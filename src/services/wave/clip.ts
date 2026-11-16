// Режим «Для роликов» (2.9.0, 2.10.0): обложка играющего трека на всё окно, чтобы снять видео для TikTok. Фон из той же
// обложки, размытый; поверх минимум: название, исполнитель, полоса времени. Вертикальный кадр 9:16 одной кнопкой.
// 2.10.0: текст песни прямо на обложке в двух стилях (L): «Поток» — строки едут снизу вверх, слова загораются в такт;
// «Удар» — одна строка крупно, слова выпрыгивают по одному. Обложка трясётся и дышит под бит (удар баса из переливов,
// --sca-kick и --sca-sx/sy), а на каждой новой строке даёт толчок, даже если переливы выключены. Перемотка: полоса
// времени тянется и щёлкается, колесо мыши и стрелки ←/→ по 5 с (Shift — 15 с), щелчок по строке текста — к ней.
// Esc, кнопка «Закрыть» или повторное нажатие кнопки режима сворачивают обратно; F — полный экран, V — кадр 9:16,
// H — спрятать подписи, L — стиль текста, пробел — пауза.
// Раздел страницы волны: installClip уходит на страницу текстом (pageHelpers в wave.ts) и ни на что снаружи не ссылается
export interface ClipWord {
    at: number;
    text: string;
}
export interface ClipLine {
    at: number;
    text: string;
    words: ClipWord[];
}
export interface ClipLyrics {
    /** Строки с временем; null — текст без времени */
    lines: ClipLine[] | null;
    plain: string;
}
export interface ClipNow {
    id: number;
    title: string;
    artist: string;
    /** Обложка 500×500; крупнее страница пробует сама */
    art: string;
    /** 0..1 */
    progress: number;
    positionMs: number;
    durationMs: number;
    playing: boolean;
    /** undefined — ещё ищется, null — не нашлось */
    lyrics: ClipLyrics | null | undefined;
}
export interface ClipCore {
    lang: 'ru' | 'en';
    now(): ClipNow | null;
    togglePlay(): void;
    seek(ms: number): void;
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
export type ClipLyricStyle = 'flow' | 'punch' | 'off';

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
/** Номер строки, которая уже началась к моменту ms; -1 до первой */
export function clipLineAt(lines: Array<{ at: number }>, ms: number): number {
    let lo = 0;
    let hi = lines.length - 1;
    let found = -1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (lines[mid].at <= ms) {
            found = mid;
            lo = mid + 1;
        } else hi = mid - 1;
    }
    return found;
}
/** Перемотка на delta мс в пределах трека */
export function clipSeekStep(position: number, duration: number, delta: number): number {
    if (!(duration > 0)) return 0;
    return Math.max(0, Math.min(duration - 250, position + delta));
}
/** Следующий стиль текста по кругу: поток → удар → без текста */
export function clipNextStyle(style: string): ClipLyricStyle {
    return style === 'flow' ? 'punch' : style === 'punch' ? 'off' : 'flow';
}

export function installClip(core: ClipCore): ClipSection {
    const ru = core.lang === 'ru';
    const T = ru
        ? { mode: 'Для роликов', open: 'Обложка на всё окно для роликов', close: 'Свернуть, Esc', vertical: 'Кадр 9:16, V', text: 'Подписи, H', full: 'Полный экран, F', nothing: 'Сейчас ничего не играет', lyrics: 'Текст: {style}, L', flow: 'поток', punch: 'удар', off: 'выключен', searching: 'Ищу текст…', seek: 'Перемотка' }
        : { mode: 'For videos', open: 'Full-window cover for videos', close: 'Close, Esc', vertical: '9:16 frame, V', text: 'Captions, H', full: 'Full screen, F', nothing: 'Nothing is playing', lyrics: 'Lyrics: {style}, L', flow: 'flow', punch: 'punch', off: 'off', searching: 'Looking for lyrics…', seek: 'Seek' };
    const ICON: Record<string, string> = {
        clip: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 1h7A1.5 1.5 0 0 1 13 2.5v11a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 13.5v-11A1.5 1.5 0 0 1 4.5 1zm.2 1.5v11h6.6v-11zM6.9 5.6l3.2 2.1-3.2 2.1z"/></svg>',
        close: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 2.4 8 6.9l4.5-4.5 1.1 1.1L9.1 8l4.5 4.5-1.1 1.1L8 9.1l-4.5 4.5-1.1-1.1L6.9 8 2.4 3.5z"/></svg>',
        vertical: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 1h6a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1zm.5 1.5v11h5v-11z"/></svg>',
        text: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 2.5h12V5h-1.5V4h-3.75v8.5H10V14H6v-1.5h1.25V4H3.5v1H2z"/></svg>',
        lyrics: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v2H4zM4 9.5h11v2H4zM4 14h8v2H4zM17.5 12.2V18a2.5 2.5 0 1 1-1.5-2.3V10h4v2.2z"/></svg>',
        full: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 1.5H6V3H3v3H1.5zm8.5 0h4.5V6H13V3h-3zM1.5 10H3v3h3v1.5H1.5zm11.5 0h1.5v4.5H10V13h3z"/></svg>',
    };
    const STYLE_ID = 'sc-clip-style';
    if (!document.getElementById(STYLE_ID)) {
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = [
            '.scc{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;overflow:hidden;background:#05060a;color:#fff;font:600 14px/1.3 system-ui,-apple-system,"Segoe UI",sans-serif;opacity:0;transition:opacity .3s ease;--k:var(--sca-kick,0);--sx:var(--sca-sx,0);--sy:var(--sca-sy,0)}',
            '.scc.on{opacity:1}',
            // Фон дышит под бит: ярче и чуть крупнее на ударе
            '.scc-bg{position:absolute;inset:-12%;background:center/cover no-repeat;filter:blur(60px) saturate(1.6) brightness(calc(.5 + var(--k) * .25));transform:scale(calc(1.1 + var(--k) * .05));transition:background-image .6s ease,transform 90ms ease-out,filter 90ms ease-out}',
            '.scc-bg::after{content:"";position:absolute;inset:0;background:radial-gradient(120% 90% at 50% 40%,transparent,rgba(0,0,0,.55))}',
            // Кадр: всё окно или вертикальный 9:16 по центру. Размер кадра ставит скрипт, внутри всё в долях кадра
            '.scc-frame{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:calc(var(--scc-h) * .035);box-sizing:border-box;padding:calc(var(--scc-h) * .06) calc(var(--scc-w) * .07);width:var(--scc-w);height:var(--scc-h);overflow:hidden}',
            '.scc.vertical .scc-frame{box-shadow:0 0 0 100vmax rgba(0,0,0,.55),0 30px 80px -20px rgba(0,0,0,.9)}',
            // Обложка трясётся под удар баса (--sca-sx/sy из переливов) и даёт толчок на новой строке (--scc-hit)
            '.scc-art{position:relative;flex:none;width:min(calc(var(--scc-w) * .86),calc(var(--scc-h) * .62));aspect-ratio:1;border-radius:calc(var(--scc-h) * .018);overflow:hidden;container-type:inline-size;background:center/cover no-repeat rgba(255,255,255,.06);--scc-hit:0;' +
                'box-shadow:0 40px 90px -30px rgba(0,0,0,.95),0 0 0 1px rgba(255,255,255,.08),0 0 calc(var(--k) * 80px) calc(var(--k) * 6px) color-mix(in srgb,var(--sca-c1,#8aa0ff) 45%,transparent);' +
                'transform:translate3d(calc(var(--sx) * 9px),calc(var(--sy) * 9px),0) rotate(calc(var(--sx) * .7deg)) scale(calc(1 + var(--k) * .045 + var(--scc-hit) * .03));transition:transform 80ms ease-out,box-shadow 120ms ease-out}',
            '.scc-art.hit{animation:scc-hit .32s cubic-bezier(.2,.8,.2,1)}',
            '@keyframes scc-hit{0%{--scc-hit:1}100%{--scc-hit:0}}',
            '@property --scc-hit{syntax:"<number>";inherits:true;initial-value:0}',
            '.scc:not(.playing) .scc-art{transform:scale(.97)}',
            '.scc-text{width:100%;text-align:center;transition:opacity .25s ease}',
            '.scc-title{font-size:clamp(18px,calc(var(--scc-h) * .042),64px);line-height:1.15;font-weight:900;letter-spacing:-.02em;text-shadow:0 2px 20px rgba(0,0,0,.6);overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}',
            '.scc-artist{margin-top:.4em;font-size:clamp(13px,calc(var(--scc-h) * .026),36px);font-weight:700;color:rgba(255,255,255,.72);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
            // Полоса времени тянется: поле щелчка выше самой полосы
            '.scc-bar{position:relative;width:min(100%,calc(var(--scc-h) * .62));height:max(3px,calc(var(--scc-h) * .005));border-radius:999px;background:rgba(255,255,255,.22);cursor:pointer;touch-action:none;transition:opacity .25s ease,height .15s ease}',
            '.scc-bar::before{content:"";position:absolute;left:0;right:0;top:-12px;bottom:-12px}',
            '.scc-bar:hover,.scc-bar.drag{height:max(6px,calc(var(--scc-h) * .008))}',
            '.scc-bar>i{position:absolute;left:0;top:0;bottom:0;width:calc(var(--scc-p,0) * 100%);border-radius:inherit;background:#fff;transition:width .25s linear}',
            '.scc-bar.drag>i{transition:none}',
            '.scc-bar>b{position:absolute;top:50%;left:calc(var(--scc-p,0) * 100%);width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;background:#fff;box-shadow:0 1px 6px rgba(0,0,0,.5);opacity:0;transition:opacity .15s}',
            '.scc-bar:hover>b,.scc-bar.drag>b{opacity:1}',
            '.scc.bare .scc-text,.scc.bare .scc-bar{opacity:0}',
            '.scc.bare .scc-bar{pointer-events:none}',
            // ===== Текст на обложке =====
            '.scc-lyr{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;pointer-events:none;text-align:center;font-weight:900;letter-spacing:-.02em;color:#fff;' +
                // Затемнение под текстом: на светлой обложке белые буквы иначе тонули
                'background:linear-gradient(180deg,rgba(0,0,0,.42),rgba(0,0,0,.28) 35%,rgba(0,0,0,.28) 65%,rgba(0,0,0,.5));transition:opacity .3s ease}',
            '.scc-lyr.wait{background:none}',
            '.scc-lyr-note{align-self:center;padding:.5em 1em;border-radius:999px;background:rgba(0,0,0,.45);font-size:4cqw;font-weight:700;color:rgba(255,255,255,.8)}',
            // «Поток»: лента строк, текущая крупно посередине, соседние меньше и в дымке
            '.scc-lyr.flow{-webkit-mask:linear-gradient(transparent,#000 22%,#000 78%,transparent);mask:linear-gradient(transparent,#000 22%,#000 78%,transparent)}',
            '.scc-flow{position:absolute;left:6%;right:6%;top:50%;transition:transform .55s cubic-bezier(.2,.8,.2,1);will-change:transform}',
            '.scc-flow>p{margin:0;padding:1.6cqw 0;font-size:6.4cqw;line-height:1.12;color:rgba(255,255,255,.38);filter:blur(1.2px);transform:scale(.86);transform-origin:50% 50%;pointer-events:auto;cursor:pointer;' +
                'text-shadow:0 0 .3em rgba(0,0,0,.7),0 2px 18px rgba(0,0,0,.6);transition:transform .45s cubic-bezier(.2,.8,.2,1),color .3s,filter .3s,opacity .3s}',
            '.scc-flow>p.near{color:rgba(255,255,255,.6);filter:none;transform:scale(.92)}',
            '.scc-flow>p.now{color:rgba(255,255,255,.55);filter:none;transform:scale(calc(1.08 + var(--k) * .05))}',
            '.scc-flow>p.past{opacity:.55}',
            '.scc-flow>p>span{transition:color .18s,text-shadow .18s}',
            '.scc-flow>p.now>span.on{color:#fff;text-shadow:0 0 24px color-mix(in srgb,var(--sca-c1,#fff) 80%,transparent),0 2px 14px rgba(0,0,0,.7)}',
            // «Удар»: одна строка, слова выпрыгивают с поворотом, длинные слова цветом обложки, ушедшая строка улетает вверх
            '.scc-punch{position:absolute;inset:0;display:grid;place-items:center;padding:0 7%}',
            '.scc-pl{grid-area:1/1;display:flex;flex-wrap:wrap;justify-content:center;align-items:baseline;gap:.05em .28em;font-size:10cqw;line-height:1.02;text-transform:uppercase;text-shadow:0 0 .22em rgba(0,0,0,.75),0 .06em 0 rgba(0,0,0,.45),0 8px 30px rgba(0,0,0,.6)}',
            '.scc-pl>span{display:inline-block;opacity:0;transform:translateY(.35em) scale(1.7) rotate(-6deg);filter:blur(6px);transition:opacity .16s ease-out,transform .32s cubic-bezier(.2,1.6,.4,1),filter .2s ease-out}',
            '.scc-pl>span:nth-child(even){transform:translateY(.35em) scale(1.7) rotate(6deg)}',
            '.scc-pl>span.on{opacity:1;transform:none;filter:none}',
            '.scc-pl>span.big{color:color-mix(in srgb,var(--sca-c1,#ffd24a) 55%,#fff);-webkit-text-stroke:.025em rgba(0,0,0,.45)}',
            '.scc-pl.small{font-size:7.4cqw}',
            '.scc-pl.tiny{font-size:5.6cqw}',
            '.scc-pl.out{animation:scc-out .38s cubic-bezier(.4,0,1,1) forwards}',
            '@keyframes scc-out{to{opacity:0;transform:translateY(-.6em) scale(.9);filter:blur(8px)}}',
            '.scc-lyr.punch .scc-pl.now{transform:scale(calc(1 + var(--k) * .06))}',
            // Панель кнопок: исчезает через 2 с без движения мыши, курсор тоже
            '.scc-tools{position:absolute;top:16px;right:16px;z-index:2;display:flex;gap:6px;padding:5px;border-radius:999px;background:rgba(10,11,16,.6);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);box-shadow:inset 0 0 0 1px rgba(255,255,255,.12);transition:opacity .25s ease,transform .25s ease}',
            '.scc.idle .scc-tools{opacity:0;transform:translateY(-6px);pointer-events:none}',
            '.scc.idle{cursor:none}',
            '.scc-tools button{all:unset;box-sizing:border-box;width:36px;height:36px;border-radius:999px;display:grid;place-items:center;cursor:pointer;color:rgba(255,255,255,.8);transition:background .15s,color .15s}',
            '.scc-tools button:hover{background:rgba(255,255,255,.14);color:#fff}',
            '.scc-tools button[aria-pressed="true"]{background:#fff;color:#0b0c10}',
            '.scc-tools button[data-style="punch"]{background:color-mix(in srgb,var(--sca-c1,#ffd24a) 70%,#fff);color:#0b0c10}',
            '.scc-tools button:focus-visible{outline:2px solid #fff;outline-offset:2px}',
            '.scc-tools svg{width:16px;height:16px;fill:currentColor}',
            '.scc-empty{font-size:18px;color:rgba(255,255,255,.7)}',
            // Кнопка режима в карточке и в баре
            '.scc-open{all:unset;box-sizing:border-box;width:32px;height:32px;border-radius:999px;display:inline-grid;place-items:center;flex:none;cursor:pointer;color:rgba(255,255,255,.75);transition:background-color .15s,color .15s,transform .15s}',
            '.scc-open:hover{background:rgba(255,255,255,.12);color:#fff}',
            '.scc-open:active{transform:scale(.9)}',
            '.scc-open:focus-visible{outline:2px solid var(--sc2-accent,#fff);outline-offset:2px}',
            '.scc-open svg{width:17px;height:17px;fill:currentColor}',
            '.playControls .scc-open{background:rgba(255,255,255,.06);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08);margin:0 4px;align-self:center}',
            '.playControls .scc-open svg{width:16px;height:16px}',
            'html.scm-reduce .scc,html.scm-reduce .scc *{transition:none!important;animation:none!important}',
            'html.scm-reduce .scc-art,html.scm-reduce .scc-bg{transform:none!important}',
            '@media (prefers-reduced-motion:reduce){.scc,.scc *{transition:none!important;animation:none!important}.scc-art{transform:none!important}}',
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

    // Выбор кадра, подписей и стиля текста помнится между запусками режима
    const read = (key: string): string => {
        try {
            return localStorage.getItem(key) ?? '';
        } catch {
            return '';
        }
    };
    const save = (key: string, value: string): void => {
        try {
            localStorage.setItem(key, value);
        } catch {
            // не сохранилось: до перезагрузки страницы
        }
    };
    let vertical = read('sc2-clip-vertical') === 'on';
    let bare = read('sc2-clip-bare') === 'on';
    const savedStyle = read('sc2-clip-lyrics');
    let lyricStyle: ClipLyricStyle = savedStyle === 'punch' || savedStyle === 'off' ? savedStyle : 'flow';

    let layer: HTMLElement | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    let frameId = 0;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    let shownArt = '';
    let returnFocus: HTMLElement | null = null;
    let dragging = false;
    // Что сейчас на обложке: трек, стиль и есть ли текст. Сменилось — слой текста собирается заново
    let lyrKey = '';
    let lyrLine = -2;
    let lyrWord = -2;
    let lyrLines: ClipLine[] | null = null;
    let lyrPlain: string[] = [];
    let lastNow: ClipNow | null = null;
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
        const lyr = layer.querySelector<HTMLElement>('[data-clip="lyrics"]');
        if (lyr) {
            const label = T.lyrics.replace('{style}', T[lyricStyle]);
            lyr.dataset.style = lyricStyle;
            lyr.setAttribute('aria-pressed', String(lyricStyle === 'flow'));
            lyr.setAttribute('aria-label', label);
            lyr.title = label;
        }
    }
    function paint(): void {
        if (!layer || core.disposed()) return;
        const now = core.now();
        lastNow = now;
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
                lyrKey = '';
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
            bar.setAttribute('role', 'slider');
            bar.setAttribute('aria-label', T.seek);
            bar.append(document.createElement('i'), document.createElement('b'));
            bar.addEventListener('pointerdown', startSeek);
            frame.append(art, text, bar);
            lyrKey = '';
        }
        const title = frame.querySelector<HTMLElement>('.scc-title');
        const artist = frame.querySelector<HTMLElement>('.scc-artist');
        if (title && title.textContent !== now.title) title.textContent = now.title;
        if (artist && artist.textContent !== now.artist) artist.textContent = now.artist;
        if (!dragging) frame.querySelector<HTMLElement>('.scc-bar')?.style.setProperty('--scc-p', String(Math.max(0, Math.min(1, now.progress))));
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
        buildLyrics(now);
    }

    // ===== Текст на обложке =====
    function buildLyrics(now: ClipNow): void {
        const art = layer?.querySelector<HTMLElement>('.scc-art');
        if (!art) return;
        const state = now.lyrics === undefined ? 'wait' : now.lyrics === null ? 'none' : now.lyrics.lines ? 'synced' : 'plain';
        const key = now.id + '|' + lyricStyle + '|' + state;
        if (key === lyrKey) return;
        lyrKey = key;
        lyrLine = -2;
        lyrWord = -2;
        art.querySelector('.scc-lyr')?.remove();
        lyrLines = now.lyrics?.lines ?? null;
        lyrPlain = now.lyrics && !now.lyrics.lines ? now.lyrics.plain.split('\n').map((line) => line.trim()).filter(Boolean) : [];
        if (lyricStyle === 'off' || state === 'none') return;
        const box = document.createElement('div');
        box.className = 'scc-lyr ' + lyricStyle;
        if (state === 'wait') {
            box.classList.add('wait');
            const note = document.createElement('div');
            note.className = 'scc-lyr-note';
            note.textContent = T.searching;
            box.append(note);
            art.append(box);
            return;
        }
        if (lyricStyle === 'flow') {
            const flow = document.createElement('div');
            flow.className = 'scc-flow';
            const lines = lyrLines ?? lyrPlain.map((text, i) => ({ at: i, text, words: [] as ClipWord[] }));
            lines.forEach((line) => {
                const row = document.createElement('p');
                if (lyrLines) row.dataset.at = String(line.at);
                const words = line.words.length ? line.words : [{ at: line.at, text: line.text || '♪' }];
                words.forEach((word, n) => {
                    const span = document.createElement('span');
                    span.textContent = word.text;
                    span.dataset.at = String(word.at);
                    row.append(span);
                    if (n < words.length - 1) row.append(' ');
                });
                flow.append(row);
            });
            // Щелчок по строке — перемотка к ней
            flow.addEventListener('click', (event) => {
                const row = (event.target as Element | null)?.closest<HTMLElement>('p[data-at]');
                if (!row) return;
                event.stopPropagation();
                core.seek(Math.max(0, Number(row.dataset.at) - 150));
                lyrLine = -2;
            });
            box.append(flow);
        } else {
            const punch = document.createElement('div');
            punch.className = 'scc-punch';
            box.append(punch);
        }
        art.append(box);
    }
    /** Строка для текста без времени: по доле прослушанного */
    function plainIndex(now: ClipNow): number {
        if (!lyrPlain.length) return -1;
        return Math.min(lyrPlain.length - 1, Math.floor(Math.max(0, Math.min(1, now.progress)) * lyrPlain.length));
    }
    function kick(): void {
        const art = layer?.querySelector<HTMLElement>('.scc-art');
        if (!art || !lastNow?.playing) return;
        art.classList.remove('hit');
        void art.offsetWidth;
        art.classList.add('hit');
    }
    function punchLine(text: string, words: ClipWord[]): HTMLElement {
        const line = document.createElement('div');
        line.className = 'scc-pl now';
        const parts = words.length ? words : text.split(/\s+/).filter(Boolean).map((part) => ({ at: 0, text: part }));
        const length = parts.reduce((sum, part) => sum + part.text.length, 0);
        if (length > 34) line.classList.add('tiny');
        else if (length > 20) line.classList.add('small');
        parts.forEach((part) => {
            const span = document.createElement('span');
            span.textContent = part.text;
            span.dataset.at = String(part.at);
            if (part.text.replace(/[^\p{L}\p{N}]/gu, '').length >= 6) span.classList.add('big');
            line.append(span);
        });
        if (!parts.length) {
            const span = document.createElement('span');
            span.textContent = '♪';
            span.className = 'on';
            line.append(span);
        }
        return line;
    }
    function syncLyrics(): void {
        const now = lastNow;
        const box = layer?.querySelector<HTMLElement>('.scc-lyr:not(.wait)');
        if (!now || !box) return;
        // Позиция между опросами плеера догоняется по часам, чтобы слова не прыгали шагом в 250 мс
        const at = now.positionMs + (now.playing ? performance.now() - polledAt : 0) + 140;
        const index = lyrLines ? clipLineAt(lyrLines, at) : plainIndex(now);
        if (lyricStyle === 'flow') {
            const flow = box.querySelector<HTMLElement>('.scc-flow');
            if (!flow) return;
            const rows = flow.children;
            if (index !== lyrLine) {
                const first = lyrLine === -2;
                lyrLine = index;
                lyrWord = -2;
                for (let i = 0; i < rows.length; i++) {
                    const row = rows[i] as HTMLElement;
                    row.classList.toggle('now', i === index);
                    row.classList.toggle('past', i < index);
                    row.classList.toggle('near', Math.abs(i - index) === 1);
                    if (i !== index) for (const word of row.querySelectorAll('span.on')) word.classList.remove('on');
                }
                const row = rows[Math.max(0, index)] as HTMLElement | undefined;
                if (row) flow.style.transform = 'translate3d(0,' + (-(row.offsetTop + row.offsetHeight / 2)).toFixed(1) + 'px,0)';
                if (!first && index >= 0) kick();
            }
            const row = rows[index] as HTMLElement | undefined;
            if (!row) return;
            const words = row.querySelectorAll<HTMLElement>('span');
            let lit = -1;
            if (lyrLines) {
                for (let i = 0; i < words.length; i++) {
                    if (Number(words[i].dataset.at) <= at) lit = i;
                    else break;
                }
            } else lit = words.length - 1;
            if (lit === lyrWord) return;
            lyrWord = lit;
            words.forEach((word, i) => word.classList.toggle('on', i <= lit));
            return;
        }
        // «Удар»
        const stage = box.querySelector<HTMLElement>('.scc-punch');
        if (!stage) return;
        if (index !== lyrLine) {
            const first = lyrLine === -2;
            lyrLine = index;
            lyrWord = -2;
            for (const old of stage.querySelectorAll<HTMLElement>('.scc-pl.now')) {
                old.classList.remove('now');
                old.classList.add('out');
                setTimeout(() => old.remove(), 420);
            }
            const line = lyrLines ? lyrLines[index] : null;
            const text = line ? line.text : index >= 0 ? lyrPlain[index] ?? '' : '';
            if (index >= 0) stage.append(punchLine(text, line ? line.words : []));
            if (!first && index >= 0) kick();
        }
        const current = stage.querySelector<HTMLElement>('.scc-pl.now');
        if (!current) return;
        const words = current.querySelectorAll<HTMLElement>('span');
        let lit = -1;
        if (lyrLines && lyrLines[index]?.words.length) {
            for (let i = 0; i < words.length; i++) {
                if (Number(words[i].dataset.at) <= at) lit = i;
                else break;
            }
        } else {
            // Слов со временем нет: выпрыгивают по очереди за первые полсекунды строки
            lit = words.length - 1;
        }
        if (lit === lyrWord) return;
        // Новое слово — лёгкий толчок обложки, но не на каждом слове подряд: только на длинных
        if (lit > lyrWord && lyrWord >= 0 && words[lit]?.classList.contains('big')) kick();
        lyrWord = lit;
        words.forEach((word, i) => {
            if (i <= lit && !word.classList.contains('on')) {
                if (!(lyrLines && lyrLines[index]?.words.length)) word.style.transitionDelay = i * 70 + 'ms';
                word.classList.add('on');
            }
        });
    }
    let polledAt = 0;
    function loop(): void {
        frameId = 0;
        if (!layer || core.disposed()) return;
        syncLyrics();
        frameId = requestAnimationFrame(loop);
    }
    function poll(): void {
        paint();
        polledAt = performance.now();
    }

    // ===== Перемотка =====
    function seekBy(delta: number): void {
        const now = core.now();
        if (!now || !(now.durationMs > 0)) return;
        core.seek(clipSeekStep(now.positionMs, now.durationMs, delta));
        lyrLine = -2;
        setTimeout(poll, 60);
    }
    function startSeek(event: PointerEvent): void {
        if (event.button !== 0) return;
        const bar = event.currentTarget as HTMLElement;
        event.preventDefault();
        event.stopPropagation();
        dragging = true;
        bar.classList.add('drag');
        let fraction = 0;
        const move = (point: PointerEvent): void => {
            const rect = bar.getBoundingClientRect();
            fraction = rect.width > 0 ? Math.max(0, Math.min(1, (point.clientX - rect.left) / rect.width)) : 0;
            bar.style.setProperty('--scc-p', String(fraction));
        };
        const stop = (): void => {
            window.removeEventListener('pointermove', move, true);
            window.removeEventListener('pointerup', stop, true);
            window.removeEventListener('pointercancel', stop, true);
            bar.classList.remove('drag');
            dragging = false;
            const now = core.now();
            if (now && now.durationMs > 0) core.seek(clipSeekStep(0, now.durationMs, fraction * now.durationMs));
            lyrLine = -2;
            setTimeout(poll, 60);
        };
        window.addEventListener('pointermove', move, true);
        window.addEventListener('pointerup', stop, true);
        window.addEventListener('pointercancel', stop, true);
        move(event);
    }
    let wheelAt = 0;
    const onWheel = (event: WheelEvent): void => {
        if (!layer || !event.deltaY) return;
        event.preventDefault();
        // Тачпад шлёт десятки событий: шаг не чаще раза в 120 мс
        const stamp = performance.now();
        if (stamp - wheelAt < 120) return;
        wheelAt = stamp;
        seekBy(event.deltaY > 0 ? 5000 : -5000);
        wake();
    };

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
        else if (key === 'l' || key === 'д') cycleLyrics();
        else if (key === 'f' || key === 'а') void toggleFull();
        else if (event.key === ' ') core.togglePlay();
        else if (event.key === 'ArrowRight') seekBy(event.shiftKey ? 15000 : 5000);
        else if (event.key === 'ArrowLeft') seekBy(event.shiftKey ? -15000 : -5000);
        else return;
        event.preventDefault();
        event.stopPropagation();
        wake();
    };
    function toggleVertical(): void {
        vertical = !vertical;
        save('sc2-clip-vertical', vertical ? 'on' : 'off');
        layout();
        lyrLine = -2;
    }
    function toggleText(): void {
        bare = !bare;
        save('sc2-clip-bare', bare ? 'on' : 'off');
        layout();
    }
    function cycleLyrics(): void {
        lyricStyle = clipNextStyle(lyricStyle);
        save('sc2-clip-lyrics', lyricStyle);
        layout();
        lyrKey = '';
        paint();
    }
    async function toggleFull(): Promise<void> {
        try {
            if (document.fullscreenElement) await document.exitFullscreen();
            else await layer?.requestFullscreen?.();
        } catch {
            // полный экран запрещён: остаётся на всё окно
        }
    }
    function onResize(): void {
        layout();
        lyrLine = -2;
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
        tools.append(tool('vertical', T.vertical, 'vertical'), tool('lyrics', T.lyrics, 'lyrics'), tool('text', T.text, 'text'), tool('full', T.full, 'full'), tool('close', T.close, 'close'));
        tools.addEventListener('click', (event) => {
            const control = (event.target as Element | null)?.closest<HTMLElement>('[data-clip]');
            switch (control?.dataset.clip) {
                case 'vertical': toggleVertical(); break;
                case 'lyrics': cycleLyrics(); break;
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
        layer.addEventListener('wheel', onWheel, { passive: false });
        window.addEventListener('keydown', onKey, true);
        window.addEventListener('resize', onResize);
        shownArt = '';
        lyrKey = '';
        layout();
        poll();
        wake();
        void layer.offsetWidth;
        layer.classList.add('on');
        tools.querySelector<HTMLElement>('[data-clip="close"]')?.focus({ preventScroll: true });
        timer = setInterval(poll, 250);
        frameId = requestAnimationFrame(loop);
        for (const node of [cardButton, barButton]) node?.setAttribute('aria-pressed', 'true');
    }
    function close(): void {
        if (!layer) return;
        const node = layer;
        layer = null;
        clearInterval(timer);
        clearTimeout(idleTimer);
        if (frameId) cancelAnimationFrame(frameId);
        frameId = 0;
        window.removeEventListener('keydown', onKey, true);
        window.removeEventListener('resize', onResize);
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
