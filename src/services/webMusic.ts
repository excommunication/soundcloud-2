// Актуальные треки из интернета для «Настроить волну»: открытый API Deezer без ключа (поиск плейлистов, треков и чарт).
// Запрос «tiktok», «radio 2026 vibes» или «фонк для зала» ищется как плейлисты, из 3-4 лучших берутся треки, к ним
// популярные треки по запросу и, если просили актуальное, чарт. Трек, который встречается в нескольких источниках,
// стоит выше. На выходе «Артист - Название» для поиска на SoundCloud. Ходит main: у страницы сайта CORS не пустит
import { normalizeTag } from './waveGenres';

export interface WebFind {
    tracks: string[];
    /** Откуда взято, для подписи: «Deezer: TikTok Hits 2026» */
    sources: string[];
}
export type GetJson = (url: string) => Promise<unknown>;

const API = 'https://api.deezer.com';
// Переделки, которые в волне не нужны, если о них не просили
export const JUNK = /\b(slowed|sped\s*up|speed\s*up|nightcore|reverb|bass\s*boost(ed)?|8d|tik\s*tok\s*version|tiktok\s*version|ultra\s*slowed|super\s*slowed)\b/i;
const TRENDING = /актуал|тренд|trend|chart|чарт|хит|\bhits?\b|\btop\b|топ|20[2-3]\d|нов(ое|ые|инк)|\bnew\b|viral|вирус/i;

interface DzTrack { title?: unknown; title_short?: unknown; rank?: unknown; artist?: { name?: unknown } }
interface DzPlaylist { id?: unknown; title?: unknown; nb_tracks?: unknown }
const list = (body: unknown): unknown[] => {
    const data = (body as { data?: unknown } | null)?.data;
    return Array.isArray(data) ? data : [];
};
const text = (value: unknown): string => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '');
/** Название без «(feat. …)», «[Official Video]» и «- Remastered 2011»: так оно лучше ищется на SoundCloud */
export function cleanTitle(title: string): string {
    return title
        .replace(/\s*[([](feat\.?|ft\.?|with|prod\.?|official|lyrics?|audio|video|explicit|clean|radio edit|remaster(ed)?)[^)\]]*[)\]]/gi, '')
        .replace(/\s+-\s+(remaster(ed)?|radio edit|single version|original mix).*$/i, '')
        .trim();
}

/** Поиск по Deezer: queries это 1-3 формулировки запроса (сам текст и английские из плана). Ошибки сети не роняют поиск */
export async function findWebTracks(queries: string[], getJson: GetJson, options: { noRussian: boolean; limit?: number; raw?: string } = { noRussian: false }): Promise<WebFind> {
    const limit = options.limit ?? 40;
    const asks = [...new Set(queries.map((q) => text(q)).filter(Boolean))].slice(0, 3);
    if (!asks.length) return { tracks: [], sources: [] };
    const safe = (url: string): Promise<unknown> => getJson(url).catch(() => null);
    const words = asks[0].toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((word) => word.length >= 3);
    // Плейлисты: где в названии больше слов запроса и треков от 15 до 400
    const found = await Promise.all(asks.map((q) => safe(`${API}/search/playlist?q=${encodeURIComponent(q)}&limit=15`)));
    const seen = new Set<number>();
    const playlists = found
        .flatMap(list)
        .map((item) => item as DzPlaylist)
        .filter((item) => typeof item.id === 'number' && !seen.has(item.id) && seen.add(item.id))
        .map((item) => {
            const title = text(item.title);
            const tracks = typeof item.nb_tracks === 'number' ? item.nb_tracks : 0;
            const hit = words.filter((word) => title.toLowerCase().includes(word)).length;
            return { id: item.id as number, title, score: hit * 10 + Math.min(tracks, 200) / 40, tracks };
        })
        .filter((item) => item.tracks >= 15 && item.tracks <= 400)
        .sort((a, b) => b.score - a.score)
        .slice(0, 4);
    const trending = TRENDING.test(options.raw ?? asks.join(' '));
    const [direct, chart, ...lists] = await Promise.all([
        safe(`${API}/search/track?q=${encodeURIComponent(asks[0])}&order=RANKING&limit=25`),
        trending ? safe(`${API}/chart/0/tracks?limit=50`) : Promise.resolve(null),
        ...playlists.map((item) => safe(`${API}/playlist/${item.id}/tracks?limit=80`)),
    ]);
    const wantJunk = JUNK.test(options.raw ?? asks.join(' '));
    const score = new Map<string, { label: string; score: number }>();
    const add = (items: unknown[], weight: number): void => {
        items.forEach((value, index) => {
            const track = value as DzTrack;
            const artist = text(track.artist?.name);
            const title = cleanTitle(text(track.title_short) || text(track.title));
            if (!artist || !title) return;
            if (!wantJunk && JUNK.test(title)) return;
            if (options.noRussian && /\p{Script=Cyrillic}/u.test(artist + ' ' + title)) return;
            const key = normalizeTag(artist) + '|' + normalizeTag(title);
            const rank = typeof track.rank === 'number' ? track.rank : 0;
            const entry = score.get(key) ?? { label: artist + ' - ' + title, score: 0 };
            // Встреча в источнике, чуть больше в начале списка, и популярность по Deezer
            entry.score += weight * (1 + 0.5 / (1 + index / 10)) + rank / 2_000_000;
            score.set(key, entry);
        });
    };
    lists.forEach((body) => add(list(body), 2));
    add(list(direct), 1.2);
    add(list(chart), 1);
    const tracks = [...score.values()].sort((a, b) => b.score - a.score).slice(0, limit).map((entry) => entry.label);
    const sources = [...playlists.filter((_, index) => list(lists[index]).length).map((item) => item.title), ...(list(chart).length ? ['Чарт Deezer'] : [])];
    return { tracks, sources };
}
