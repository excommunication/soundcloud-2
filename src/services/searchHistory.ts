interface SearchHistoryWindow extends Window {
    __disposeSearchHistory?: () => void;
    __scNavigate?: (path: string) => boolean;
}

export interface SearchEntry {
    q: string;
    at: number;
}

/** Сколько запросов помнит история */
export const SEARCH_HISTORY_LIMIT = 12;

// История поиска сайта: запросы хранятся в localStorage страницы soundcloud.com (профиль клиента), под полем поиска
// появляется список недавних, пока поле пустое. Чистые функции уходят на страницу текстом вместе с installSearchHistory

/** Запрос в начало истории: без пустых, без дублей (регистр и пробелы не различаются), не длиннее лимита */
export function rememberQuery(list: readonly SearchEntry[], query: string, now: number, limit: number): SearchEntry[] {
    const q = query.replace(/\s+/g, ' ').trim().slice(0, 200);
    if (!q) return list.slice(0, limit);
    const key = q.toLowerCase();
    return [{ q, at: now }, ...list.filter((entry) => entry.q.toLowerCase() !== key)].slice(0, limit);
}

/** История из хранилища: битые записи отбрасываются */
export function readHistory(raw: string | null, limit: number): SearchEntry[] {
    if (!raw) return [];
    try {
        const value: unknown = JSON.parse(raw);
        if (!Array.isArray(value)) return [];
        return value
            .filter((entry): entry is SearchEntry => !!entry && typeof entry === 'object' && typeof (entry as SearchEntry).q === 'string' && (entry as SearchEntry).q.trim() !== '' && typeof (entry as SearchEntry).at === 'number')
            .map((entry) => ({ q: entry.q.slice(0, 200), at: entry.at }))
            .slice(0, limit);
    } catch {
        return [];
    }
}

/** Путь страницы поиска; кодируются и символы, которые encodeURIComponent оставляет как есть */
export function searchPath(query: string): string {
    return '/search?q=' + encodeURIComponent(query).replace(/[!'()*]/g, (char) => '%' + char.charCodeAt(0).toString(16).toUpperCase());
}

export function installSearchHistory(
    remember: typeof rememberQuery,
    read: typeof readHistory,
    pathOf: typeof searchPath,
    limit: number,
    lang: 'ru' | 'en',
): void {
    const host = window as SearchHistoryWindow;
    host.__disposeSearchHistory?.();
    const KEY = 'sc2-search-history';
    const ru = lang === 'ru';
    const load = (): SearchEntry[] => {
        try {
            return read(localStorage.getItem(KEY), limit);
        } catch {
            return [];
        }
    };
    const save = (list: SearchEntry[]): void => {
        try {
            if (list.length) localStorage.setItem(KEY, JSON.stringify(list));
            else localStorage.removeItem(KEY);
        } catch {
            // хранилище недоступно: история живёт до перезагрузки страницы
        }
    };
    const add = (query: string): void => save(remember(load(), query, Date.now(), limit));
    const field = (target: EventTarget | null): HTMLInputElement | null =>
        target instanceof HTMLInputElement && target.closest('form.headerSearch') ? target : null;

    const style = document.createElement('style');
    style.id = 'sch-style';
    style.textContent =
        '.sch-panel{position:fixed;z-index:10050;min-width:280px;padding:6px;border-radius:var(--sc2-r3,16px);font-family:inherit;color:#fff;' +
        'background:var(--sc2-panel,rgba(14,16,24,.92));backdrop-filter:var(--sc2-blur,blur(22px) saturate(1.4));-webkit-backdrop-filter:var(--sc2-blur,blur(22px) saturate(1.4));' +
        'box-shadow:inset 0 0 0 1px var(--sc2-line,rgba(255,255,255,.1)),var(--sc2-shadow,0 24px 60px -24px rgba(0,0,0,.85));animation:sch-in .14s cubic-bezier(.2,.8,.2,1)}' +
        '@keyframes sch-in{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}' +
        '.sch-head{display:flex;align-items:center;justify-content:space-between;padding:6px 10px 6px 12px;font-size:12px;font-weight:600;color:var(--sc2-text-3,rgba(255,255,255,.5))}' +
        '.sch-clear{border:0;background:none;padding:4px 8px;border-radius:999px;font:inherit;font-size:12px;font-weight:600;color:var(--sc2-text-2,rgba(255,255,255,.72));cursor:pointer}' +
        '.sch-clear:hover{background:var(--sc2-surface-2,rgba(255,255,255,.09));color:#fff}' +
        '.sch-item{display:flex;align-items:center;gap:10px;height:38px;padding:0 6px 0 12px;border-radius:var(--sc2-r1,8px);cursor:pointer;font-size:14px;font-weight:500}' +
        '.sch-item[aria-selected="true"],.sch-item:hover{background:var(--sc2-surface-2,rgba(255,255,255,.09))}' +
        '.sch-item>svg{flex:none;width:16px;height:16px;fill:none;stroke:var(--sc2-text-3,rgba(255,255,255,.5));stroke-width:1.6}' +
        '.sch-text{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
        '.sch-x{flex:none;width:28px;height:28px;display:grid;place-items:center;border:0;border-radius:999px;background:none;color:var(--sc2-text-3,rgba(255,255,255,.5));cursor:pointer;opacity:0;transition:opacity .12s ease}' +
        '.sch-item:hover .sch-x,.sch-item[aria-selected="true"] .sch-x{opacity:1}.sch-x:hover{background:var(--sc2-surface-3,rgba(255,255,255,.14));color:#fff}' +
        '.sch-x svg{width:12px;height:12px;stroke:currentColor;stroke-width:2;fill:none}' +
        '@media (prefers-reduced-motion:reduce){.sch-panel{animation:none}}html.scm-reduce .sch-panel{animation:none}';
    document.head.append(style);

    const CLOCK = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.2"/><path d="M8 4.8V8l2.2 1.4"/></svg>';
    const CROSS = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7"/></svg>';
    let panel: HTMLElement | null = null;
    let input: HTMLInputElement | null = null;
    let active = -1;
    const close = (): void => {
        panel?.remove();
        panel = null;
        active = -1;
        input?.removeAttribute('aria-activedescendant');
    };
    const go = (query: string): void => {
        close();
        if (input) {
            input.value = query;
            input.blur();
        }
        add(query);
        const path = pathOf(query);
        if (!host.__scNavigate?.(path)) location.assign(path);
    };
    const mark = (index: number): void => {
        if (!panel) return;
        const items = [...panel.querySelectorAll<HTMLElement>('.sch-item')];
        active = items.length ? (index + items.length) % items.length : -1;
        items.forEach((item, i) => item.setAttribute('aria-selected', String(i === active)));
        if (active >= 0) input?.setAttribute('aria-activedescendant', items[active].id);
    };
    const open = (target: HTMLInputElement): void => {
        input = target;
        const list = load();
        if (target.value.trim() || !list.length) {
            close();
            return;
        }
        panel?.remove();
        panel = document.createElement('div');
        panel.className = 'sch-panel';
        panel.setAttribute('role', 'listbox');
        panel.setAttribute('aria-label', ru ? 'Недавние запросы' : 'Recent searches');
        // Нажатие внутри списка не уводит фокус из поля: иначе blur закроет список раньше клика
        panel.addEventListener('mousedown', (event) => event.preventDefault());
        const head = document.createElement('div');
        head.className = 'sch-head';
        head.textContent = ru ? 'Недавние запросы' : 'Recent searches';
        const clear = document.createElement('button');
        clear.type = 'button';
        clear.className = 'sch-clear';
        clear.textContent = ru ? 'Очистить' : 'Clear';
        clear.addEventListener('click', () => {
            save([]);
            close();
        });
        head.append(clear);
        panel.append(head);
        list.forEach((entry, index) => {
            const item = document.createElement('div');
            item.className = 'sch-item';
            item.id = 'sch-item-' + index;
            item.setAttribute('role', 'option');
            item.setAttribute('aria-selected', 'false');
            item.insertAdjacentHTML('beforeend', CLOCK);
            const text = document.createElement('span');
            text.className = 'sch-text';
            text.textContent = entry.q;
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'sch-x';
            remove.title = ru ? 'Удалить из истории' : 'Remove from history';
            remove.setAttribute('aria-label', remove.title);
            remove.innerHTML = CROSS;
            remove.addEventListener('click', (event) => {
                event.stopPropagation();
                save(load().filter((other) => other.q.toLowerCase() !== entry.q.toLowerCase()));
                open(target);
            });
            item.append(text, remove);
            item.addEventListener('click', () => go(entry.q));
            item.addEventListener('mousemove', () => mark(index));
            panel?.append(item);
        });
        const rect = (target.closest('form.headerSearch') ?? target).getBoundingClientRect();
        panel.style.left = Math.round(rect.left) + 'px';
        panel.style.top = Math.round(rect.bottom + 6) + 'px';
        panel.style.width = Math.round(Math.max(280, rect.width)) + 'px';
        document.body.append(panel);
    };

    const onFocus = (event: FocusEvent): void => {
        const target = field(event.target);
        if (target) open(target);
    };
    const onBlur = (event: FocusEvent): void => {
        if (field(event.target)) close();
    };
    const onInput = (event: Event): void => {
        const target = field(event.target);
        if (target) open(target);
    };
    const onKey = (event: KeyboardEvent): void => {
        const target = field(event.target);
        if (!target || !panel) return;
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            event.stopImmediatePropagation();
            mark(active + (event.key === 'ArrowDown' ? 1 : -1));
        } else if (event.key === 'Enter' && active >= 0) {
            const text = panel.querySelectorAll('.sch-text')[active]?.textContent ?? '';
            if (!text) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            go(text);
        } else if (event.key === 'Escape') {
            close();
        }
    };
    // Запрос запоминается, когда открыта страница поиска: и после Enter, и после перехода по подсказке сайта
    let seen = '';
    const watch = (): void => {
        if (location.pathname !== '/search' && !location.pathname.startsWith('/search/')) return;
        const query = new URLSearchParams(location.search).get('q') ?? '';
        if (!query.trim() || query === seen) return;
        seen = query;
        add(query);
    };
    const timer = window.setInterval(watch, 1000);
    watch();
    const onResize = (): void => close();
    window.addEventListener('focusin', onFocus, true);
    window.addEventListener('focusout', onBlur, true);
    window.addEventListener('input', onInput, true);
    // Раньше обработчика ссылок в поиске: стрелки и Enter по пункту списка забирает история
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onResize);
    const dispose = (): void => {
        close();
        clearInterval(timer);
        style.remove();
        window.removeEventListener('focusin', onFocus, true);
        window.removeEventListener('focusout', onBlur, true);
        window.removeEventListener('input', onInput, true);
        window.removeEventListener('keydown', onKey, true);
        window.removeEventListener('resize', onResize);
        window.removeEventListener('pagehide', dispose);
        delete host.__disposeSearchHistory;
    };
    host.__disposeSearchHistory = dispose;
    window.addEventListener('pagehide', dispose, { once: true });
}

export function searchHistoryScript(lang: 'ru' | 'en'): string {
    return (
        '(' + installSearchHistory.toString() + ')(' + rememberQuery.toString() + ',' + readHistory.toString() + ',' + searchPath.toString() + ',' +
        SEARCH_HISTORY_LIMIT + ',' + JSON.stringify(lang) + ');'
    );
}
