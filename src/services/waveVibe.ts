// «Волна по описанию» и фильтр «Без русского»: чистые функции отбора и порядка.
// Функции уходят на страницу текстом вместе с волной (pageHelpers в wave.ts) и зовут друг друга по голому имени,
// поэтому чужие функции разобраны в константы, как в wavePicks.ts
import * as identity from './trackIdentity';
import * as waveGenres from './waveGenres';
import * as wavePicks from './wavePicks';
import type { WaveTrack } from './waveTypes';

const { copyKey, nameKey } = identity;
const { normalizeTag, trackLang } = waveGenres;
const { trackArtist, isWaveEligible, spreadBy } = wavePicks;

/** Разобранный запрос «Волны по описанию»: его собирает main (локальный разбор или модель), страница по нему ищет и ранжирует */
export interface VibePlan {
    /** Короткая подпись волны: «Ночной драйв под дождь» */
    title: string;
    /** Текстовые поиски по каталогу */
    queries: string[];
    /** Поиски по жанру или метке (filter.genre_or_tag) */
    tags: string[];
    /** Конкретные треки «Артист - Название», которые модель считает топом под запрос */
    tracks: string[];
    /** Артисты, чьи треки подходят под запрос */
    artists: string[];
    /** Слова для релевантности: ищутся в названии, жанре и метках (нормализованные) */
    words: string[];
    /** Чего не надо: slowed, nightcore, remix и т. п. (нормализованные) */
    avoid: string[];
    lang: 'any' | 'noRu' | 'ru' | 'en';
    popularity: 'hits' | 'balanced' | 'underground';
    /** Только свежее: последние полтора года */
    fresh: boolean;
    source: 'local' | 'ai';
    /** Откуда взяты треки из интернета: названия плейлистов Deezer, «Чарт Deezer» */
    sources?: string[];
}

/** Сколько раз трек нашёлся и нашёлся ли он точным совпадением с треком из плана */
export interface VibeHit {
    count: number;
    exact: boolean;
    artist: boolean;
}

// Песня на русском: кириллица в названии, нике или издателе, либо метки русского рэпа и попа.
// Инструменталы остаются: слов в них нет. Украинский, белорусский и казахский по своим буквам без ы, э, ъ, ё не считаются
export function russianTrack(track: WaveTrack): boolean {
    if (!track) return false;
    if (trackLang(track) === 'inst') return false;
    const text = [track.title ?? '', track.user?.username ?? '', track.publisher_metadata?.artist ?? ''].join(' ');
    if (/\p{Script=Cyrillic}/u.test(text)) {
        const russianOnly = /[ыэъё]/iu.test(text);
        const otherCyrillic = /[іїєґўәғқңөұүһ]/iu.test(text);
        return russianOnly || !otherCyrillic;
    }
    const tags: string[] = [normalizeTag(track.genre ?? '')];
    for (const match of (track.tag_list ?? '').matchAll(/"([^"]+)"|(\S+)/g)) tags.push(normalizeTag(match[1] ?? match[2] ?? ''));
    return tags.some((key) => key.length >= 4 && (key.startsWith('russian') || key.startsWith('русск') || key === 'rusrap' || key === 'ruspop' || key === 'rurap' || key === 'русрэп' || key === 'рускийрэп'));
}

// Подходит ли трек под языковое условие плана: «без русского» и «на английском» отсекают, «на русском» только поднимает
export function vibeLangOk(track: WaveTrack, lang: VibePlan['lang']): boolean {
    if (lang === 'noRu') return !russianTrack(track);
    if (lang === 'en') return !/\p{Script=Cyrillic}/u.test((track.title ?? '') + ' ' + (track.user?.username ?? ''));
    return true;
}

// Оценка трека под запрос: совпадения поиска, слова запроса в названии и метках, популярность по желанию плана,
// доля лайков к прослушиваниям, свежесть. Чем больше, тем выше в выдаче
export function vibeScore(track: WaveTrack, hit: VibeHit | undefined, plan: VibePlan, now: number): number {
    const count = hit?.count ?? 1;
    let score = Math.log2(1 + count) * 0.9;
    if (hit?.exact) score += 2.2;
    if (hit?.artist) score += 0.6;
    const words: string[] = [normalizeTag(track.title ?? ''), normalizeTag(track.genre ?? '')];
    for (const match of (track.tag_list ?? '').matchAll(/"([^"]+)"|(\S+)/g)) words.push(normalizeTag(match[1] ?? match[2] ?? ''));
    const hay = words.join(' ');
    if (plan.words.length) {
        const found = plan.words.filter((word) => word.length >= 3 && hay.includes(word)).length;
        score += 1.4 * (found / plan.words.length);
    }
    if (plan.avoid.some((word) => word.length >= 3 && hay.includes(word))) score -= 2.5;
    // slowed, nightcore, bass boosted и «tiktok version» вниз, если о них не просили словами запроса
    const junk = /\b(slowed|sped\s*up|speed\s*up|nightcore|reverb|bass\s*boost(ed)?|8d|tik\s*tok\s*(version|remix)|tiktok\s*(version|remix))\b/i;
    if (junk.test(track.title ?? '') && !plan.words.some((word) => ['slowed', 'spedup', 'nightcore', 'reverb', 'bassboosted'].includes(word))) score -= 3;
    const plays = typeof track.playback_count === 'number' && track.playback_count > 0 ? track.playback_count : 0;
    const likes = typeof track.likes_count === 'number' && track.likes_count > 0 ? track.likes_count : 0;
    // 1k прослушиваний это 0.43, 100k это 0.71, 10M это 1
    const pop = Math.min(1.1, Math.log10(1 + plays) / 7);
    if (plan.popularity === 'hits') score += 2.2 * pop;
    else if (plan.popularity === 'balanced') score += 1.2 * pop;
    else score += 0.9 * pop - 2.2 * Math.max(0, pop - 0.72);
    // Лайкают от 1 до 5 % слушавших: выше значит трек держит
    if (plays >= 200) score += Math.min(0.5, (likes / plays) * 12);
    const date = Date.parse(track.release_date || track.display_date || track.created_at || '');
    if (Number.isFinite(date)) {
        const days = (now - date) / 86400000;
        if (plan.fresh) score += days < 548 ? 0.9 - days / 1200 : -0.9;
    }
    if (plan.lang === 'ru') score += russianTrack(track) ? 0.7 : -0.6;
    return score;
}

// Выдача по запросу: годное для волны, без запретов и чужого языка, по одной копии записи, не больше двух треков артиста
// и один артист не подряд. exclude это запреты волны («Не нравится», скрытые, «Без русского»)
export function vibeRank(
    tracks: WaveTrack[],
    hits: Map<number, VibeHit>,
    plan: VibePlan,
    now: number,
    limit: number,
    exclude: (track: WaveTrack) => boolean = () => false,
): WaveTrack[] {
    const seen = new Set<number>();
    const scored: Array<{ track: WaveTrack; score: number }> = [];
    for (const track of tracks) {
        if (!track || seen.has(track.id)) continue;
        seen.add(track.id);
        if (!isWaveEligible(track) || exclude(track) || !vibeLangOk(track, plan.lang)) continue;
        scored.push({ track, score: vibeScore(track, hits.get(track.id), plan, now) });
    }
    scored.sort((a, b) => b.score - a.score || a.track.id - b.track.id);
    const copies = new Set<string>();
    const perArtist = new Map<string, number>();
    const picked: WaveTrack[] = [];
    for (const { track } of scored) {
        const key = copyKey(track);
        if (key && copies.has(key)) continue;
        const artist = String(trackArtist(track) || nameKey(track.user?.username));
        const taken = perArtist.get(artist) ?? 0;
        if (taken >= 2) continue;
        if (key) copies.add(key);
        perArtist.set(artist, taken + 1);
        picked.push(track);
        if (picked.length >= limit) break;
    }
    return spreadBy(picked, (track) => String(trackArtist(track) || nameKey(track.user?.username)), 2);
}

// Совпадает ли найденный трек с «Артист - Название» из плана: имя загрузчика или издателя и все значимые слова названия
export function vibeExact(track: WaveTrack, wanted: string): boolean {
    const dash = wanted.search(/\s[-–—]\s/);
    const artist = dash > 0 ? wanted.slice(0, dash) : '';
    const title = dash > 0 ? wanted.slice(dash + 3) : wanted;
    const own = normalizeTag(track.title ?? '');
    const parts = title.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((part) => part.length >= 2).map(normalizeTag);
    if (!parts.length || !parts.every((part) => own.includes(part))) return false;
    if (!artist) return true;
    const who = normalizeTag([track.user?.username ?? '', track.publisher_metadata?.artist ?? '', track.title ?? ''].join(' '));
    const names = artist.toLowerCase().split(/[,&]|\s(?:x|feat\.?|ft\.?)\s/u).map(normalizeTag).filter((name) => name.length >= 2);
    return names.some((name) => who.includes(name));
}
