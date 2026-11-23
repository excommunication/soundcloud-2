// Дата лайка на странице лайков: сайт получает {created_at, track} и дату не показывает. Раздел наблюдает ответы
// track_likes (fetch), запоминает дату по пути трека и добавляет к строкам и плиткам метку «лайк: 3 дня назад».
// Раздел страницы волны: installLikes уходит на страницу текстом и ни на что снаружи не ссылается
export interface LikesCore {
    lang: 'ru' | 'en';
    disposed(): boolean;
    /** Идентификатор вошедшего пользователя; 0, если неизвестен */
    userId(): Promise<number>;
    /** GET api-v2 с правилами сайта (ключ клиента и вход подставляет сайт); null при сбое */
    get(url: string): Promise<unknown>;
}
export interface LikesSection {
    dispose(): void;
}

export function installLikes(core: LikesCore): LikesSection {
    const ru = core.lang === 'ru';
    const dates = new Map<string, number>();
    let loading = false;
    let loaded = false;
    const pathOf = (value: string): string => {
        try {
            return new URL(value, location.origin).pathname.replace(/\/+$/, '').toLowerCase();
        } catch {
            return '';
        }
    };
    const plural = (n: number, one: string, few: string, many: string): string => {
        const m10 = n % 10;
        const m100 = n % 100;
        return n + ' ' + (m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? few : many);
    };
    const ago = (time: number): string => {
        const days = Math.floor((Date.now() - time) / 86400000);
        if (days <= 0) return ru ? 'лайк сегодня' : 'liked today';
        if (days === 1) return ru ? 'лайк вчера' : 'liked yesterday';
        if (days < 14) return ru ? 'лайк ' + plural(days, 'день', 'дня', 'дней') + ' назад' : 'liked ' + days + ' days ago';
        if (days < 60) return ru ? 'лайк ' + plural(Math.floor(days / 7), 'неделю', 'недели', 'недель') + ' назад' : 'liked ' + Math.floor(days / 7) + ' weeks ago';
        if (days < 700) return ru ? 'лайк ' + plural(Math.floor(days / 30), 'месяц', 'месяца', 'месяцев') + ' назад' : 'liked ' + Math.floor(days / 30) + ' months ago';
        return ru ? 'лайк ' + plural(Math.floor(days / 365), 'год', 'года', 'лет') + ' назад' : 'liked ' + Math.floor(days / 365) + ' years ago';
    };
    const remember = (body: unknown): void => {
        const list = (body as { collection?: unknown } | null)?.collection;
        if (!Array.isArray(list)) return;
        const counts = new Map<string, number>();
        for (const entry of list) {
            const at = (entry as { created_at?: unknown } | null)?.created_at;
            if (typeof at === 'string') counts.set(at, (counts.get(at) ?? 0) + 1);
        }
        for (const entry of list) {
            const value = entry as { created_at?: unknown; track?: { permalink_url?: unknown } } | null;
            const url = value?.track?.permalink_url;
            const at = typeof value?.created_at === 'string' ? value.created_at : '';
            // Массовый импорт ставит сотням лайков одну секунду: такая дата не дата лайка
            if (typeof url !== 'string' || !at || (counts.get(at) ?? 0) >= 10) continue;
            const time = Date.parse(at);
            if (Number.isFinite(time)) dates.set(pathOf(url), time);
        }
    };
    const STYLE_ID = 'scl-style';
    function ensureStyle(): void {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent =
            '.scl-chip{display:inline-flex;align-items:center;gap:5px;margin-left:10px;padding:2px 9px 2px 7px;border-radius:999px;font:600 11px/16px system-ui,-apple-system,sans-serif;white-space:nowrap;' +
            'color:rgba(255,255,255,.78);background:rgba(255,255,255,.07);box-shadow:inset 0 0 0 1px rgba(255,255,255,.09);vertical-align:middle}' +
            '.scl-chip svg{width:11px;height:11px;fill:var(--sc2-accent,#ff5500)}';
        document.head.append(style);
    }
    const HEART = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 14S2 10.5 2 6.2C2 4.2 3.4 3 5.1 3c1.2 0 2.2.7 2.9 1.7C8.7 3.7 9.7 3 10.9 3 12.6 3 14 4.2 14 6.2 14 10.5 8 14 8 14z"/></svg>';
    let frame = 0;
    function paint(): void {
        if (core.disposed() || !/\/likes\/?$/.test(location.pathname)) return;
        void load();
        if (!dates.size) return;
        ensureStyle();
        const rows = document.querySelectorAll<HTMLElement>('.soundList__item, .trackList__item, .compactTrackList__item, .badgeList__item, .lazyLoadingList__item');
        for (const row of rows) {
            if (row.querySelector('.scl-chip')) continue;
            const link = row.querySelector<HTMLAnchorElement>('a.soundTitle__title, a.trackItem__trackTitle, a.playableTile__heading, a.playableTile__artworkLink');
            const time = link ? dates.get(pathOf(link.getAttribute('href') ?? '')) : undefined;
            if (!link || !time) continue;
            const chip = document.createElement('span');
            chip.className = 'scl-chip';
            chip.title = new Date(time).toLocaleString(ru ? 'ru-RU' : 'en-US');
            chip.insertAdjacentHTML('beforeend', HEART);
            chip.append(ago(time));
            const anchor = row.querySelector('.soundTitle__usernameText, .trackItem__username, .playableTile__usernameHeading') ?? link;
            anchor.parentElement?.append(chip);
        }
    }
    function schedule(): void {
        if (frame) return;
        frame = window.setTimeout(() => {
            frame = 0;
            try {
                paint();
            } catch (error) {
                console.warn('Даты лайков: не вышло', error);
            }
        }, 250);
    }
    // Даты лайков сайт на странице не показывает: свои страницы track_likes запрашиваются через его же api, по 200 штук, до 1000
    async function load(): Promise<void> {
        if (loading || loaded || core.disposed()) return;
        loading = true;
        try {
            const user = await core.userId();
            if (!user) return;
            let url: string | null = 'https://api-v2.soundcloud.com/users/' + user + '/track_likes?limit=200';
            for (let page = 0; url && page < 5 && !core.disposed(); page++) {
                const body = (await core.get(url)) as { next_href?: unknown } | null;
                if (!body) return;
                remember(body);
                schedule();
                url = typeof body.next_href === 'string' && body.next_href.startsWith('https://api-v2.soundcloud.com/') ? body.next_href : null;
            }
            loaded = true;
        } catch {
            // страница без дат: метки просто не рисуются, повтор при следующем заходе
        } finally {
            loading = false;
        }
    }
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    schedule();
    return {
        dispose() {
            observer.disconnect();
            clearTimeout(frame);
            for (const chip of document.querySelectorAll('.scl-chip')) chip.remove();
        },
    };
}
