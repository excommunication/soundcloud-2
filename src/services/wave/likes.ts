// Дата лайка на странице лайков: сайт получает {created_at, track} и дату не показывает. Раздел наблюдает ответы
// track_likes (fetch), запоминает дату по пути трека и добавляет к строкам и плиткам метку «лайк: 3 дня назад».
// Серия: сколько дней подряд ставились лайки, огонёк у заголовка вкладки.
// Раздел страницы волны: installLikes и likeStreak уходят на страницу текстом (pageHelpers в wave.ts) и ни на что
// снаружи не ссылаются
export interface LikeStreak {
    /** Дней подряд с лайком, считая сегодня или вчера */
    days: number;
    /** Сегодня лайк уже был: серия продлена */
    today: boolean;
    /** Самая длинная серия среди известных дат */
    best: number;
}

/** Серия лайков по местным дням: жива, пока лайк был сегодня или вчера */
export function likeStreak(times: Iterable<number>, now: number): LikeStreak {
    const dayOf = (time: number): number => {
        const date = new Date(time);
        return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000;
    };
    const days = new Set<number>();
    for (const time of times) if (Number.isFinite(time) && time <= now) days.add(dayOf(time));
    const sorted = [...days].sort((a, b) => a - b);
    let best = 0;
    let run = 0;
    for (let i = 0; i < sorted.length; i++) {
        run = i > 0 && sorted[i] === sorted[i - 1] + 1 ? run + 1 : 1;
        best = Math.max(best, run);
    }
    const todayKey = dayOf(now);
    const today = days.has(todayKey);
    let day = today ? todayKey : todayKey - 1;
    let count = 0;
    while (days.has(day)) {
        count++;
        day--;
    }
    return { days: count, today, best };
}

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
    // В плитке места мало: короткая метка «вчера», «3 дн.», полная дата во всплывающей подсказке
    const short = (time: number): string => {
        const days = Math.floor((Date.now() - time) / 86400000);
        if (days <= 0) return ru ? 'сегодня' : 'today';
        if (days === 1) return ru ? 'вчера' : '1d';
        if (days < 14) return ru ? days + ' дн.' : days + 'd';
        if (days < 60) return ru ? Math.floor(days / 7) + ' нед.' : Math.floor(days / 7) + 'w';
        if (days < 700) return ru ? Math.floor(days / 30) + ' мес.' : Math.floor(days / 30) + 'mo';
        return ru ? Math.floor(days / 365) + ' г.' : Math.floor(days / 365) + 'y';
    };
    const STYLE_ID = 'scl-style';
    const PAGE = 'scl-likes';
    // Сетка лайков (html.scl-likes): одна стеклянная карточка вместо двух вложенных, название в две строки, автор
    // на месте, дата лайка бейджем на обложке, кнопка «убрать из лайков» появляется на наведении
    const T = 'html.' + PAGE + ' ';
    const TILE = T + '.badgeList__item .playableTile';
    function ensureStyle(): void {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent =
            '.scl-chip{display:inline-flex;align-items:center;gap:5px;margin-left:10px;padding:2px 9px 2px 7px;border-radius:999px;font-family:inherit;font-size:12px;font-weight:600;line-height:16px;white-space:nowrap;' +
            'color:var(--sc2-text-2,rgba(255,255,255,.78));background:var(--sc2-surface-1,rgba(255,255,255,.07));box-shadow:inset 0 0 0 1px var(--sc2-line,rgba(255,255,255,.09));vertical-align:middle}' +
            '.scl-chip svg{width:11px;height:11px;fill:var(--sc2-accent,#ff5500)}' +
            T + '.badgeList__item:has(.playableTile){height:auto!important;padding:0!important;background:none!important;box-shadow:none!important;transform:none!important}' +
            TILE + '{position:relative;margin:0!important;padding:8px 8px 12px!important;height:auto!important;border-radius:var(--sc2-r3,16px);' +
            'background:var(--sc2-surface-1,rgba(255,255,255,.05));box-shadow:inset 0 0 0 1px var(--sc2-line,rgba(255,255,255,.08));' +
            'transition:background-color var(--sc2-mid,240ms) var(--sc2-ease,ease),transform var(--sc2-mid,240ms) var(--sc2-ease,ease),box-shadow var(--sc2-mid,240ms) ease}' +
            TILE + ':hover,' + TILE + ':focus-within{background:var(--sc2-surface-2,rgba(255,255,255,.09));transform:translateY(-4px);' +
            'box-shadow:inset 0 0 0 1px var(--sc2-line,rgba(255,255,255,.1)),var(--sc2-shadow,0 24px 60px -24px rgba(0,0,0,.85))}' +
            TILE + ' .playableTile__artwork{position:relative;border-radius:var(--sc2-r2,12px);overflow:hidden}' +
            // Высота описания на две строки названия и строку автора: автор сразу под названием, карточки в ряду ровные
            TILE + ' .playableTile__description{margin-top:10px!important;padding:0 2px;min-width:0;min-height:53px}' +
            // Своё сердце сайта в описании и его полоска действий: на вкладке лайков их заменяет одна кнопка на обложке
            TILE + ' .playableTile__descriptionContainer>:not(.playableTile__heading),' + TILE + ' .playableTile__mainHeadingIcon,' + TILE + ' .playableTile__actions{display:none!important}' +
            TILE + ' .playableTile__heading{display:-webkit-box!important;-webkit-box-orient:vertical;-webkit-line-clamp:2;white-space:normal!important;overflow:hidden;' +
            'font-size:13px!important;line-height:17px!important;font-weight:600!important;color:var(--sc2-text,#fff)!important}' +
            TILE + ' .playableTile__usernameHeadingContainer{display:flex!important;margin-top:3px;min-width:0}' +
            TILE + ' .playableTile__usernameHeading{display:block;min-width:0;font-size:12px!important;line-height:16px!important;color:var(--sc2-text-3,rgba(255,255,255,.55))!important;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
            TILE + ' .playableTile__usernameHeading:hover{color:var(--sc2-text,#fff)!important}' +
            // Дата лайка: стеклянный бейдж в левом нижнем углу обложки
            '.scl-badge{position:absolute;left:6px;bottom:6px;z-index:3;display:inline-flex;align-items:center;gap:4px;height:20px;padding:0 7px 0 6px;border-radius:999px;' +
            'font-family:inherit;font-size:11px;font-weight:600;line-height:20px;color:#fff;background:rgba(10,12,18,.55);backdrop-filter:blur(10px) saturate(1.4);-webkit-backdrop-filter:blur(10px) saturate(1.4);box-shadow:inset 0 0 0 1px rgba(255,255,255,.12)}' +
            '.scl-badge svg{width:10px;height:10px;fill:var(--sc2-accent,#ff5500)}' +
            // Кнопка «убрать из лайков»: появляется на наведении карточки, в правом верхнем углу обложки
            '.scl-unlike{position:absolute;right:6px;top:6px;z-index:4;width:32px;height:32px;display:grid;place-items:center;padding:0;border:0;border-radius:999px;cursor:pointer;' +
            'color:var(--sc2-accent,#ff5500);background:rgba(10,12,18,.6);backdrop-filter:blur(10px) saturate(1.4);-webkit-backdrop-filter:blur(10px) saturate(1.4);box-shadow:inset 0 0 0 1px rgba(255,255,255,.14);' +
            'opacity:0;transform:scale(.8);transition:opacity var(--sc2-fast,140ms) ease,transform var(--sc2-mid,240ms) var(--sc2-ease,ease),background-color var(--sc2-fast,140ms) ease}' +
            '.scl-unlike svg{width:16px;height:16px;fill:currentColor;pointer-events:none}' +
            '.scl-unlike .scl-off,.scl-unlike .scl-back{display:none}' +
            '.playableTile:hover .scl-unlike,.playableTile:focus-within .scl-unlike,.scl-gone .scl-unlike{opacity:1;transform:none}' +
            '.scl-unlike:hover{background:rgba(10,12,18,.82)}' +
            '.scl-unlike:hover .scl-on{display:none}.scl-unlike:hover .scl-off{display:block}' +
            '.scl-unlike:focus-visible{outline:2px solid var(--sc2-accent,#fff);outline-offset:2px}' +
            '.scl-unlike:active{transform:scale(.88)}' +
            // Убранный лайк: карточка тускнеет, кнопка остаётся видна и возвращает лайк
            '.scl-gone .playableTile__artwork .sc-artwork,.scl-gone .playableTile__description{opacity:.4;filter:grayscale(.7);transition:opacity .3s ease,filter .3s ease}' +
            '.scl-gone .scl-unlike{color:rgba(255,255,255,.85)}' +
            '.scl-gone .scl-unlike .scl-on,.scl-gone .scl-unlike:hover .scl-off{display:none}.scl-gone .scl-unlike .scl-back{display:block}' +
            '@media (hover:none){.scl-unlike{opacity:1;transform:none}}' +
            '@media (prefers-reduced-motion:reduce){' + TILE + ',.scl-unlike{transition:none!important;transform:none!important}}' +
            'html.scm-reduce .scl-unlike,html.scm-reduce.' + PAGE + ' .badgeList__item .playableTile{transition:none!important;transform:none!important}' +
            // Серия: стеклянная таблетка с живым огоньком; погасшая (сегодня ещё без лайка) тусклее и без движения
            '.scl-streak{display:inline-flex;align-items:center;gap:7px;height:32px;margin-left:14px;padding:0 13px 0 8px;border-radius:999px;cursor:default;white-space:nowrap;' +
            'font-family:inherit;font-size:13px;font-weight:700;line-height:32px;color:#fff;' +
            'background:radial-gradient(120% 140% at 15% 50%,rgba(255,110,20,.28),rgba(255,110,20,.06) 60%,rgba(255,255,255,.04));' +
            'box-shadow:inset 0 0 0 1px rgba(255,150,60,.28),0 6px 24px -10px rgba(255,90,0,.7);vertical-align:middle;transition:box-shadow .3s ease,transform .3s cubic-bezier(.2,.8,.2,1)}' +
            '.scl-streak:hover{transform:translateY(-1px);box-shadow:inset 0 0 0 1px rgba(255,170,80,.45),0 10px 30px -10px rgba(255,100,0,.9)}' +
            '.scl-streak b{font-weight:800;font-size:15px;background:linear-gradient(180deg,#ffe082,#ff9100 70%,#ff5a00);-webkit-background-clip:text;background-clip:text;color:transparent}' +
            '.scl-streak small{font-size:12px;font-weight:600;color:rgba(255,255,255,.62)}' +
            '.scl-flame{width:22px;height:22px;overflow:visible;filter:drop-shadow(0 0 6px rgba(255,120,0,.75)) drop-shadow(0 0 2px rgba(255,200,80,.6))}' +
            '.scl-flame .scl-f1{transform-origin:12px 22px;animation:scl-flicker 1.7s ease-in-out infinite}' +
            '.scl-flame .scl-f2{transform-origin:12px 22px;animation:scl-core 1.1s ease-in-out infinite alternate}' +
            '.scl-flame .scl-spark{transform-origin:center;opacity:0;animation:scl-spark 2.4s ease-out infinite}' +
            '.scl-flame .scl-spark+.scl-spark{animation-delay:1.2s}' +
            '@keyframes scl-flicker{0%,100%{transform:scale(1,1) skewX(0)}25%{transform:scale(1.04,.96) skewX(-3deg)}50%{transform:scale(.97,1.06) skewX(2deg)}75%{transform:scale(1.02,.98) skewX(-1deg)}}' +
            '@keyframes scl-core{from{transform:scale(.9,.86);opacity:.85}to{transform:scale(1.05,1.08);opacity:1}}' +
            '@keyframes scl-spark{0%{opacity:0;transform:translate(0,0) scale(1)}20%{opacity:1}100%{opacity:0;transform:translate(1px,-9px) scale(.3)}}' +
            // Неделя и больше: огонёк ярче и крупнее
            '.scl-streak.scl-hot .scl-flame{width:24px;height:24px;filter:drop-shadow(0 0 9px rgba(255,110,0,.95)) drop-shadow(0 0 3px rgba(255,220,120,.8))}' +
            '.scl-streak.scl-cold{background:rgba(255,255,255,.05);box-shadow:inset 0 0 0 1px rgba(255,255,255,.1)}' +
            '.scl-streak.scl-cold b{background:none;color:rgba(255,255,255,.75)}' +
            '.scl-streak.scl-cold .scl-flame{filter:grayscale(.85) brightness(.85);opacity:.7}' +
            '.scl-streak.scl-cold .scl-flame *{animation:none}' +
            '.scl-streak.scl-wait .scl-spark{display:none}.scl-streak.scl-wait .scl-flame{opacity:.8}' +
            '@media (prefers-reduced-motion:reduce){.scl-flame *{animation:none!important}.scl-streak{transition:none}}' +
            'html.scm-reduce .scl-flame *{animation:none!important}';
        document.head.append(style);
    }
    const HEART = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 14S2 10.5 2 6.2C2 4.2 3.4 3 5.1 3c1.2 0 2.2.7 2.9 1.7C8.7 3.7 9.7 3 10.9 3 12.6 3 14 4.2 14 6.2 14 10.5 8 14 8 14z"/></svg>';
    // Разбитое сердце на наведении: нажатие уберёт трек из лайков; контурное сердце возвращает лайк
    const BROKEN =
        '<svg class="scl-off" viewBox="0 0 16 16" aria-hidden="true"><path d="M7.3 4.1 6.4 7l2 1.6-1.2 3.6-.5 1C3.9 11 2 8.7 2 6.2 2 4.2 3.4 3 5.1 3c.9 0 1.6.4 2.2 1.1zM9.4 13.2l1-3.4-2-1.6 1.1-3.6C10 4 10.5 3 10.9 3 12.6 3 14 4.2 14 6.2c0 2.6-2 5-4.6 7z"/></svg>';
    const OUTLINE =
        '<svg class="scl-back" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 14S2 10.5 2 6.2C2 4.2 3.4 3 5.1 3c1.2 0 2.2.7 2.9 1.7C8.7 3.7 9.7 3 10.9 3 12.6 3 14 4.2 14 6.2 14 10.5 8 14 8 14zm0-1.8c2.6-1.8 4.6-4 4.6-6 0-1.3-.8-1.9-1.7-1.9-.8 0-1.5.5-2 1.3L8 6.9 7.1 5.6c-.5-.8-1.2-1.3-2-1.3-.9 0-1.7.6-1.7 1.9 0 2 2 4.2 4.6 6z"/></svg>';
    const label = (gone: boolean): string => (gone ? (ru ? 'Вернуть в лайки' : 'Like again') : ru ? 'Убрать из лайков' : 'Remove from likes');
    // Огонёк: внешнее пламя колышется от основания, сердцевина дышит, две искры улетают вверх
    const FLAME =
        '<svg class="scl-flame" viewBox="0 0 24 24" aria-hidden="true"><defs>' +
        '<linearGradient id="scl-fg1" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff3d00"/><stop offset=".55" stop-color="#ff8a00"/><stop offset="1" stop-color="#ffd54f"/></linearGradient>' +
        '<linearGradient id="scl-fg2" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ffb300"/><stop offset="1" stop-color="#fff8d6"/></linearGradient></defs>' +
        '<path class="scl-f1" fill="url(#scl-fg1)" d="M12 2c.6 3.2 2.6 4.9 4.3 6.9C18 10.9 19 13 19 15.3 19 19.2 15.9 22 12 22s-7-2.8-7-6.7c0-2.4 1.2-4.4 2.7-5.8.2 1.6.9 2.8 2.1 3.5C9.6 9.6 10.2 5.3 12 2z"/>' +
        '<path class="scl-f2" fill="url(#scl-fg2)" d="M12 11.5c.4 1.9 1.7 2.9 2.6 4 .6.8 1 1.6 1 2.5 0 2.1-1.6 3.6-3.6 3.6s-3.6-1.5-3.6-3.6c0-1.3.6-2.4 1.5-3.2.1.9.5 1.5 1.2 1.9-.2-1.8.1-3.6.9-5.2z"/>' +
        '<circle class="scl-spark" cx="15.5" cy="6" r="1" fill="#ffd54f"/><circle class="scl-spark" cx="8.5" cy="8" r=".8" fill="#ffab40"/></svg>';
    const dayWord = (n: number): string => (ru ? plural(n, 'день', 'дня', 'дней') : n + (n === 1 ? ' day' : ' days'));
    // Таблетка серии у заголовка «Слушай лайкнутые треки»: число дней, огонёк, рекорд и подсказка во всплывающем
    function streakPill(): void {
        const heading = document.querySelector<HTMLElement>('.collection__likesSection .collectionSection__subHeading, .collectionSection__top .collectionSection__subHeading');
        if (!heading) return;
        const streak = likeStreak(dates.values(), Date.now());
        let pill = heading.parentElement?.querySelector<HTMLElement>('.scl-streak') ?? null;
        if (!pill) {
            pill = document.createElement('span');
            pill.className = 'scl-streak';
            pill.setAttribute('role', 'status');
            heading.after(pill);
        }
        const key = streak.days + ':' + streak.today + ':' + streak.best;
        if (pill.dataset.key === key) return;
        pill.dataset.key = key;
        pill.classList.toggle('scl-cold', streak.days === 0);
        pill.classList.toggle('scl-wait', streak.days > 0 && !streak.today);
        pill.classList.toggle('scl-hot', streak.days >= 7);
        const count = document.createElement('b');
        count.textContent = String(streak.days);
        const word = document.createElement('small');
        word.textContent = streak.days === 0 ? (ru ? 'серия' : 'streak') : ru ? plural(streak.days, 'день', 'дня', 'дней').replace(/^\d+ /, '') + ' подряд' : (streak.days === 1 ? 'day' : 'days') + ' in a row';
        pill.innerHTML = FLAME;
        pill.append(count, word);
        const best = ru ? 'Рекорд: ' + dayWord(streak.best) : 'Best: ' + dayWord(streak.best);
        pill.title =
            streak.days === 0
                ? (ru ? 'Лайкни трек, чтобы зажечь серию' : 'Like a track to start a streak') + '\n' + best
                : streak.today
                  ? (ru ? 'Серия лайков: ' + dayWord(streak.days) + ' подряд' : 'Like streak: ' + dayWord(streak.days) + ' in a row') + '\n' + best
                  : (ru ? 'Лайкни трек сегодня, чтобы серия не погасла' : 'Like a track today to keep the streak') + '\n' + best;
        pill.setAttribute('aria-label', pill.title.replace('\n', '. '));
    }
    // Кнопка на обложке жмёт скрытую кнопку лайка самого сайта: снятие и возврат лайка идут его же путём
    function unlikeButton(tile: HTMLElement, item: HTMLElement): void {
        const art = tile.querySelector<HTMLElement>('.playableTile__artwork');
        if (!art || art.querySelector('.scl-unlike') || !tile.querySelector('.sc-button-like')) return;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'scl-unlike';
        button.innerHTML = HEART.replace('<svg ', '<svg class="scl-on" ') + BROKEN + OUTLINE;
        const sync = (): void => {
            const site = tile.querySelector('.sc-button-like');
            const gone = !!site && !site.classList.contains('sc-button-selected');
            item.classList.toggle('scl-gone', gone);
            button.title = label(gone);
            button.setAttribute('aria-label', label(gone));
            button.setAttribute('aria-pressed', String(!gone));
        };
        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            tile.querySelector<HTMLElement>('.sc-button-like')?.click();
            window.setTimeout(sync, 60);
            window.setTimeout(sync, 600);
        });
        art.append(button);
        sync();
    }
    let frame = 0;
    let wasOnLikes = false;
    function paint(): void {
        if (core.disposed()) return;
        const onLikes = /\/likes\/?$/.test(location.pathname);
        document.documentElement.classList.toggle(PAGE, onLikes);
        // Повторный заход на вкладку: свежая первая страница лайков, чтобы сегодняшний лайк продлил серию
        const entered = onLikes && !wasOnLikes;
        wasOnLikes = onLikes;
        if (!onLikes) return;
        void load(entered && loaded);
        ensureStyle();
        for (const tile of document.querySelectorAll<HTMLElement>('.badgeList__item .playableTile')) {
            unlikeButton(tile, tile.closest<HTMLElement>('.badgeList__item') ?? tile);
        }
        if (!dates.size) return;
        streakPill();
        const rows = document.querySelectorAll<HTMLElement>('.soundList__item, .trackList__item, .compactTrackList__item, .badgeList__item, .lazyLoadingList__item');
        for (const row of rows) {
            if (row.querySelector('.scl-chip, .scl-badge')) continue;
            const link = row.querySelector<HTMLAnchorElement>('a.soundTitle__title, a.trackItem__trackTitle, a.playableTile__heading, a.playableTile__artworkLink');
            const time = link ? dates.get(pathOf(link.getAttribute('href') ?? '')) : undefined;
            if (!link || !time) continue;
            const art = row.querySelector<HTMLElement>('.playableTile__artwork');
            const chip = document.createElement('span');
            chip.className = art ? 'scl-badge' : 'scl-chip';
            chip.title = ago(time) + ' · ' + new Date(time).toLocaleString(ru ? 'ru-RU' : 'en-US');
            chip.insertAdjacentHTML('beforeend', HEART);
            chip.append(art ? short(time) : ago(time));
            if (art) {
                art.append(chip);
                continue;
            }
            const anchor = row.querySelector('.soundTitle__usernameText, .trackItem__username') ?? link;
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
    async function load(fresh = false): Promise<void> {
        if (loading || (loaded && !fresh) || core.disposed()) return;
        loading = true;
        try {
            const user = await core.userId();
            if (!user) return;
            let url: string | null = 'https://api-v2.soundcloud.com/users/' + user + '/track_likes?limit=200';
            for (let page = 0; url && page < (fresh ? 1 : 5) && !core.disposed(); page++) {
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
            for (const node of document.querySelectorAll('.scl-chip, .scl-badge, .scl-unlike, .scl-streak')) node.remove();
            for (const node of document.querySelectorAll('.scl-gone')) node.classList.remove('scl-gone');
            document.documentElement.classList.remove(PAGE);
            document.getElementById(STYLE_ID)?.remove();
        },
    };
}
