// «Волна по описанию»: человек пишет запрос словами («грустный инди на ночь под дождь», «фонк для зала без русского»),
// main превращает его в план поиска. Без ключа работает локальный разбор по словарям, с ключом запрос разбирает
// языковая модель (OpenAI-совместимый API, Anthropic или локальная Ollama), а локальный план её дополняет.
// Ключ хранится зашифрованным (safeStorage), на страницу уходит только план
import { genreEnglish, normalizeTag } from './waveGenres';
import type { VibePlan } from './waveVibe';

export type AiProvider = 'off' | 'openai' | 'openrouter' | 'groq' | 'anthropic' | 'ollama' | 'custom';
export const AI_PROVIDERS: readonly AiProvider[] = ['off', 'openai', 'openrouter', 'groq', 'anthropic', 'ollama', 'custom'];
export interface AiConfig {
    provider: AiProvider;
    baseUrl: string;
    model: string;
    key: string;
}
/** Адрес и модель по умолчанию: поля в F1 можно поменять */
export const AI_DEFAULTS: Record<Exclude<AiProvider, 'off'>, { baseUrl: string; model: string }> = {
    openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1-mini' },
    openrouter: { baseUrl: 'https://openrouter.ai/api/v1', model: 'openrouter/auto' },
    groq: { baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
    anthropic: { baseUrl: 'https://api.anthropic.com/v1', model: 'claude-haiku-4-5' },
    ollama: { baseUrl: 'http://localhost:11434/v1', model: 'llama3.2' },
    custom: { baseUrl: '', model: '' },
};

/** Что страница знает о вкусе: любимые жанры и включён ли «Без русского» */
export interface VibeContext {
    genres: string[];
    noRussian: boolean;
}

interface Rule {
    re: RegExp;
    tags?: string[];
    queries?: string[];
    words?: string[];
    popularity?: VibePlan['popularity'];
}

// Сцены и настроения: русские и английские формы. Порядок важен только для подписи
const RULES: Rule[] = [
    { re: /ноч|night|midnight/iu, tags: ['night'], words: ['night', 'midnight'] },
    { re: /дожд|ливень|rain/iu, tags: ['rain', 'lofi'], words: ['rain'] },
    { re: /драйв|машин|дорог|трасс|за рул|drive|driving|road ?trip|\bcar\b/iu, tags: ['drive'], queries: ['night drive'], words: ['drive', 'driving', 'night'] },
    { re: /(?<!\p{L})зал(а|е|у|ом)?(?!\p{L})|трениров|качал|качат|спортзал|gym|workout|lifting/iu, tags: ['workout', 'phonk'], queries: ['gym workout'], words: ['gym', 'workout'], popularity: 'hits' },
    { re: /(?<!\p{L})бег(?!\p{L})|для\s+бега|пробеж|\brun(ning)?\b|cardio/iu, tags: ['running'], queries: ['running music'], words: ['run'] },
    { re: /уч[её]б|для\s+работы|фокус|концентр|\bstudy|\bfocus|coding|кодинг|програмир|программир/iu, tags: ['lofi', 'study'], queries: ['study lofi'], words: ['study', 'focus', 'lofi'] },
    { re: /(?<!\p{L})сна?(?!\p{L})|(?<!\p{L})сон(?!\p{L})|спать|засып|колыбел|sleep/iu, tags: ['sleep', 'ambient'], queries: ['sleep ambient'], words: ['sleep', 'ambient'] },
    { re: /вечерин|туса|тусов|пати|party|клуб|club/iu, tags: ['party', 'dance'], words: ['party', 'club', 'dance'], popularity: 'hits' },
    { re: /утр|morning|рассвет|sunrise/iu, tags: ['morning'], words: ['morning', 'sunrise'] },
    { re: /(?<!\p{L})лет(о|а|ом|ний|няя|нее)(?!\p{L})|summer|пляж|beach/iu, tags: ['summer'], words: ['summer'] },
    { re: /зим|winter|снег|snow/iu, tags: ['winter'], words: ['winter', 'snow'] },
    { re: /осен|autumn|fall\b/iu, tags: ['autumn'], words: ['autumn'] },
    { re: /кофе|(?<!\p{L})кафе|coffee|\bcafe/iu, tags: ['jazz', 'lofi'], words: ['coffee', 'jazz'] },
    { re: /романт|любов|свидан|love|romantic/iu, tags: ['love', 'rnb'], words: ['love'] },
    { re: /груст|печал|тоск|депрес|плак|sad|melanchol|heartbreak/iu, tags: ['sad'], words: ['sad', 'melancholic'] },
    { re: /вес[её]л|радост|позитив|happy|feel ?good|upbeat/iu, tags: ['happy'], words: ['happy', 'upbeat'] },
    { re: /агресс|зл(ой|ая|ое)|ярост|rage|angry|aggressive/iu, tags: ['rage'], words: ['rage', 'aggressive'] },
    { re: /спокой|расслаб|релакс|чил|calm|relax|chill/iu, tags: ['chill'], words: ['chill', 'relax'] },
    { re: /энерг|бодр|качает|energ|hype/iu, tags: ['energetic'], words: ['energy', 'hype'] },
    { re: /мечтат|воздуш|dream/iu, tags: ['dreamy', 'dream pop'], words: ['dream'] },
    { re: /т[её]мн|мрачн|dark|gloomy/iu, tags: ['dark'], words: ['dark'] },
    { re: /атмосфер|atmospher|cinematic|эпич|epic/iu, tags: ['atmospheric', 'cinematic'], words: ['atmospheric', 'epic'] },
    { re: /ретро|retro|\b80(-?х|s|'s)?(?![\d])|восьмидесят/iu, tags: ['80s', 'retro'], words: ['80s', 'retro'] },
    { re: /\b90(-?х|s|'s)(?![\d])|девяност/iu, tags: ['90s'], words: ['90s'] },
    { re: /аниме|anime/iu, tags: ['anime'], words: ['anime'] },
    { re: /гейм|gaming|видеоигр|для\s+игр|\bgame\b/iu, tags: ['gaming'], words: ['gaming'] },
];

// Жанры, которые узнаются в тексте как есть (латиница) и по-русски через genreEnglish
const GENRES = [
    'phonk', 'drift phonk', 'drill', 'trap', 'rap', 'hip hop', 'lofi', 'jazz', 'rock', 'indie', 'indie pop', 'pop', 'metal', 'drum & bass', 'dnb', 'ambient',
    'hyperpop', 'shoegaze', 'synthwave', 'darkwave', 'post-punk', 'r&b', 'rnb', 'emo', 'uk garage', 'dubstep', 'trance', 'techno', 'house', 'deep house',
    'breakcore', 'jersey club', 'witch house', 'vaporwave', 'grunge', 'k-pop', 'afrobeat', 'reggaeton', 'classical', 'piano', 'acoustic', 'punk', 'soul',
    'funk', 'disco', 'electronic', 'edm', 'chillwave', 'dream pop', 'bedroom pop', 'alternative', 'cloud rap', 'plugg', 'rage', 'baile funk', 'amapiano',
];

const clean = (text: string): string => text.replace(/\s+/g, ' ').trim();
const uniq = (list: string[], limit: number): string[] => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of list) {
        const value = clean(item);
        const key = normalizeTag(value);
        if (!value || key.length < 2 || seen.has(key)) continue;
        seen.add(key);
        out.push(value);
        if (out.length >= limit) break;
    }
    return out;
};

/** Подпись волны из текста запроса: первая буква заглавная, не длиннее 48 знаков */
export function vibeTitle(text: string): string {
    const value = clean(text).replace(/[.!?…]+$/u, '');
    const short = value.length > 48 ? value.slice(0, 47).replace(/\s+\S*$/u, '') + '…' : value;
    return short ? short[0].toUpperCase() + short.slice(1) : '';
}

/** Локальный разбор: сцены, настроения, жанры, язык, популярность, свежесть, «в стиле X» и «без slowed» */
export function planLocal(input: string, context: VibeContext = { genres: [], noRussian: false }): VibePlan {
    const text = clean(input).slice(0, 300);
    const lower = text.toLowerCase();
    const tags: string[] = [];
    const queries: string[] = [];
    const words: string[] = [];
    const avoid: string[] = [];
    const artists: string[] = [];
    let popularity: VibePlan['popularity'] = 'balanced';
    for (const rule of RULES) {
        if (!rule.re.test(lower)) continue;
        tags.push(...(rule.tags ?? []));
        queries.push(...(rule.queries ?? []));
        words.push(...(rule.words ?? []));
        if (rule.popularity) popularity = rule.popularity;
    }
    const genres: string[] = [];
    for (const genre of GENRES) {
        const pattern = new RegExp('(^|[^\\p{L}])' + genre.replace(/[.*+?^${}()|[\]\\&]/g, (ch) => (ch === '&' ? '&' : '\\' + ch)).replace(/\s/g, '[\\s-]?') + '($|[^\\p{L}])', 'iu');
        if (pattern.test(lower)) genres.push(genre);
    }
    for (const word of lower.split(/[^\p{L}&]+/u)) {
        if (!/\p{Script=Cyrillic}/u.test(word) || word.length < 3) continue;
        const english = genreEnglish(word);
        if (english !== word) genres.push(english);
    }
    // «альтернативный рок», «дип хаус» и другие из двух слов
    for (const pair of lower.matchAll(/([\p{L}]+)\s+([\p{L}]+)/gu)) {
        const english = genreEnglish(pair[1] + pair[2]);
        if (english !== pair[1] + pair[2]) genres.push(english);
    }
    const genreList = uniq(genres, 4);
    tags.unshift(...genreList);
    words.push(...genreList);
    // Язык: отрицание раньше утверждения
    let lang: VibePlan['lang'] = 'any';
    if (/без\s+рус|не\s+на\s+рус|не\s+русск|no\s+russian|without\s+russian|non[- ]russian/iu.test(lower)) lang = 'noRu';
    else if (/на\s+русском|русск(ий|ое|ая|ие|ого)|russian|ру[сз]\s?рэп|рус(ский)?\s?рок/iu.test(lower)) lang = 'ru';
    else if (/на\s+английском|англоязыч|english|in\s+english/iu.test(lower)) lang = 'en';
    if (lang === 'any' && context.noRussian) lang = 'noRu';
    if (/хит|топ|популяр|известн|\bhits?\b|\btop\b|popular|best|лучш/iu.test(lower)) popularity = 'hits';
    if (/андеграунд|малоизвест|неизвест|редк|скрыт|underground|hidden\s+gems?|obscure|niche|ниш/iu.test(lower)) popularity = 'underground';
    const fresh = /нов(ое|ые|ая|ый|инк)|свеж|\b202[4-9]\b|\bnew\b|fresh|latest|recent/iu.test(lower);
    for (const [re, word] of [
        [/без\s+(slowed|замедл)|no\s+slowed|not\s+slowed/iu, 'slowed'],
        [/без\s+(sped|speed|ускор|nightcore|найткор)|no\s+(sped|nightcore)/iu, 'spedup'],
        [/без\s+ремикс|no\s+remix|без\s+remix|оригинал/iu, 'remix'],
        [/без\s+кавер|no\s+covers?/iu, 'cover'],
        [/без\s+(nightcore|найткор)/iu, 'nightcore'],
    ] as Array<[RegExp, string]>)
        if (re.test(lower)) avoid.push(word);
    // «в стиле X», «как у X», «похоже на X», «типа X», «like X», «similar to X»: имя до запятой, точки или союза
    for (const match of text.matchAll(/(?:в\s+стиле|как\s+у|похож(?:ее|ие|ая)?\s+на|типа|вроде|like|similar\s+to|in\s+the\s+style\s+of|inspired\s+by)\s+([^,.;!?]+)/giu)) {
        const name = match[1].split(/\s+(?:но|и|только|без|для|на|под|чтобы|but|and|for|with|without)\s+/iu)[0].trim();
        if (name && name.split(/\s+/).length <= 4 && !/^(это|that|this)$/iu.test(name)) artists.push(name);
    }
    // Поиски: жанр плюс сцена, отдельно сцены и жанры; сам текст тоже, если он короткий
    const scene = tags.find((tag) => !genreList.includes(tag));
    if (genreList.length && scene) queries.unshift(genreList[0] + ' ' + scene);
    if (genreList.length > 1) queries.push(genreList[0] + ' ' + genreList[1]);
    queries.push(...genreList.map((genre) => (popularity === 'hits' ? genre + ' hits' : genre)));
    if (!genreList.length && context.genres.length && scene) queries.push(context.genres[0] + ' ' + scene, ...context.genres.slice(0, 2).map((genre) => scene + ' ' + genre));
    if (text.length <= 40 && !/[.!?]/.test(text)) queries.push(text);
    for (const artist of artists) queries.push(artist);
    if (!queries.length && !tags.length) queries.push(text);
    return {
        title: vibeTitle(text),
        queries: uniq(queries, 8),
        tags: uniq(tags, 6),
        tracks: [],
        artists: uniq(artists, 4),
        words: uniq(words.map(normalizeTag), 12),
        avoid: uniq(avoid, 6),
        lang,
        popularity,
        fresh,
        source: 'local',
    };
}

const SYSTEM = `You are a music curator for a SoundCloud client. Turn the listener's request (any language, often Russian) into a JSON search plan.
Return ONLY a JSON object with these fields:
"title": short label of the vibe in the listener's language (max 6 words),
"queries": 3-8 short English search queries for SoundCloud (genre + mood + scene),
"tags": up to 6 SoundCloud genre/tag names in English (e.g. "phonk", "dream pop", "lofi"),
"tracks": 8-15 real, well-known songs that best fit, as "Artist - Title" (prefer tracks likely uploaded on SoundCloud),
"artists": up to 6 fitting artists,
"words": up to 10 lowercase English keywords that describe the vibe,
"avoid": words that must not appear (e.g. "slowed", "nightcore", "remix") if the listener excluded them,
"lang": "any" | "noRu" (no Russian-language songs) | "ru" | "en",
"popularity": "hits" | "balanced" | "underground",
"fresh": true only if the listener wants new releases.
Respect explicit exclusions. If the listener says "без русского" / no Russian, set lang "noRu" and do not suggest Russian-language songs.`;

const asList = (value: unknown, limit: number, max = 80): string[] =>
    Array.isArray(value) ? uniq(value.filter((item): item is string => typeof item === 'string').map((item) => item.slice(0, max)), limit) : [];

/** Ответ модели в план: только известные поля нужных типов, лишнее отбрасывается, недостающее берётся из локального */
export function sanitizePlan(raw: unknown, local: VibePlan): VibePlan {
    const value = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const lang = (['any', 'noRu', 'ru', 'en'] as const).find((item) => item === value.lang) ?? local.lang;
    const popularity = (['hits', 'balanced', 'underground'] as const).find((item) => item === value.popularity) ?? local.popularity;
    const title = typeof value.title === 'string' && clean(value.title) ? vibeTitle(value.title) : local.title;
    return {
        title,
        queries: uniq([...asList(value.queries, 8), ...local.queries], 10),
        tags: uniq([...asList(value.tags, 6, 40), ...local.tags], 8),
        tracks: asList(value.tracks, 15, 120),
        artists: uniq([...asList(value.artists, 6, 60), ...local.artists], 6),
        words: uniq([...asList(value.words, 10, 30), ...local.words].map(normalizeTag), 14),
        avoid: uniq([...asList(value.avoid, 6, 30), ...local.avoid].map(normalizeTag), 8),
        // «Без русского» из настроек сильнее модели
        lang: local.lang === 'noRu' ? 'noRu' : lang,
        popularity,
        fresh: typeof value.fresh === 'boolean' ? value.fresh : local.fresh,
        source: 'ai',
    };
}

/** JSON из ответа модели: целиком, внутри ```json или первый объект в тексте */
export function extractJson(text: string): unknown {
    const trimmed = text.trim();
    const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
    const candidates = [trimmed, fenced?.[1] ?? '', trimmed.slice(trimmed.indexOf('{'), trimmed.lastIndexOf('}') + 1)];
    for (const candidate of candidates) {
        if (!candidate) continue;
        try {
            return JSON.parse(candidate);
        } catch {
            // следующий вариант
        }
    }
    return null;
}

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** Проверка настроек модели: провайдер из списка, адрес http(s), без перевода строк */
export function isAiConfig(value: unknown): value is AiConfig {
    if (!value || typeof value !== 'object') return false;
    const config = value as Record<string, unknown>;
    if (!AI_PROVIDERS.includes(config.provider as AiProvider)) return false;
    for (const key of ['baseUrl', 'model', 'key'] as const) if (typeof config[key] !== 'string' || (config[key] as string).length > 4096 || /[\r\n\0]/.test(config[key] as string)) return false;
    if (config.baseUrl) {
        try {
            const url = new URL(config.baseUrl as string);
            if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return false;
        } catch {
            return false;
        }
    }
    return true;
}

/** Запрос к модели: OpenAI-совместимый chat/completions или Anthropic messages. Ответ это текст модели */
export async function askModel(config: AiConfig, user: string, fetcher: FetchLike, timeoutMs = 20000): Promise<string> {
    if (config.provider === 'off') throw new Error('Модель выключена');
    const defaults = AI_DEFAULTS[config.provider];
    const base = (config.baseUrl || defaults.baseUrl).replace(/\/+$/, '');
    const model = config.model || defaults.model;
    if (!base || !model) throw new Error('Не указан адрес или модель');
    if (config.provider !== 'ollama' && config.provider !== 'custom' && !config.key) throw new Error('Не указан ключ');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        if (config.provider === 'anthropic') {
            const response = await fetcher(base + '/messages', {
                method: 'POST',
                headers: { 'content-type': 'application/json', 'x-api-key': config.key, 'anthropic-version': '2023-06-01' },
                body: JSON.stringify({ model, max_tokens: 1200, system: SYSTEM, messages: [{ role: 'user', content: user }] }),
                signal: controller.signal,
            });
            if (!response.ok) throw new Error('Модель ответила ' + response.status);
            const body = (await response.json()) as { content?: Array<{ type?: string; text?: string }> };
            return (body.content ?? []).filter((part) => part.type === 'text').map((part) => part.text ?? '').join('');
        }
        const headers: Record<string, string> = { 'content-type': 'application/json' };
        if (config.key) headers.authorization = 'Bearer ' + config.key;
        if (config.provider === 'openrouter') {
            headers['HTTP-Referer'] = 'https://github.com/soundcloud-desktop';
            headers['X-Title'] = 'SoundCloud Desktop';
        }
        const response = await fetcher(base + '/chat/completions', {
            method: 'POST',
            headers,
            body: JSON.stringify({
                model,
                temperature: 0.4,
                response_format: { type: 'json_object' },
                messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }],
            }),
            signal: controller.signal,
        });
        if (!response.ok) throw new Error('Модель ответила ' + response.status);
        const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
        return body.choices?.[0]?.message?.content ?? '';
    } finally {
        clearTimeout(timer);
    }
}

/** План запроса: модель, если настроена, иначе или при сбое локальный разбор. error объясняет, почему модель не помогла */
export async function planVibe(text: string, context: VibeContext, config: AiConfig | null, fetcher: FetchLike): Promise<{ plan: VibePlan; error?: string }> {
    const local = planLocal(text, context);
    if (!config || config.provider === 'off') return { plan: local };
    const hints = [
        'Request: ' + clean(text).slice(0, 300),
        context.genres.length ? 'Listener usually likes: ' + context.genres.slice(0, 6).join(', ') + ' (use only as a soft hint).' : '',
        context.noRussian ? 'The listener excluded Russian-language songs.' : '',
    ].filter(Boolean).join('\n');
    try {
        const answer = await askModel(config, hints, fetcher);
        const parsed = extractJson(answer);
        if (!parsed) return { plan: local, error: 'Модель вернула не JSON' };
        return { plan: sanitizePlan(parsed, local) };
    } catch (error) {
        return { plan: local, error: error instanceof Error ? error.message : String(error) };
    }
}
