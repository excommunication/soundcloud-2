// Док нижнего бара и быстрые действия у треков. В баре рядом с лайком сайта: «Не нравится», «Больше такого», «Волна от
// трека» и «Следующим». У любой строки трека на сайте при наведении всплывает стеклянная полоска: «Следующим», «В конец
// очереди», «Волна». Действия те же, что в меню по правому клику (menu.actOn), поэтому отметки, тосты и отмена общие.
// Раздел страницы волны: installDock уходит на страницу текстом (pageHelpers в wave.ts) и ни на что снаружи не ссылается
export interface DockCore {
    lang: 'ru' | 'en';
    actOn(node: Element, act: string): boolean;
    actsOn(node: Element): string[];
    disposed(): boolean;
}
export interface DockSection {
    /** Поставить док в бар, если сайт его перерисовал, и обновить нажатые кнопки */
    sync(): void;
    dispose(): void;
}

export function installDock(core: DockCore): DockSection {
    const ru = core.lang === 'ru';
    const T = ru
        ? { dislike: 'Не нравится', more: 'Больше такого', wave: 'Волна от трека', next: 'Следующим', last: 'В конец очереди', waveShort: 'Волна' }
        : { dislike: 'Dislike', more: 'More like this', wave: 'Wave from this track', next: 'Play next', last: 'Add to queue', waveShort: 'Wave' };
    const ICON: Record<string, string> = {
        dislike: '<svg viewBox="0 0 16 16"><path d="M10.6 1.5H4.4c-.6 0-1.1.4-1.3 1L1.6 7.3c-.3.9.4 1.8 1.3 1.8h3.6l-.6 3.1c-.2.8.4 1.6 1.2 1.6.4 0 .8-.2 1-.6l3-4.6c.2-.3.3-.6.3-.9V2.7c0-.7-.5-1.2-1.2-1.2zm1.9 0h1.2c.4 0 .8.4.8.8v5.6c0 .4-.4.8-.8.8h-1.2z"/></svg>',
        more: '<svg viewBox="0 0 16 16"><path d="M7.25 2h1.5v5.25H14v1.5H8.75V14h-1.5V8.75H2v-1.5h5.25z"/></svg>',
        wave: '<svg viewBox="0 0 16 16"><path d="M1 8c1.5 0 1.5-3 3-3s1.5 6 3 6 1.5-8 3-8 1.5 5 3 5h2v1.5h-2c-1.6 0-2.2-1.6-2.8-3.5C9.6 10 9.1 12.5 7 12.5c-1.9 0-2.4-3.1-3-4.6C3.6 8.8 3 9.5 1 9.5z"/></svg>',
        next: '<svg viewBox="0 0 16 16"><path d="M2 3.5l6 4.5-6 4.5zM9 3.5h1.5v9H9zM12.5 3.5H14v9h-1.5z"/></svg>',
        last: '<svg viewBox="0 0 16 16"><path d="M1.5 3h9v1.5h-9zM1.5 6.5h9V8h-9zM1.5 10h5.5v1.5H1.5zM11.25 8.5h1.5v2.75h2.75v1.5h-2.75v2.75h-1.5v-2.75H8.5v-1.5h2.75z"/></svg>',
    };
    const STYLE_ID = 'sc-dock-style';
    if (!document.getElementById(STYLE_ID)) {
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = [
            '.scd-dock{display:inline-flex;align-items:center;gap:2px;margin-left:10px;padding:3px;border-radius:999px;background:rgba(255,255,255,.06);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08);vertical-align:middle;animation:scd-in .4s cubic-bezier(.2,.8,.2,1.2) both}',
            '.scd-dock button,.scd-quick button{all:unset;box-sizing:border-box;width:28px;height:28px;border-radius:999px;display:grid;place-items:center;cursor:pointer;color:rgba(255,255,255,.72);transition:background .2s,color .2s,transform .25s cubic-bezier(.2,.8,.2,1.5)}',
            '.scd-dock button:hover,.scd-quick button:hover{background:rgba(255,255,255,.12);color:#fff}',
            '.scd-dock button:active,.scd-quick button:active{transform:scale(.82)}',
            '.scd-dock button:focus-visible,.scd-quick button:focus-visible{outline:2px solid var(--sca-c1,#ff5500);outline-offset:1px}',
            '.scd-dock svg,.scd-quick svg{width:15px;height:15px;fill:currentColor}',
            '.scd-dock button[aria-pressed="true"]{color:#fff;background:linear-gradient(120deg,var(--sca-c1,#ff5500),var(--sca-c3,#ff9a52));box-shadow:0 4px 14px -4px var(--sca-c1,#ff5500)}',
            '.scd-dock button.pop{animation:scd-pop .45s cubic-bezier(.2,.8,.2,1.6)}',
            '.scd-quick{position:fixed;z-index:2147480000;display:flex;gap:2px;padding:3px;border-radius:999px;background:rgba(16,18,30,.78);backdrop-filter:blur(16px) saturate(1.5);-webkit-backdrop-filter:blur(16px) saturate(1.5);box-shadow:0 10px 30px -10px rgba(0,0,0,.8),inset 0 0 0 1px rgba(255,255,255,.1);opacity:0;transform:translateY(4px) scale(.96);pointer-events:none;transition:opacity .18s ease,transform .25s cubic-bezier(.2,.8,.2,1.3)}',
            '.scd-quick.on{opacity:1;transform:none;pointer-events:auto}',
            '.scd-quick button{width:auto;padding:0 10px 0 8px;gap:6px;display:inline-flex;align-items:center;font:600 12px/1 inherit;font-family:inherit;white-space:nowrap}',
            '@keyframes scd-in{from{opacity:0;transform:translateX(-6px) scale(.9)}}',
            '@keyframes scd-pop{40%{transform:scale(1.25)}}',
            'html.scm-reduce .scd-dock,html.scm-reduce .scd-quick,html.scm-reduce .scd-dock button{animation:none!important;transition:none!important}',
            '@media (prefers-reduced-motion:reduce){.scd-dock,.scd-quick,.scd-dock button{animation:none!important;transition:none!important}}',
        ].join('\n');
        document.head.append(style);
    }
    const button = (act: string, label: string, text = ''): HTMLButtonElement => {
        const node = document.createElement('button');
        node.type = 'button';
        node.dataset.act = act;
        node.setAttribute('aria-label', label);
        node.title = label;
        node.insertAdjacentHTML('beforeend', ICON[act === 'next' ? 'next' : act === 'last' ? 'last' : act]);
        if (text) node.append(text);
        return node;
    };

    // Док: в бар после бейджа трека. Цель действий это ссылка на трек в бейдже, по ней меню находит трек
    const dock = document.createElement('span');
    dock.className = 'scd-dock';
    dock.setAttribute('role', 'group');
    dock.append(button('dislike', T.dislike), button('more', T.more), button('wave', T.wave), button('next', T.next));
    const badgeLink = (): Element | null => document.querySelector('.playControls a.playbackSoundBadge__titleLink');
    const ACTS: Record<string, [string, string]> = { dislike: ['dislike', 'undislike'], more: ['more', 'unmore'] };
    dock.addEventListener('click', (event) => {
        const control = (event.target as Element | null)?.closest<HTMLButtonElement>('button[data-act]');
        const link = badgeLink();
        if (!control || !link) return;
        const act = control.dataset.act ?? '';
        const pair = ACTS[act];
        const name = pair ? (control.getAttribute('aria-pressed') === 'true' ? pair[1] : pair[0]) : act === 'wave' ? 'wave-track' : 'queue-next';
        if (core.actOn(link, name)) {
            control.classList.remove('pop');
            void control.offsetWidth;
            control.classList.add('pop');
            setTimeout(sync, 400);
        }
    });
    let shownFor = '';
    function sync(): void {
        if (core.disposed()) return;
        const badge = document.querySelector('.playControls .playbackSoundBadge');
        if (!badge) {
            dock.remove();
            return;
        }
        if (dock.parentElement !== badge.parentElement || dock.previousElementSibling !== badge) badge.after(dock);
        const link = badgeLink();
        const key = (link?.getAttribute('href') ?? '') + '|' + Date.now().toString().slice(0, -3);
        if (key === shownFor) return;
        shownFor = key;
        const acts = link ? core.actsOn(link) : [];
        for (const control of dock.querySelectorAll<HTMLButtonElement>('button[data-act]')) {
            const pair = ACTS[control.dataset.act ?? ''];
            if (pair) control.setAttribute('aria-pressed', String(acts.includes(pair[1])));
        }
    }

    // Быстрые действия у строк треков: одна полоска на страницу, встаёт у правого края строки под курсором
    const ITEMS = '.soundList__item, .searchItem__trackItem, .trackItem, .compactTrackList__item, .systemPlaylistTrackList__item, .historicalPlays__item, .soundBadge';
    const quick = document.createElement('div');
    quick.className = 'scd-quick';
    quick.setAttribute('role', 'toolbar');
    quick.append(button('next', T.next, T.next), button('last', T.last, ru ? 'В очередь' : 'Queue'), button('wave', T.wave, T.waveShort));
    document.body.append(quick);
    let row: Element | null = null;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    const place = (): void => {
        if (!row || !row.isConnected) return hide();
        const box = row.getBoundingClientRect();
        if (box.bottom < 0 || box.top > window.innerHeight) return hide();
        const width = quick.offsetWidth || 240;
        quick.style.left = Math.max(8, Math.min(window.innerWidth - width - 8, box.right - width - 12)) + 'px';
        quick.style.top = Math.max(8, box.top + 8) + 'px';
        quick.classList.add('on');
    };
    function hide(): void {
        row = null;
        quick.classList.remove('on');
    }
    const onOver = (event: MouseEvent): void => {
        const target = event.target instanceof Element ? event.target : null;
        if (!target || quick.contains(target)) {
            if (hideTimer) clearTimeout(hideTimer);
            return;
        }
        const item = target.closest(ITEMS);
        if (item && item.closest('.playControls')) return;
        if (item === row) {
            if (hideTimer) clearTimeout(hideTimer);
            return;
        }
        if (hideTimer) clearTimeout(hideTimer);
        if (!item) {
            hideTimer = setTimeout(hide, 220);
            return;
        }
        // Только строки трека: у плейлиста и пользователя «Следующим» нет
        if (!core.actsOn(item).includes('queue-next')) return hide();
        row = item;
        place();
    };
    quick.addEventListener('click', (event) => {
        const control = (event.target as Element | null)?.closest<HTMLButtonElement>('button[data-act]');
        if (!control || !row) return;
        const act = control.dataset.act === 'next' ? 'queue-next' : control.dataset.act === 'last' ? 'queue-last' : 'wave-track';
        const link = row.querySelector('a.soundTitle__title, a.trackItem__trackTitle, a.compactTrackListItem__trackTitle, a[href]') ?? row;
        core.actOn(link, act);
        hide();
    });
    const onScroll = (): void => {
        if (row) place();
    };
    document.addEventListener('mouseover', onOver, true);
    document.addEventListener('scroll', onScroll, true);
    const timer = setInterval(sync, 1000);
    sync();
    return {
        sync,
        dispose() {
            clearInterval(timer);
            document.removeEventListener('mouseover', onOver, true);
            document.removeEventListener('scroll', onScroll, true);
            dock.remove();
            quick.remove();
            document.getElementById(STYLE_ID)?.remove();
        },
    };
}
