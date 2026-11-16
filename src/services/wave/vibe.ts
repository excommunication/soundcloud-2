// «Настроить волну»: строка над блоком волны. Человек пишет, что хочет услышать, main разбирает запрос (модель или
// локальный словарь) и ищет актуальные треки в интернете (Deezer), раздел находит их на SoundCloud, ранжирует (vibeRank)
// и подстраивает волну: найденное идёт через один с похожим, а не отдельным списком.
// Там же переключатель «Без русского». Раздел страницы волны: installVibe уходит на страницу текстом вместе с волной
// (pageHelpers в wave.ts) и зовёт помощников по голому имени, поэтому импорт через пространство имён и разбор в константы.
// Строка живёт отдельным узлом #sc-vibe перед #sc-wave: render() волны пересобирает свою секцию целиком и сбрасывал бы ввод
import * as waveVibe from '../waveVibe';
import * as waveGenres from '../waveGenres';
import type { VibeHit, VibePlan } from '../waveVibe';
import type { Profile, Seed, WaveTrack } from '../waveTypes';
import type { WaveWindow } from '../wave';

const { vibeRank, vibeExact } = waveVibe;
const { topGenres } = waveGenres;

export interface VibeCore {
    host: WaveWindow & Record<string, unknown>;
    lang: 'ru' | 'en';
    disposed(): boolean;
    seed(): Seed | null;
    seedRequest(): number;
    nextSeedRequest(): number;
    beginSeed(request: number, loaded: { seed: Seed; first: WaveTrack | null }): Promise<void>;
    ensureProfile(): Promise<Profile>;
    ensureExclusions(): Promise<void>;
    isExcluded(track: WaveTrack): boolean;
    searchTracks(q: string): Promise<WaveTrack[]>;
    call(name: string, path: object, query: object): Promise<unknown>;
    tracksOf(body: unknown): WaveTrack[];
    artistAccounts(q: string): Promise<Array<{ id: number; name: string }>>;
    topTracks(id: number): Promise<WaveTrack[]>;
    noRussian(): boolean;
    setNoRussian(value: boolean): void;
    showToast(text: string): void;
    el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K];
    trackRow(track: WaveTrack, now: number): { row: HTMLDivElement; end: HTMLDivElement };
    nowPlaying(): number;
    /** Вернуть обычную волну: подборка от запроса снимается */
    resetWave(): void;
}
export interface VibeSection {
    /** Поставить строку перед блоком волны; без блока (не главная) строка снимается */
    mount(section: HTMLElement | null): void;
    /** Перерисовать: сменился трек или «Без русского» */
    refresh(): void;
    /** Перечитать, подключена ли модель (сменили настройки в F1) */
    recheck(): void;
    /** Волна сейчас от запроса */
    playing(): boolean;
    dispose(): void;
}

export function installVibe(core: VibeCore): VibeSection {
    const { host, el } = core;
    const ru = core.lang === 'ru';
    const T = ru
        ? {
            placeholder: 'Настрой волну: «radio 2026 vibes», «tiktok», «фонк в зал»',
            label: 'Настроить волну',
            go: 'Настроить',
            ai: 'ИИ',
            web: 'Интернет',
            local: 'Локально',
            aiHint: 'Запрос разбирает языковая модель из F1 → Моя волна',
            webHint: 'Актуальные треки ищутся в открытых плейлистах и чартах Deezer',
            noRu: 'Без русского',
            noRuHint: 'Не ставить песни на русском в волну',
            steps: ['Понимаю запрос', 'Ищу актуальное', 'Нахожу на SoundCloud', 'Настраиваю волну'],
            tuned: 'Волна настроена',
            from: 'из',
            list: 'Треки',
            hide: 'Скрыть',
            reset: 'Сбросить',
            again: 'Другой срез',
            tracks: (n: number) => n + ' ' + (n % 10 === 1 && n % 100 !== 11 ? 'трек' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'трека' : 'треков'),
            nothing: 'Ничего подходящего не нашлось. Попробуй сказать иначе',
            failed: 'Не получилось, проверь сеть',
            aiFallback: 'модель не ответила',
            examples: ['radio 2026 vibes', 'tiktok', 'фонк в зал', 'ночной драйв', 'лоуфай для учёбы', 'новый инди'],
        }
        : {
            placeholder: 'Tune your wave: “radio 2026 vibes”, “tiktok”, “gym phonk”',
            label: 'Tune the wave',
            go: 'Tune',
            ai: 'AI',
            web: 'Web',
            local: 'Local',
            aiHint: 'Parsed by the language model set in F1 → My Wave',
            webHint: 'Current tracks come from open Deezer playlists and charts',
            noRu: 'No Russian',
            noRuHint: 'Keep Russian-language songs out of the wave',
            steps: ['Reading', 'Looking for current tracks', 'Finding them on SoundCloud', 'Tuning the wave'],
            tuned: 'Wave tuned',
            from: 'from',
            list: 'Tracks',
            hide: 'Hide',
            reset: 'Reset',
            again: 'Another take',
            tracks: (n: number) => n + (n === 1 ? ' track' : ' tracks'),
            nothing: 'Nothing fitting found. Try putting it differently',
            failed: 'Something went wrong, check your connection',
            aiFallback: 'model did not answer',
            examples: ['radio 2026 vibes', 'tiktok', 'gym phonk', 'night drive', 'lofi to study', 'new indie'],
        };

    let root: HTMLElement | null = null;
    let input: HTMLInputElement | null = null;
    let status: HTMLElement | null = null;
    let results: HTMLElement | null = null;
    let chip: HTMLButtonElement | null = null;
    let busy = false;
    let request = 0;
    let lastText = '';
    let lastTop: WaveTrack[] = [];
    let lastPlan: VibePlan | null = null;
    let lastError = '';
    let listOpen = false;
    let variant = 0;
    let aiReady = false;

    const ICON_SPARK = '<svg class="scv-spark" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7z"/></svg>';
    const ICON_GO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h12m-5-6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    // Стили на токенах оформления (--sc2-*): тот же язык, что у блока волны, дока и меню
    function ensureStyle(): void {
        if (document.getElementById('sc-vibe-style')) return;
        const style = el('style', '');
        style.id = 'sc-vibe-style';
        style.textContent = [
            '#sc-vibe{position:relative;margin:4px 0 28px 16px;font-size:14px;line-height:20px;color:var(--sc2-text,#f5f6f8)}',
            '#sc-vibe button{font:inherit;color:inherit;background:none;border:0;cursor:pointer;padding:0}',
            '.scv-bar{display:flex;align-items:center;gap:10px;height:56px;padding:0 7px 0 18px;border-radius:var(--sc2-r4,22px);background:var(--sc2-panel,rgba(14,16,24,.55));',
            'backdrop-filter:var(--sc2-blur,blur(20px));-webkit-backdrop-filter:var(--sc2-blur,blur(20px));box-shadow:inset 0 0 0 1px var(--sc2-line,rgba(255,255,255,.09));transition:box-shadow var(--sc2-mid,.2s) var(--sc2-ease,ease)}',
            '.scv-bar:focus-within{box-shadow:inset 0 0 0 1px rgba(255,255,255,.35),0 0 0 4px rgba(255,255,255,.06)}',
            '.scv-spark{width:18px;height:18px;flex:none;fill:var(--sc2-text-2,rgba(255,255,255,.7))}',
            '#sc-vibe.busy .scv-spark{animation:scv-spin 1.2s linear infinite}',
            '@keyframes scv-spin{to{transform:rotate(360deg)}}',
            '.scv-input{flex:1;min-width:0;height:100%;border:0;outline:0;background:transparent;color:inherit;font:inherit;font-size:15px}',
            '.scv-input::placeholder{color:var(--sc2-text-3,rgba(245,246,248,.44))}',
            '#sc-vibe .scv-badge{flex:none;height:22px;padding:0 9px;border-radius:999px;font-size:11px;font-weight:600;display:grid;place-items:center;background:var(--sc2-surface-2,rgba(255,255,255,.075));color:var(--sc2-text-2,rgba(245,246,248,.66))}',
            '#sc-vibe .scv-go{flex:none;height:42px;padding:0 20px;border-radius:999px;display:flex;align-items:center;gap:8px;background:#fff;color:#0b0c10;font-weight:800}',
            '#sc-vibe .scv-go:active{transform:scale(.96)}',
            '#sc-vibe .scv-go:disabled{opacity:.5;cursor:default}',
            '.scv-go svg{width:16px;height:16px}',
            '.scv-under{position:absolute;left:0;right:0;top:58px;z-index:20;display:none;flex-wrap:wrap;gap:6px;padding:10px;border-radius:var(--sc2-r3,16px);background:rgba(16,18,26,.95);backdrop-filter:var(--sc2-blur,blur(20px));-webkit-backdrop-filter:var(--sc2-blur,blur(20px));box-shadow:var(--sc2-shadow,0 16px 48px -20px rgba(0,0,0,.8)),inset 0 0 0 1px var(--sc2-line,rgba(255,255,255,.09));animation:scv-in var(--sc2-fast,.12s) var(--sc2-ease,ease)}',
            '#sc-vibe:has(.scv-input:focus:placeholder-shown) .scv-under{display:flex}',
            '#sc-vibe .scv-ex,#sc-vibe .scv-toggle,#sc-vibe .scv-btn{height:30px;padding:0 12px;border-radius:999px;background:var(--sc2-surface-2,rgba(255,255,255,.075));',
            'color:var(--sc2-text-2,rgba(245,246,248,.66));font-size:13px;font-weight:500;transition:background var(--sc2-fast,.12s),color var(--sc2-fast,.12s)}',
            '#sc-vibe .scv-ex:hover,#sc-vibe .scv-toggle:hover,#sc-vibe .scv-btn:hover{background:var(--sc2-surface-2,rgba(255,255,255,.075));color:var(--sc2-text,#f5f6f8)}',
            '#sc-vibe .scv-toggle{flex:none;display:flex;align-items:center;gap:7px;padding:0 10px 0 7px;background:transparent;font-size:12px}',
            '.scv-toggle i{position:relative;width:26px;height:16px;border-radius:999px;background:var(--sc2-surface-3,rgba(255,255,255,.12));transition:background var(--sc2-mid,.2s)}',
            '.scv-toggle i::after{content:"";position:absolute;top:2px;left:2px;width:12px;height:12px;border-radius:50%;background:#fff;transition:transform var(--sc2-mid,.2s) var(--sc2-ease,ease)}',
            '#sc-vibe .scv-toggle[aria-pressed="true"]{color:var(--sc2-text,#f5f6f8)}',
            '.scv-toggle[aria-pressed="true"] i{background:var(--sc2-accent,#9aa8ff)}',
            '.scv-toggle[aria-pressed="true"] i::after{transform:translateX(10px)}',
            '.scv-status{display:flex;gap:16px;margin-top:12px;color:var(--sc2-text-3,rgba(245,246,248,.44));font-size:12px}',
            '.scv-status[hidden]{display:none}',
            '.scv-status span{display:flex;align-items:center;gap:6px;transition:color var(--sc2-mid,.2s)}',
            '.scv-status span::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor;opacity:.6}',
            '.scv-status span.on{color:var(--sc2-text,#f5f6f8)}',
            '.scv-status span.on::before{opacity:1;background:var(--sc2-accent,#9aa8ff);animation:scv-blink 1s ease-in-out infinite}',
            '.scv-status span.done{color:var(--sc2-text-2,rgba(245,246,248,.66))}',
            '@keyframes scv-blink{50%{opacity:.35}}',
            '.scv-card{margin-top:12px;padding:12px 12px 12px 18px;border-radius:var(--sc2-r3,16px);background:var(--sc2-panel,rgba(14,12,26,.6));backdrop-filter:var(--sc2-blur,blur(20px));box-shadow:inset 0 0 0 1px var(--sc2-line,rgba(255,255,255,.1));animation:scv-in var(--sc2-mid,.2s) var(--sc2-ease,ease) both}',
            '.scv-head{display:flex;align-items:center;gap:10px}',
            '.scv-dot{width:8px;height:8px;border-radius:50%;flex:none;background:var(--sc2-accent,#9aa8ff)}',
            '.scv-titles{min-width:0;flex:1}',
            '.scv-title{font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
            '.scv-sub{color:var(--sc2-text-3,rgba(245,246,248,.44));font-size:12px;line-height:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
            '.scv-rows{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:2px 12px;margin-top:10px;max-height:340px;overflow-y:auto;scrollbar-width:thin}',
            '@media (max-width:900px){.scv-rows{grid-template-columns:minmax(0,1fr)}}',
            '#sc-vibe .scw-row{display:grid;grid-template-columns:22px 36px minmax(0,1fr);align-items:center;gap:10px;height:46px;padding:4px 8px;border-radius:var(--sc2-r2,12px);cursor:pointer;box-sizing:border-box;transition:background var(--sc2-fast,.12s)}',
            '#sc-vibe .scw-row:hover{background:var(--sc2-surface-2,rgba(255,255,255,.075))}',
            '#sc-vibe .scv-n{color:var(--sc2-text-3,rgba(245,246,248,.44));font-size:12px;font-variant-numeric:tabular-nums;text-align:right}',
            '#sc-vibe .scw-row .scw-art{position:relative;width:36px;height:36px;margin:0;border-radius:var(--sc2-r1,8px);overflow:hidden;background:var(--sc2-surface-2,rgba(255,255,255,.075))}',
            '#sc-vibe .scw-img{position:absolute;inset:0;background:center/cover;opacity:0;transition:opacity .2s}',
            '#sc-vibe .scw-img.on{opacity:1}',
            '#sc-vibe .scw-row-t{min-width:0}',
            '#sc-vibe .scw-row-t b,#sc-vibe .scw-row-t span{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
            '#sc-vibe .scw-row-t b{font-weight:600;font-size:13px}',
            '#sc-vibe .scw-row-t span{color:var(--sc2-text-2,rgba(245,246,248,.66));font-size:12px;line-height:16px}',
            '#sc-vibe .scw-row[aria-current="true"] .scw-row-t b{color:var(--sc2-accent,#9aa8ff)}',
            '#sc-vibe .scw-row-e{display:none}',
            '#sc-vibe a.scw-link{color:inherit;text-decoration:none}',
            '#sc-vibe a.scw-link:hover{text-decoration:underline}',
            '@keyframes scv-in{from{opacity:0;transform:translateY(4px)}}',
            'html.scm-reduce #sc-vibe *{animation:none!important;transition:none!important}',
            '@media (prefers-reduced-motion:reduce){#sc-vibe *{animation:none!important;transition:none!important}}',
        ].join('\n');
        document.head.append(style);
    }

    function build(): HTMLElement {
        ensureStyle();
        const node = el('section', '');
        node.id = 'sc-vibe';
        node.setAttribute('aria-label', T.label);
        const bar = el('form', 'scv-bar');
        bar.insertAdjacentHTML('beforeend', ICON_SPARK);
        input = el('input', 'scv-input');
        input.type = 'text';
        input.maxLength = 300;
        input.autocomplete = 'off';
        input.spellcheck = false;
        input.placeholder = T.placeholder;
        input.setAttribute('aria-label', T.label);
        chip = el('button', 'scv-toggle');
        chip.type = 'button';
        chip.title = T.noRuHint;
        chip.append(el('i', ''), document.createTextNode(ru ? 'Без RU' : 'No RU'));
        chip.addEventListener('click', () => core.setNoRussian(!core.noRussian()));
        const go = el('button', 'scv-go sc2-cta');
        go.type = 'submit';
        go.title = T.webHint;
        go.append(T.go);
        go.insertAdjacentHTML('beforeend', ICON_GO);
        bar.append(input, chip, go);
        bar.addEventListener('submit', (event) => {
            event.preventDefault();
            void run(input?.value ?? '', false);
        });
        // Примеры: выпадают под строкой, только пока поле в фокусе и пустое; mousedown не уводит фокус до клика
        const under = el('div', 'scv-under');
        for (const text of T.examples) {
            const ex = el('button', 'scv-ex', text);
            ex.type = 'button';
            ex.addEventListener('mousedown', (event) => event.preventDefault());
            ex.addEventListener('click', () => {
                if (input) input.value = text;
                input?.blur();
                void run(text, false);
            });
            under.append(ex);
        }
        status = el('div', 'scv-status');
        status.hidden = true;
        results = el('div', '');
        node.append(bar, under, status, results);
        node.addEventListener('click', onRowClick);
        void detectAi();
        return node;
    }

    async function detectAi(): Promise<void> {
        try {
            aiReady = (await host.soundcloudAPI?.vibe?.status?.()) === true;
        } catch {
            aiReady = false;
        }
        const go = root?.querySelector<HTMLElement>('.scv-go');
        if (go) go.title = aiReady ? T.aiHint + '. ' + T.webHint : T.webHint;
    }

    function setStep(step: number): void {
        if (!status) return;
        status.hidden = step < 0;
        status.textContent = '';
        T.steps.forEach((text, index) => status!.append(el('span', index < step ? 'done' : index === step ? 'on' : '', text)));
    }

    function onRowClick(event: MouseEvent): void {
        const target = event.target instanceof Element ? event.target : null;
        if (!target || target.closest('a.scw-link')) return;
        const row = target.closest<HTMLElement>('.scw-row[data-track]');
        if (!row) return;
        event.preventDefault();
        void tune(Number(row.dataset.track));
    }

    // Карточка «Волна настроена»: подпись, источники, сброс; список найденного по кнопке
    function paintResults(): void {
        if (!results) return;
        results.textContent = '';
        if (!lastPlan || !lastTop.length) return;
        const card = el('div', 'scv-card');
        const head = el('div', 'scv-head');
        const titles = el('div', 'scv-titles');
        const sources = lastPlan.sources?.length ? ' · ' + T.from + ' ' + lastPlan.sources.slice(0, 3).join(', ') : '';
        titles.append(
            el('div', 'scv-title', T.tuned + ': ' + lastPlan.title),
            el('div', 'scv-sub', T.tracks(lastTop.length) + sources + (lastError ? ' · ' + T.aiFallback : '')),
        );
        const list = el('button', 'scv-btn', listOpen ? T.hide : T.list);
        list.type = 'button';
        list.setAttribute('aria-expanded', String(listOpen));
        list.addEventListener('click', () => {
            listOpen = !listOpen;
            paintResults();
        });
        const again = el('button', 'scv-btn', T.again);
        again.type = 'button';
        again.addEventListener('click', () => void run(lastText, true));
        const reset = el('button', 'scv-btn', T.reset);
        reset.type = 'button';
        reset.addEventListener('click', () => {
            lastTop = [];
            lastPlan = null;
            listOpen = false;
            paintResults();
            core.resetWave();
        });
        head.append(el('span', 'scv-dot'), titles, list, again, reset);
        card.append(head);
        if (listOpen) {
            const rows = el('div', 'scv-rows');
            const now = core.nowPlaying();
            lastTop.forEach((track, index) => {
                const { row } = core.trackRow(track, now);
                row.prepend(el('span', 'scv-n', String(index + 1)));
                rows.append(row);
            });
            card.append(rows);
        }
        results.append(card);
    }

    // Поиск по плану. Если из интернета пришло много треков, текстовый поиск по SoundCloud почти не нужен: он и тащил
    // «slowed tiktok version». Треки из плана ищутся по «артист название» и берутся только точные совпадения
    // Запрос по частям для второго захода: целиком без слов-связок, латиницей и по каждому слову; в конце общий «тренд»
    function looseQueries(text: string): string[] {
        const stop = /^(чет|чёт|что|го|давай|включи|мне|хочу|надо|пожалуйста|какое|какой|что-то|что-нибудь|some|something|please|play|me)$/iu;
        const words = text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((word) => word.length >= 3 && !stop.test(word));
        const whole = words.join(' ');
        const latin = whole.replace(/\p{Script=Cyrillic}/gu, (ch) => ({ а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ы: 'y', э: 'e', ю: 'yu', я: 'ya' } as Record<string, string>)[ch] ?? '');
        return [...new Set([whole, latin, ...words, 'trending now', 'viral hits'].filter((item) => item.length >= 3))].slice(0, 8);
    }

    async function collect(plan: VibePlan, mine: number): Promise<{ tracks: WaveTrack[]; hits: Map<number, VibeHit> }> {
        const hits = new Map<number, VibeHit>();
        const all: WaveTrack[] = [];
        const add = (list: WaveTrack[], mark: Partial<VibeHit> = {}): void => {
            for (const track of list) {
                const hit = hits.get(track.id) ?? { count: 0, exact: false, artist: false };
                hit.count++;
                if (mark.exact) hit.exact = true;
                if (mark.artist) hit.artist = true;
                if (!hits.has(track.id)) all.push(track);
                hits.set(track.id, hit);
            }
        };
        const safe = <R>(promise: Promise<R>, fallback: R): Promise<R> => promise.catch((error: unknown) => {
            console.warn('Настроить волну: поиск не ответил', error);
            return fallback;
        });
        const rich = plan.tracks.length >= 10;
        const tasks: Array<Promise<void>> = [];
        for (const q of plan.queries.slice(0, rich ? 1 : 8)) tasks.push(safe(core.searchTracks(q), []).then((list) => add(list)));
        for (const tag of plan.tags.slice(0, rich ? 1 : 5))
            tasks.push(safe(core.call('searchCategory', { category: 'tracks' }, { q: '*', 'filter.genre_or_tag': tag, limit: 50 }).then(core.tracksOf), []).then((list) => add(list)));
        for (const wanted of plan.tracks.slice(0, 32))
            tasks.push(safe(core.searchTracks(wanted.replace(/\s[-–—]\s/, ' ')), []).then((list) => {
                if (mine !== request) return;
                add(list.filter((track) => vibeExact(track, wanted)).slice(0, 1), { exact: true });
            }));
        for (const name of plan.artists.slice(0, 4))
            tasks.push(safe(core.artistAccounts(name), []).then(async (accounts) => {
                if (!accounts[0] || mine !== request) return;
                add(await safe(core.topTracks(accounts[0].id), []), { artist: true });
            }));
        await Promise.all(tasks);
        return { tracks: all, hits };
    }

    async function run(raw: string, another: boolean): Promise<void> {
        const text = raw.replace(/\s+/g, ' ').trim();
        if (!text || core.disposed()) return;
        const mine = ++request;
        busy = true;
        root?.classList.add('busy');
        variant = another && text === lastText ? variant + 1 : 0;
        lastText = text;
        setStep(0);
        try {
            const profile = await core.ensureProfile().catch(() => null);
            await core.ensureExclusions().catch(() => undefined);
            const genres = topGenres(profile?.likedTracks ?? [], 6);
            setStep(1);
            const answer = await host.soundcloudAPI?.vibe?.plan(text, { genres, noRussian: core.noRussian() });
            if (mine !== request) return;
            const plan = answer?.plan;
            if (!plan) throw new Error('План не пришёл');
            if (plan.source === 'ai') aiReady = true;
            setStep(2);
            const { tracks, hits } = await collect(plan, mine);
            if (mine !== request) return;
            setStep(3);
            let top = vibeRank(tracks, hits, plan, Date.now(), 40, core.isExcluded);
            let usedPlan = plan;
            // Ничего не нашлось: второй заход без жанров и слов-связок, по отдельным словам запроса и по тому, что сейчас в тренде
            if (!top.length) {
                const loose = looseQueries(text);
                const relaxed: VibePlan = { ...plan, queries: loose, tags: [], tracks: [], artists: [], words: [], avoid: [], popularity: 'hits', fresh: false };
                const second = await collect(relaxed, mine);
                if (mine !== request) return;
                top = vibeRank(second.tracks, second.hits, relaxed, Date.now(), 40, core.isExcluded);
                usedPlan = relaxed;
            }
            if (variant > 0 && top.length > 8) {
                const shift = (variant * 7) % top.length;
                top = [...top.slice(shift), ...top.slice(0, shift)];
            }
            lastPlan = usedPlan;
            lastTop = top;
            lastError = answer?.error ?? '';
            if (!top.length) {
                setStep(-1);
                core.showToast(T.nothing);
                paintResults();
                return;
            }
            await tune(null);
            setStep(-1);
        } catch (error) {
            if (mine !== request) return;
            console.warn('Настроить волну не получилось', error);
            setStep(-1);
            core.showToast(T.failed);
        } finally {
            if (mine === request) {
                busy = false;
                root?.classList.remove('busy');
            }
        }
    }

    // Волна от найденного: найденное через один с похожим (blend), от первых пяти ищутся соседи; fromId играет первым
    async function tune(fromId: number | null): Promise<void> {
        if (!lastPlan || !lastTop.length) return;
        const at = fromId ? Math.max(0, lastTop.findIndex((track) => track.id === fromId)) : 0;
        const first = lastTop[at];
        const own = [...lastTop.slice(at + 1), ...lastTop.slice(0, at)];
        const seedRequest = core.nextSeedRequest();
        await core.beginSeed(seedRequest, { seed: { kind: 'vibe', title: lastPlan.title, own, tracks: lastTop.slice(0, 5), order: 'blend', mode: 'similar' }, first });
        paintResults();
    }

    return {
        mount(section) {
            if (!section?.parentElement) {
                root?.remove();
                return;
            }
            if (!root) root = build();
            if (root.nextElementSibling !== section) section.parentElement.insertBefore(root, section);
            if (busy) root.classList.add('busy');
            chip?.setAttribute('aria-pressed', String(core.noRussian()));
        },
        refresh() {
            chip?.setAttribute('aria-pressed', String(core.noRussian()));
            const kept = lastTop.filter((track) => !core.isExcluded(track));
            if (kept.length !== lastTop.length) {
                lastTop = kept;
                paintResults();
            }
            // Волну сбросили в блоке (крестик у подборки): карточка «настроена» уходит
            if (lastPlan && core.seed()?.kind !== 'vibe' && !busy) {
                lastPlan = null;
                lastTop = [];
                paintResults();
            }
            if (results && listOpen) {
                const now = core.nowPlaying();
                for (const row of results.querySelectorAll<HTMLElement>('.scw-row[data-track]')) {
                    if (Number(row.dataset.track) === now) row.setAttribute('aria-current', 'true');
                    else row.removeAttribute('aria-current');
                }
            }
        },
        recheck: () => void detectAi(),
        playing: () => core.seed()?.kind === 'vibe',
        dispose() {
            request++;
            root?.remove();
            root = null;
        },
    };
}
