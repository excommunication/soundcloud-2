// «Волна по описанию»: строка над блоком волны. Человек пишет, что хочет услышать, main разбирает запрос (модель или
// локальный словарь), раздел ищет по каталогу, ранжирует топ (vibeRank) и запускает волну: топ по порядку, дальше похожее.
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
            placeholder: 'Опиши, что хочешь услышать: «ночной драйв под дождь», «фонк для зала», «как Cigarettes After Sex, но бодрее»',
            label: 'Волна по описанию',
            go: 'Найти и включить',
            ai: 'ИИ',
            local: 'Локально',
            aiHint: 'Запрос разбирает языковая модель из F1 → Моя волна',
            localHint: 'Запрос разбирается локально. Подключи модель в F1 → Моя волна, чтобы искать точнее',
            noRu: 'Без русского',
            noRuHint: 'Не ставить песни на русском в волну и подборки по описанию',
            steps: ['Понимаю запрос', 'Ищу по каталогу', 'Собираю топ'],
            play: 'Слушать',
            again: 'Ещё вариант',
            close: 'Скрыть',
            tracks: (n: number) => n + ' ' + (n % 10 === 1 && n % 100 !== 11 ? 'трек' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'трека' : 'треков'),
            nothing: 'Ничего подходящего не нашлось. Попробуй сказать иначе',
            failed: 'Поиск не удался, проверь сеть',
            aiFallback: 'Модель не ответила, искал локально',
            examples: ['ночной драйв под дождь', 'фонк для зала', 'грустный инди на вечер', 'джаз к утреннему кофе', 'андеграунд хип-хоп 2026', 'лоуфай для учёбы без slowed'],
        }
        : {
            placeholder: 'Describe what you want to hear: “night drive in the rain”, “phonk for the gym”, “like Cigarettes After Sex but brighter”',
            label: 'Wave from a description',
            go: 'Find and play',
            ai: 'AI',
            local: 'Local',
            aiHint: 'Your request is parsed by the language model set in F1 → My Wave',
            localHint: 'Parsed locally. Connect a model in F1 → My Wave for sharper results',
            noRu: 'No Russian',
            noRuHint: 'Keep Russian-language songs out of the wave and described waves',
            steps: ['Reading the request', 'Searching the catalog', 'Ranking the top'],
            play: 'Play',
            again: 'Another take',
            close: 'Hide',
            tracks: (n: number) => n + (n === 1 ? ' track' : ' tracks'),
            nothing: 'Nothing fitting found. Try putting it differently',
            failed: 'Search failed, check your connection',
            aiFallback: 'The model did not answer, searched locally',
            examples: ['night drive in the rain', 'phonk for the gym', 'sad indie for the evening', 'jazz with morning coffee', 'underground hip hop 2026', 'lofi for studying, no slowed'],
        };

    let root: HTMLElement | null = null;
    let input: HTMLInputElement | null = null;
    let status: HTMLElement | null = null;
    let results: HTMLElement | null = null;
    let chip: HTMLButtonElement | null = null;
    let badge: HTMLElement | null = null;
    let busy = false;
    let request = 0;
    let lastText = '';
    let lastTop: WaveTrack[] = [];
    let lastPlan: VibePlan | null = null;
    let variant = 0;
    let aiReady = false;
    let exampleTimer: ReturnType<typeof setInterval> | undefined;

    const ICON_SPARK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l1.9 5.6 5.6 1.9-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9zM19 15l.9 2.1 2.1.9-2.1.9L19 21l-.9-2.1-2.1-.9 2.1-.9z"/></svg>';
    const ICON_GO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h12m-5-6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    function ensureStyle(): void {
        if (document.getElementById('sc-vibe-style')) return;
        const style = el('style', '');
        style.id = 'sc-vibe-style';
        style.textContent = [
            '#sc-vibe{--v-glass:rgba(255,255,255,.055);--v-line:rgba(255,255,255,.1);--v-muted:rgba(255,255,255,.62);--v-faint:rgba(255,255,255,.42);--v-accent:var(--sca-accent,#ff5500);',
            'position:relative;margin:8px 0 28px 16px;font-size:14px;line-height:20px;color:#fff}',
            '#sc-vibe button{font:inherit;color:inherit;background:none;border:0;cursor:pointer;padding:0}',
            '.scv-bar{position:relative;display:flex;align-items:center;gap:10px;height:56px;padding:0 8px 0 18px;border-radius:18px;background:var(--v-glass);',
            'box-shadow:inset 0 0 0 1px var(--v-line),0 10px 40px -18px rgba(0,0,0,.6);backdrop-filter:blur(18px) saturate(1.3);transition:box-shadow .3s ease,background .3s ease}',
            // Перелив по краю строки: конический градиент крутится, пока строка в фокусе или идёт поиск
            '@property --scv-angle{syntax:"<angle>";inherits:false;initial-value:0deg}',
            '.scv-bar::before{content:"";position:absolute;inset:-1px;border-radius:inherit;padding:1px;pointer-events:none;opacity:0;transition:opacity .4s ease;',
            'background:conic-gradient(from var(--scv-angle),var(--sca-c1,#6aa8ff),var(--sca-c2,#b06bff),var(--sca-c3,#ff6bb0),var(--sca-c1,#6aa8ff));',
            '-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;animation:scv-spin 6s linear infinite}',
            '.scv-bar:focus-within::before,#sc-vibe.busy .scv-bar::before{opacity:1}',
            '#sc-vibe.busy .scv-bar::before{animation-duration:1.6s}',
            '@keyframes scv-spin{to{--scv-angle:360deg}}',
            '.scv-bar:focus-within{background:rgba(255,255,255,.08)}',
            '.scv-spark{width:20px;height:20px;flex:none;fill:var(--sca-c1,#8ab4ff);filter:drop-shadow(0 0 8px var(--sca-c1,#8ab4ff))}',
            '#sc-vibe.busy .scv-spark{animation:scv-pulse 1s ease-in-out infinite alternate}',
            '@keyframes scv-pulse{from{transform:scale(.85) rotate(0);opacity:.7}to{transform:scale(1.1) rotate(20deg);opacity:1}}',
            '.scv-input{flex:1;min-width:0;height:100%;border:0;outline:0;background:transparent;color:#fff;font:inherit;font-size:15px}',
            '.scv-input::placeholder{color:var(--v-faint);transition:opacity .35s ease}',
            '.scv-input.swap::placeholder{opacity:0}',
            '#sc-vibe .scv-badge{flex:none;height:22px;padding:0 8px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:.04em;display:grid;place-items:center;',
            'background:rgba(255,255,255,.08);color:var(--v-muted)}',
            '#sc-vibe .scv-badge.ai{background:linear-gradient(120deg,var(--sca-c1,#6aa8ff),var(--sca-c2,#b06bff));color:#fff}',
            '#sc-vibe .scv-go{flex:none;width:40px;height:40px;border-radius:13px;display:grid;place-items:center;background:#fff;color:#111;transition:transform .2s cubic-bezier(.2,.8,.2,1.2),opacity .2s}',
            '#sc-vibe .scv-go:hover{transform:scale(1.06)}',
            '#sc-vibe .scv-go:active{transform:scale(.94)}',
            '#sc-vibe .scv-go:disabled{opacity:.4;cursor:default;transform:none}',
            '.scv-go svg{width:20px;height:20px}',
            '.scv-under{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:10px}',
            '#sc-vibe .scv-ex{height:28px;padding:0 12px;border-radius:999px;background:rgba(255,255,255,.05);box-shadow:inset 0 0 0 1px var(--v-line);color:var(--v-muted);font-size:13px;',
            'transition:background .2s,color .2s,transform .2s;animation:scv-in .5s cubic-bezier(.2,.8,.2,1) both}',
            '#sc-vibe .scv-ex:hover{background:rgba(255,255,255,.1);color:#fff;transform:translateY(-1px)}',
            '#sc-vibe .scv-toggle{margin-left:auto;height:28px;padding:0 12px 0 8px;border-radius:999px;display:flex;align-items:center;gap:8px;color:var(--v-muted);font-size:13px;box-shadow:inset 0 0 0 1px var(--v-line)}',
            '.scv-toggle i{position:relative;width:26px;height:16px;border-radius:999px;background:rgba(255,255,255,.18);transition:background .25s}',
            '.scv-toggle i::after{content:"";position:absolute;top:2px;left:2px;width:12px;height:12px;border-radius:50%;background:#fff;transition:transform .25s cubic-bezier(.2,.8,.2,1.2)}',
            '#sc-vibe .scv-toggle[aria-pressed="true"]{color:#fff}',
            '.scv-toggle[aria-pressed="true"] i{background:var(--v-accent)}',
            '.scv-toggle[aria-pressed="true"] i::after{transform:translateX(10px)}',
            '.scv-status{display:flex;gap:18px;margin-top:12px;color:var(--v-faint);font-size:13px}',
            '.scv-status[hidden]{display:none}',
            '.scv-status span{position:relative;padding-left:16px;transition:color .3s}',
            '.scv-status span::before{content:"";position:absolute;left:0;top:6px;width:8px;height:8px;border-radius:50%;background:currentColor;opacity:.5}',
            '.scv-status span.on{color:#fff}',
            '.scv-status span.on::before{opacity:1;background:var(--sca-c1,#8ab4ff);box-shadow:0 0 10px var(--sca-c1,#8ab4ff);animation:scv-pulse .7s ease-in-out infinite alternate}',
            '.scv-status span.done{color:var(--v-muted)}',
            '.scv-status span.done::before{opacity:1;background:var(--v-muted)}',
            '.scv-res{margin-top:16px;padding:16px;border-radius:18px;background:rgba(255,255,255,.04);box-shadow:inset 0 0 0 1px var(--v-line);animation:scv-in .45s cubic-bezier(.2,.8,.2,1) both}',
            '.scv-head{display:flex;align-items:center;gap:12px;margin-bottom:10px}',
            '.scv-title{font-size:18px;line-height:24px;font-weight:700;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
            '.scv-sub{color:var(--v-faint);font-size:12px;white-space:nowrap}',
            '.scv-head .scv-sp{flex:1}',
            '#sc-vibe .scv-btn{height:32px;padding:0 14px;border-radius:10px;font-weight:600;background:rgba(255,255,255,.08);transition:background .2s}',
            '#sc-vibe .scv-btn:hover{background:rgba(255,255,255,.14)}',
            '#sc-vibe .scv-btn.solid{background:#fff;color:#111}',
            '.scv-rows{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:2px 16px}',
            '@media (max-width:900px){.scv-rows{grid-template-columns:minmax(0,1fr)}}',
            // Строки списка: те же, что в блоке волны (trackRow), стили продублированы, потому что у волны они под #sc-wave
            '#sc-vibe .scw-row{display:grid;grid-template-columns:24px 40px minmax(0,1fr);align-items:center;gap:12px;height:52px;padding:4px 8px;border-radius:10px;cursor:pointer;box-sizing:border-box;',
            'animation:scv-in .5s cubic-bezier(.2,.8,.2,1) both;animation-delay:calc(var(--i,0) * 35ms);transition:background .15s}',
            '#sc-vibe .scw-row:hover{background:rgba(255,255,255,.06)}',
            '#sc-vibe .scv-n{color:var(--v-faint);font-size:12px;font-variant-numeric:tabular-nums;text-align:right}',
            '#sc-vibe .scw-row .scw-art{position:relative;width:40px;height:40px;margin:0;border-radius:8px;overflow:hidden;background:rgba(255,255,255,.06)}',
            '#sc-vibe .scw-img{position:absolute;inset:0;background:center/cover;opacity:0;transition:opacity .25s}',
            '#sc-vibe .scw-img.on{opacity:1}',
            '#sc-vibe .scw-row-t{min-width:0}',
            '#sc-vibe .scw-row-t b,#sc-vibe .scw-row-t span{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
            '#sc-vibe .scw-row-t span{color:var(--v-muted);font-size:12px;line-height:16px}',
            '#sc-vibe .scw-row[aria-current="true"]{background:rgba(255,255,255,.07)}',
            '#sc-vibe .scw-row[aria-current="true"] .scw-row-t b{color:color-mix(in srgb,var(--sca-c1,#ff5500) 55%,#fff)}',
            '#sc-vibe .scw-row-e{display:none}',
            '#sc-vibe a.scw-link{color:inherit;text-decoration:none}',
            '#sc-vibe a.scw-link:hover{text-decoration:underline}',
            '@keyframes scv-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}',
            'html.scm-reduce #sc-vibe *,html.scm-reduce #sc-vibe *::before{animation:none!important;transition:none!important}',
            '@media (prefers-reduced-motion:reduce){#sc-vibe *,#sc-vibe *::before{animation:none!important;transition:none!important}}',
        ].join('\n');
        document.head.append(style);
    }

    function build(): HTMLElement {
        ensureStyle();
        const node = el('section', '');
        node.id = 'sc-vibe';
        node.setAttribute('aria-label', T.label);
        const bar = el('form', 'scv-bar');
        bar.insertAdjacentHTML('beforeend', ICON_SPARK.replace('<svg', '<svg class="scv-spark"'));
        input = el('input', 'scv-input');
        input.type = 'text';
        input.maxLength = 300;
        input.autocomplete = 'off';
        input.spellcheck = false;
        input.placeholder = T.placeholder;
        input.setAttribute('aria-label', T.label);
        badge = el('span', 'scv-badge', T.local);
        const go = el('button', 'scv-go');
        go.type = 'submit';
        go.setAttribute('aria-label', T.go);
        go.title = T.go;
        go.insertAdjacentHTML('beforeend', ICON_GO);
        bar.append(input, badge, go);
        bar.addEventListener('submit', (event) => {
            event.preventDefault();
            void run(input?.value ?? '', false);
        });
        const under = el('div', 'scv-under');
        T.examples.slice(0, 4).forEach((text, index) => {
            const ex = el('button', 'scv-ex', text);
            ex.type = 'button';
            ex.style.animationDelay = index * 60 + 'ms';
            ex.addEventListener('click', () => {
                if (input) input.value = text;
                void run(text, false);
            });
            under.append(ex);
        });
        chip = el('button', 'scv-toggle');
        chip.type = 'button';
        chip.title = T.noRuHint;
        chip.append(el('i', ''), document.createTextNode(T.noRu));
        chip.addEventListener('click', () => core.setNoRussian(!core.noRussian()));
        under.append(chip);
        status = el('div', 'scv-status');
        status.hidden = true;
        results = el('div', '');
        node.append(bar, under, status, results);
        node.addEventListener('click', onRowClick);
        // Подсказка в поле меняется, пока поле пустое и не в фокусе
        let at = 0;
        exampleTimer = setInterval(() => {
            if (!input || document.hidden || input.value || document.activeElement === input) return;
            at = (at + 1) % T.examples.length;
            input.classList.add('swap');
            setTimeout(() => {
                if (!input) return;
                input.placeholder = '«' + T.examples[at] + '»';
                input.classList.remove('swap');
            }, 350);
        }, 5000);
        void detectAi();
        return node;
    }

    async function detectAi(): Promise<void> {
        try {
            aiReady = (await host.soundcloudAPI?.vibe?.status?.()) === true;
        } catch {
            aiReady = false;
        }
        paintBadge();
    }
    function paintBadge(): void {
        if (!badge) return;
        badge.textContent = aiReady ? T.ai : T.local;
        badge.className = 'scv-badge' + (aiReady ? ' ai' : '');
        badge.title = aiReady ? T.aiHint : T.localHint;
    }

    function setStep(step: number): void {
        if (!status) return;
        status.hidden = step < 0;
        status.textContent = '';
        T.steps.forEach((text, index) => status!.append(el('span', index < step ? 'done' : index === step ? 'on' : '', text)));
    }

    // Строки выдачи: номер, обложка, название; клик по строке включает подборку с этого трека
    function onRowClick(event: MouseEvent): void {
        const target = event.target instanceof Element ? event.target : null;
        if (!target || target.closest('a.scw-link')) return;
        const row = target.closest<HTMLElement>('.scw-row[data-track]');
        if (!row) return;
        event.preventDefault();
        const id = Number(row.dataset.track);
        void play(id);
    }

    function paintResults(error = ''): void {
        if (!results) return;
        results.textContent = '';
        if (!lastPlan || !lastTop.length) return;
        const box = el('div', 'scv-res');
        const head = el('div', 'scv-head');
        const titles = el('div', '');
        titles.style.minWidth = '0';
        titles.append(el('div', 'scv-title', lastPlan.title), el('div', 'scv-sub', T.tracks(lastTop.length) + ' · ' + (lastPlan.source === 'ai' ? T.ai : T.local) + (error ? ' · ' + T.aiFallback : '')));
        const play = el('button', 'scv-btn solid', T.play);
        play.type = 'button';
        play.addEventListener('click', () => void startTop(null));
        const again = el('button', 'scv-btn', T.again);
        again.type = 'button';
        again.addEventListener('click', () => void run(lastText, true));
        const close = el('button', 'scv-btn', '✕');
        close.type = 'button';
        close.setAttribute('aria-label', T.close);
        close.addEventListener('click', () => {
            lastTop = [];
            lastPlan = null;
            paintResults();
        });
        head.append(titles, el('div', 'scv-sp'), play, again, close);
        const rows = el('div', 'scv-rows');
        const now = core.nowPlaying();
        lastTop.slice(0, 12).forEach((track, index) => {
            const { row } = core.trackRow(track, now);
            row.style.setProperty('--i', String(index));
            row.prepend(el('span', 'scv-n', String(index + 1)));
            rows.append(row);
        });
        box.append(head, rows);
        results.append(box);
    }

    // Поиск по плану: текстовые запросы, метки, треки из плана модели и топ треков артистов; находки считаются
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
            console.warn('Волна по описанию: поиск не ответил', error);
            return fallback;
        });
        const tasks: Array<Promise<void>> = [];
        for (const q of plan.queries.slice(0, 8)) tasks.push(safe(core.searchTracks(q), []).then((list) => add(list)));
        for (const tag of plan.tags.slice(0, 5))
            tasks.push(safe(core.call('searchCategory', { category: 'tracks' }, { q: '*', 'filter.genre_or_tag': tag, limit: 50 }).then(core.tracksOf), []).then((list) => add(list)));
        for (const wanted of plan.tracks.slice(0, 15))
            tasks.push(safe(core.searchTracks(wanted.replace(/\s[-–—]\s/, ' ')), []).then((list) => {
                const exact = list.filter((track) => vibeExact(track, wanted)).slice(0, 2);
                add(exact, { exact: true });
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
            const answer = await host.soundcloudAPI?.vibe?.plan(text, { genres, noRussian: core.noRussian() });
            if (mine !== request) return;
            const plan = answer?.plan;
            if (!plan) throw new Error('План не пришёл');
            if (plan.source === 'ai') aiReady = true;
            paintBadge();
            setStep(1);
            const { tracks, hits } = await collect(plan, mine);
            if (mine !== request) return;
            setStep(2);
            // «Ещё вариант»: тот же план, но первые места уходят в конец, а топ тасуется внутри
            let top = vibeRank(tracks, hits, plan, Date.now(), 40, core.isExcluded);
            if (variant > 0 && top.length > 8) {
                const shift = (variant * 7) % top.length;
                top = [...top.slice(shift), ...top.slice(0, shift)];
            }
            lastPlan = plan;
            lastTop = top;
            setStep(-1);
            if (!top.length) {
                core.showToast(T.nothing);
                paintResults();
                return;
            }
            paintResults(answer?.error ?? '');
            await startTop(null);
        } catch (error) {
            if (mine !== request) return;
            console.warn('Волна по описанию не собралась', error);
            setStep(-1);
            core.showToast(T.failed);
        } finally {
            if (mine === request) {
                busy = false;
                root?.classList.remove('busy');
            }
        }
    }

    // Топ играет по порядку (fixed), после него волна продолжает похожим от первых пяти
    async function startTop(fromId: number | null): Promise<void> {
        if (!lastPlan || !lastTop.length) return;
        const at = fromId ? lastTop.findIndex((track) => track.id === fromId) : 0;
        const first = at >= 0 ? lastTop[at] : lastTop[0];
        const own = [...lastTop.slice(at + 1), ...lastTop.slice(0, Math.max(0, at))];
        const seedRequest = core.nextSeedRequest();
        await core.beginSeed(seedRequest, { seed: { kind: 'vibe', title: lastPlan.title, own, tracks: lastTop.slice(0, 5), order: 'fixed', mode: 'similar' }, first });
        paintResults();
    }
    async function play(id: number): Promise<void> {
        await startTop(id);
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
            // Включили «Без русского» или отметили трек: из показанной выдачи уходит то же, что из волны
            const kept = lastTop.filter((track) => !core.isExcluded(track));
            if (kept.length !== lastTop.length) {
                lastTop = kept;
                paintResults();
            }
            if (results && lastTop.length) {
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
            if (exampleTimer) clearInterval(exampleTimer);
            root?.remove();
            root = null;
        },
    };
}
