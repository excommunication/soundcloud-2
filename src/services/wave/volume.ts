// Громкость (2.9.0): один ползунок для карточки «Моей волны» и нижнего бара. Раньше в карточке стоял <input type=range>,
// а блок волны пересобирается каждую секунду: ползунок под пальцем пропадал, тянуть его было нельзя, клик ломал ряд
// значков. Теперь элементы громкости живут всё время работы страницы, пересборка только переставляет их на новое место,
// а перетаскивание слушает окно и не теряется, даже если узел на мгновение вынут из страницы.
// Щелчок по значку: звук выкл/вкл. Ползунок: тянуть, щёлкнуть, колесо мыши, стрелки. Попап не закрывается, пока тянут.
// Раздел страницы волны: installVolume уходит на страницу текстом (pageHelpers в wave.ts) и ни на что снаружи не ссылается
export interface SiteVolume {
    getVolume(): number;
    setVolume(value: number): void;
}
export interface VolumeCore {
    lang: 'ru' | 'en';
    /** Модуль громкости сайта, если найден; без него клавиши сайта Shift+↑/↓ */
    site(): SiteVolume | null;
    disposed(): boolean;
}
export interface VolumeSection {
    /** Ползунок для карточки волны: каждый раз тот же узел */
    card(): HTMLElement;
    /** Значки и ползунки догоняют звук, поменянный клавишами или сайтом; ставит ползунок в бар, если сайт его перерисовал */
    sync(): void;
    toggleMute(): void;
    dispose(): void;
}

/** Доля 0..1 по месту курсора на дорожке; за краями дорожки края */
export function volumeAt(clientX: number, left: number, width: number): number {
    if (!(width > 0)) return 0;
    return Math.max(0, Math.min(1, (clientX - left) / width));
}
/** Шаг колеса: вверх громче, вниз тише, по 5 % на щелчок колеса */
export function volumeWheel(level: number, deltaY: number): number {
    if (!deltaY) return level;
    return Math.max(0, Math.min(1, Math.round((level + (deltaY < 0 ? 0.05 : -0.05)) * 100) / 100));
}

export function installVolume(core: VolumeCore): VolumeSection {
    const ru = core.lang === 'ru';
    const T = ru
        ? { mute: 'Выключить звук', unmute: 'Включить звук', level: 'Громкость' }
        : { mute: 'Mute', unmute: 'Unmute', level: 'Volume' };
    const ICON: Record<string, string> = {
        vol: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9v6h4l5 5V4L7 9zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.47 4.47 0 0 0 2.5-4zM14 3.23v2.06a7 7 0 0 1 0 13.42v2.06A9 9 0 0 0 14 3.23z"/></svg>',
        volLow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9v6h4l5 5V4L9 9zm13.5 3A4.5 4.5 0 0 0 16 8v8a4.47 4.47 0 0 0 2.5-4z"/></svg>',
        mute: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16.5 12A4.5 4.5 0 0 0 14 8v2.18l2.45 2.45a4.3 4.3 0 0 0 .05-.63zM19 12c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.8 8.8 0 0 0 21 12a9 9 0 0 0-7-8.77v2.06A7 7 0 0 1 19 12zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25A7 7 0 0 1 14 18.7v2.06a9 9 0 0 0 3.69-1.81L19.73 21 21 19.73l-9-9zM12 4 9.91 6.09 12 8.18z"/></svg>',
    };
    const STYLE_ID = 'sc-volume-style';
    if (!document.getElementById(STYLE_ID)) {
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = [
            '.scv{position:relative;display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;flex:none;vertical-align:middle}',
            '.scv-btn{all:unset;box-sizing:border-box;width:32px;height:32px;border-radius:999px;display:grid;place-items:center;cursor:pointer;color:rgba(255,255,255,.75);transition:background-color .15s,color .15s,transform .15s cubic-bezier(.2,.8,.2,1)}',
            '.scv-btn:hover{background:rgba(255,255,255,.12);color:#fff}',
            '.scv-btn:active{transform:scale(.9)}',
            '.scv-btn:focus-visible,.scv-track:focus-visible{outline:2px solid var(--sc2-accent,#fff);outline-offset:2px}',
            '.scv-btn svg{width:18px;height:18px;fill:currentColor;display:block}',
            '.scv[data-muted="true"] .scv-btn{color:rgba(255,255,255,.45)}',
            // Попап сбоку от значка в карточке и над значком в баре. Между значком и дорожкой нет щели: курсор едет и не теряет попап
            '.scv-pop{position:absolute;z-index:40;display:flex;align-items:center;box-sizing:border-box;opacity:0;visibility:hidden;pointer-events:none;transition:opacity .16s ease,visibility 0s linear .16s,transform .2s cubic-bezier(.2,.8,.2,1)}',
            '.scv.open .scv-pop,.scv.drag .scv-pop{opacity:1;visibility:visible;pointer-events:auto;transition:opacity .16s ease,visibility 0s,transform .2s cubic-bezier(.2,.8,.2,1)}',
            '.scv[data-kind="card"] .scv-pop{right:100%;top:50%;width:124px;height:32px;padding:0 10px 0 6px;transform:translate(6px,-50%)}',
            '.scv[data-kind="card"].open .scv-pop,.scv[data-kind="card"].drag .scv-pop{transform:translate(0,-50%)}',
            '.scv[data-kind="bar"] .scv-pop{bottom:100%;left:50%;width:148px;height:40px;padding:0 14px;margin-bottom:6px;border-radius:999px;transform:translate(-50%,4px);' +
                'background:rgba(14,15,22,.9);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);box-shadow:0 12px 30px -12px rgba(0,0,0,.9),inset 0 0 0 1px rgba(255,255,255,.1)}',
            // Мостик под попапом бара: на пути от значка к попапу курсор остаётся внутри .scv
            '.scv[data-kind="bar"] .scv-pop::after{content:"";position:absolute;left:0;right:0;top:100%;height:8px}',
            '.scv[data-kind="bar"].open .scv-pop,.scv[data-kind="bar"].drag .scv-pop{transform:translate(-50%,0)}',
            // Дорожка высотой 20 px ловит курсор, видна полоса 4 px посередине
            '.scv-track{position:relative;flex:1;height:20px;cursor:pointer;touch-action:none;outline:none;--v:50%}',
            '.scv-track::before{content:"";position:absolute;left:0;right:0;top:8px;height:4px;border-radius:999px;background:rgba(255,255,255,.22)}',
            '.scv-fill{position:absolute;left:0;top:8px;height:4px;width:var(--v);border-radius:999px;background:#fff;pointer-events:none}',
            '.scv-thumb{position:absolute;top:4px;left:var(--v);width:12px;height:12px;margin-left:-6px;border-radius:50%;background:#fff;box-shadow:0 1px 6px rgba(0,0,0,.5);pointer-events:none;transition:transform .12s}',
            '.scv.drag .scv-thumb,.scv-track:hover .scv-thumb{transform:scale(1.2)}',
            // Ползунок бара заменяет ползунок сайта: тот прятался при каждом движении мыши и не давал себя тянуть
            'html.scv-bar-on .playControls .volume{display:none!important}',
            '.playControls .scv[data-kind="bar"]{margin:0 4px}',
            '.playControls .scv[data-kind="bar"] .scv-btn{background:rgba(255,255,255,.06);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)}',
            '.playControls .scv[data-kind="bar"] .scv-btn svg{width:16px;height:16px}',
            'html.scm-reduce .scv *{transition:none!important}',
            '@media (prefers-reduced-motion:reduce){.scv *{transition:none!important}}',
        ].join('\n');
        document.head.append(style);
    }

    // ===== Звук сайта =====
    const bar = (): Element | null => document.querySelector('.playControls');
    function level(): number {
        const module = core.site();
        if (module) {
            const value = Number(module.getVolume());
            if (Number.isFinite(value)) return Math.max(0, Math.min(1, value > 1 ? value / 100 : value));
        }
        const node = bar()?.querySelector('.volume__sliderWrapper[aria-valuenow], .volume [role="slider"][aria-valuenow]');
        const raw = Number(node?.getAttribute('aria-valuenow'));
        return Number.isFinite(raw) && node ? Math.max(0, Math.min(1, raw > 1 ? raw / 100 : raw)) : 0.5;
    }
    const siteMuted = (): boolean => !!bar()?.querySelector('.volume.muted');
    const muted = (): boolean => siteMuted() || level() === 0;
    const siteButton = (): HTMLElement | null => document.querySelector<HTMLElement>('.playControls .volume__button');
    // Громкость до выключения: «Включить звук» возвращает её, а не 50 %
    let before = 0.5;
    function set(value: number): void {
        const want = Math.max(0, Math.min(1, value));
        if (want > 0 && siteMuted()) siteButton()?.click();
        const module = core.site();
        if (module) module.setVolume(want);
        else {
            const steps = Math.round((want - level()) * 10);
            for (let i = 0; i < Math.abs(steps); i++) {
                document.dispatchEvent(new KeyboardEvent('keydown', { key: steps > 0 ? 'ArrowUp' : 'ArrowDown', code: steps > 0 ? 'ArrowUp' : 'ArrowDown', keyCode: steps > 0 ? 38 : 40, shiftKey: true, bubbles: true }));
            }
        }
        if (want > 0) before = want;
    }
    function toggleMute(): void {
        if (muted()) {
            if (siteMuted()) siteButton()?.click();
            if (level() === 0) set(before > 0 ? before : 0.5);
        } else {
            before = level() || before;
            // Кнопка сайта помнит громкость сама; без неё звук просто в ноль
            const button = siteButton();
            if (button) button.click();
            else set(0);
        }
        sync();
        setTimeout(sync, 80);
    }

    // ===== Узлы =====
    const controls: HTMLElement[] = [];
    function make(kind: 'card' | 'bar'): HTMLElement {
        const box = document.createElement('span');
        box.className = 'scv';
        box.dataset.kind = kind;
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'scv-btn';
        toggle.dataset.vol = 'mute';
        const pop = document.createElement('span');
        pop.className = 'scv-pop';
        const track = document.createElement('span');
        track.className = 'scv-track';
        track.tabIndex = 0;
        track.dataset.role = 'volume';
        track.setAttribute('role', 'slider');
        track.setAttribute('aria-label', T.level);
        track.setAttribute('aria-valuemin', '0');
        track.setAttribute('aria-valuemax', '100');
        const fill = document.createElement('span');
        fill.className = 'scv-fill';
        const thumb = document.createElement('span');
        thumb.className = 'scv-thumb';
        track.append(fill, thumb);
        pop.append(track);
        box.append(toggle, pop);
        controls.push(box);
        paint(box, muted() ? 0 : level(), muted());

        let closeTimer: ReturnType<typeof setTimeout> | undefined;
        const open = (): void => {
            clearTimeout(closeTimer);
            box.classList.add('open');
        };
        const close = (): void => {
            clearTimeout(closeTimer);
            // Небольшая задержка: курсор, соскочивший с дорожки на миг, попап не закрывает
            closeTimer = setTimeout(() => {
                if (!box.classList.contains('drag') && !box.contains(document.activeElement)) box.classList.remove('open');
            }, 350);
        };
        box.addEventListener('pointerenter', open);
        box.addEventListener('pointerleave', close);
        box.addEventListener('focusin', open);
        box.addEventListener('focusout', close);
        toggle.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            toggleMute();
        });
        // Перетаскивание: слушает окно, а место дорожки берётся заново на каждом движении. Узел могли переставить
        // пересборкой блока, но тянуть это не мешает
        track.addEventListener('pointerdown', (event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.stopPropagation();
            track.focus({ preventScroll: true });
            box.classList.add('drag', 'open');
            const move = (point: PointerEvent): void => {
                const rect = track.getBoundingClientRect();
                const value = volumeAt(point.clientX, rect.left, rect.width);
                set(value);
                paintAll(value, value === 0);
            };
            const stop = (): void => {
                window.removeEventListener('pointermove', move, true);
                window.removeEventListener('pointerup', stop, true);
                window.removeEventListener('pointercancel', stop, true);
                box.classList.remove('drag');
                if (!box.matches(':hover')) close();
                setTimeout(sync, 80);
            };
            window.addEventListener('pointermove', move, true);
            window.addEventListener('pointerup', stop, true);
            window.addEventListener('pointercancel', stop, true);
            move(event);
        });
        // Щелчок не уходит блоку волны: там щелчки по пустому месту запускают свои действия
        track.addEventListener('click', (event) => event.stopPropagation());
        box.addEventListener('wheel', (event) => {
            event.preventDefault();
            open();
            const value = volumeWheel(muted() ? 0 : level(), event.deltaY);
            set(value);
            paintAll(value, value === 0);
            close();
        }, { passive: false });
        track.addEventListener('keydown', (event) => {
            const now = muted() ? 0 : level();
            const steps: Record<string, number> = { ArrowRight: 0.05, ArrowUp: 0.05, ArrowLeft: -0.05, ArrowDown: -0.05, PageUp: 0.1, PageDown: -0.1 };
            let value: number | null = null;
            if (event.key in steps) value = now + steps[event.key];
            else if (event.key === 'Home') value = 0;
            else if (event.key === 'End') value = 1;
            if (value === null) return;
            event.preventDefault();
            event.stopPropagation();
            value = Math.max(0, Math.min(1, Math.round(value * 100) / 100));
            set(value);
            paintAll(value, value === 0);
        });
        return box;
    }
    function paint(box: HTMLElement, value: number, isMuted: boolean): void {
        const percent = Math.round(value * 100);
        // Пишется только изменение: каждая запись атрибута будит наблюдателей страницы
        const key = percent + (isMuted ? 'm' : '');
        if (box.dataset.shown === key) return;
        box.dataset.shown = key;
        const track = box.querySelector<HTMLElement>('.scv-track');
        if (track) {
            track.style.setProperty('--v', percent + '%');
            track.setAttribute('aria-valuenow', String(percent));
            track.setAttribute('aria-valuetext', percent + '%');
        }
        const icon = isMuted || percent === 0 ? 'mute' : percent < 50 ? 'volLow' : 'vol';
        const toggle = box.querySelector<HTMLElement>('.scv-btn');
        if (toggle && toggle.dataset.icon !== icon) {
            toggle.dataset.icon = icon;
            toggle.innerHTML = ICON[icon];
        }
        if (toggle) {
            const label = (isMuted ? T.unmute : T.mute) + ', M';
            toggle.setAttribute('aria-label', label);
            toggle.title = label;
        }
        box.dataset.muted = String(isMuted || percent === 0);
    }
    function paintAll(value: number, isMuted: boolean): void {
        for (const box of controls) paint(box, value, isMuted);
    }
    let cardNode: HTMLElement | null = null;
    let barNode: HTMLElement | null = null;
    function mountBar(playControls: Element | null): void {
        const site = playControls?.querySelector('.volume');
        const host = site?.parentElement;
        const root = document.documentElement;
        if (!site || !host) {
            if (root.classList.contains('scv-bar-on')) root.classList.remove('scv-bar-on');
            return;
        }
        barNode ??= make('bar');
        if (barNode.parentElement !== host) host.append(barNode);
        if (!root.classList.contains('scv-bar-on')) root.classList.add('scv-bar-on');
    }
    function sync(): void {
        if (core.disposed()) return;
        const playControls = bar();
        mountBar(playControls);
        // Нет ни бара, ни карточки на странице: обновлять нечего
        if (!playControls && !controls.some((box) => box.isConnected)) return;
        // Во время перетаскивания значение ведёт курсор, а не сайт: сайт отвечает с задержкой, и ползунок прыгал бы
        if (controls.some((box) => box.classList.contains('drag'))) return;
        const isMuted = muted();
        paintAll(isMuted ? 0 : level(), isMuted);
    }
    // Своего таймера нет: sync зовёт секундный цикл волны, он идёт на любой странице сайта.
    // Первый проход после установки остальных разделов: модуль громкости сайта ищет волна
    const first = setTimeout(sync, 0);
    return {
        card() {
            cardNode ??= make('card');
            return cardNode;
        },
        sync,
        toggleMute,
        dispose() {
            clearTimeout(first);
            for (const box of controls) box.remove();
            controls.length = 0;
            document.documentElement.classList.remove('scv-bar-on');
            document.getElementById(STYLE_ID)?.remove();
        },
    };
}
