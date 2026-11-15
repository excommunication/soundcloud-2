// Текст играющего трека для карточки волны (2.7.1). Сначала LRCLIB: открытая база без ключа, у многих песен там
// строки с таймкодами, и карточка подсвечивает их в такт. Не нашлось: Genius (поиск и страница песни), если он
// отвечает без проверки Cloudflare. Ходит main: у страницы сайта CORS не пустит. Наружу уходят только название и артист
export type GetJson = (url: string) => Promise<unknown>;
export type GetText = (url: string) => Promise<string>;

export interface LyricLine {
    /** Начало строки, мс */
    at: number;
    text: string;
}
export interface Lyrics {
    source: 'lrclib' | 'genius';
    title: string;
    artist: string;
    plain: string;
    /** Строки с таймкодами; null, если их нет или трек это переделка с другим темпом */
    synced: LyricLine[] | null;
}

// Переделки, у которых таймкоды оригинала не совпадут
const RETIMED = /\b(slowed|sped\s*up|speed\s*up|nightcore|daycore|reverb|8d|ultra\s*slowed|super\s*slowed)\b/i;
const NOISE = /\s*[([][^)\]]*\b(prod|feat|ft|with|official|lyrics?|audio|video|visuali[sz]er|slowed|sped|speed|nightcore|reverb|remix|edit|bass|boost|free|out now|clip|explicit|clean|remaster(ed)?|8d)\b[^)\]]*[)\]]/gi;

const textOf = (value: unknown): string => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '');
/** Ключ для сравнения: буквы и цифры любого алфавита в нижнем регистре */
export function lyricsKey(value: string): string {
    return value.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, '');
}

/** Что искать: «Артист - Песня (prod. X) [slowed]» даёт артиста и песню без хвостов; без дефиса артист это загрузчик */
export function lyricsQuery(title: string, uploader: string): { artist: string; track: string; retimed: boolean } {
    const raw = textOf(title);
    const retimed = RETIMED.test(raw);
    let rest = raw.replace(NOISE, '').replace(/\s+[-–—|]\s*(?:super\s+|ultra\s+)?(slowed|sped\s*up|speed\s*up|nightcore|daycore|reverb|8d)\b.*$/i, '').replace(/\s+(feat\.?|ft\.?|prod\.?)\s.*$/i, '').replace(/\s*\|.*$/, '').trim();
    let artist = textOf(uploader);
    const dash = rest.match(/^(.+?)\s+[-–—]\s+(.+)$/);
    if (dash) {
        artist = dash[1].trim();
        rest = dash[2].trim();
    }
    artist = artist.replace(/\s*[,&x×]\s.*$/i, '').replace(/\s+(feat\.?|ft\.?)\s.*$/i, '').trim();
    rest = rest.replace(/^["'«“]+|["'»”]+$/g, '').replace(RETIMED, '').replace(/\s{2,}/g, ' ').trim();
    return { artist, track: rest, retimed };
}

/** Строки LRC «[мм:сс.хх] текст»; пустые строки между куплетами остаются пустыми */
export function parseLrc(text: string): LyricLine[] {
    const lines: LyricLine[] = [];
    for (const row of text.split(/\r?\n/)) {
        const stamps = [...row.matchAll(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
        if (!stamps.length) continue;
        const words = row.replace(/\[[^\]]*\]/g, '').trim();
        for (const stamp of stamps) {
            const fraction = stamp[3] ? Number(stamp[3].padEnd(3, '0')) : 0;
            lines.push({ at: (Number(stamp[1]) * 60 + Number(stamp[2])) * 1000 + fraction, text: words });
        }
    }
    return lines.sort((a, b) => a.at - b.at);
}

interface LrclibItem {
    trackName?: unknown;
    artistName?: unknown;
    duration?: unknown;
    instrumental?: unknown;
    plainLyrics?: unknown;
    syncedLyrics?: unknown;
}
/** Лучшая запись LRCLIB: название совпадает (или одно содержит другое), артист и длительность прибавляют */
export function pickLrclib(items: unknown, artist: string, track: string, durationMs: number): LrclibItem | null {
    if (!Array.isArray(items)) return null;
    const wantTrack = lyricsKey(track);
    const wantArtist = lyricsKey(artist);
    if (!wantTrack) return null;
    let best: { item: LrclibItem; score: number } | null = null;
    for (const value of items) {
        if (!value || typeof value !== 'object') continue;
        const item = value as LrclibItem;
        if (item.instrumental === true || !textOf(item.plainLyrics)) continue;
        const name = lyricsKey(textOf(item.trackName));
        const who = lyricsKey(textOf(item.artistName));
        if (!name) continue;
        let score = name === wantTrack ? 4 : name.includes(wantTrack) || wantTrack.includes(name) ? 2 : 0;
        if (!score) continue;
        if (wantArtist && who && (who === wantArtist || who.includes(wantArtist) || wantArtist.includes(who))) score += 3;
        const seconds = typeof item.duration === 'number' ? item.duration : 0;
        if (durationMs > 0 && seconds > 0 && Math.abs(seconds * 1000 - durationMs) < 4000) score += 2;
        if (textOf(item.syncedLyrics)) score += 1;
        if (!best || score > best.score) best = { item, score };
    }
    return best && best.score >= 5 ? best.item : null;
}

/** Закрывающий тег для блока, открытого на позиции from (вложенные div учитываются) */
function blockEnd(html: string, from: number): number {
    const tag = /<(\/?)div\b[^>]*>/gi;
    tag.lastIndex = from;
    let depth = 1;
    for (let match = tag.exec(html); match; match = tag.exec(html)) {
        depth += match[1] ? -1 : 1;
        if (depth === 0) return match.index;
    }
    return -1;
}
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", '#x27': "'" };
/** Текст песни со страницы Genius: блоки data-lyrics-container, служебные вставки (data-exclude-from-selection) убраны */
export function geniusLyricsFromHtml(html: string): string | null {
    const parts: string[] = [];
    const open = /<div\b[^>]*data-lyrics-container="true"[^>]*>/gi;
    for (let match = open.exec(html); match; match = open.exec(html)) {
        const start = match.index + match[0].length;
        const end = blockEnd(html, start);
        if (end < 0) break;
        let block = html.slice(start, end);
        // Служебные вставки внутри блока убираются целиком
        for (let guard = 0; guard < 20; guard++) {
            const skip = /<div\b[^>]*data-exclude-from-selection="true"[^>]*>/i.exec(block);
            if (!skip) break;
            const close = blockEnd(block, skip.index + skip[0].length);
            block = close < 0 ? block.slice(0, skip.index) : block.slice(0, skip.index) + block.slice(close + 6);
        }
        parts.push(block);
        open.lastIndex = end;
    }
    if (!parts.length) return null;
    const text = parts
        .join('\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&(#?\w+);/g, (whole, name: string) => ENTITIES[name.toLowerCase()] ?? (name.startsWith('#') ? String.fromCodePoint(Number(name.startsWith('#x') ? '0x' + name.slice(2) : name.slice(1))) : whole))
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    return text || null;
}

interface GeniusHit {
    result?: { title?: unknown; url?: unknown; instrumental?: unknown; primary_artist?: { name?: unknown } };
}
/** Песня Genius из ответа поиска: то же название и похожий артист */
export function pickGenius(body: unknown, artist: string, track: string): { url: string; title: string; artist: string } | null {
    const sections = (body as { response?: { sections?: Array<{ hits?: GeniusHit[] }> } } | null)?.response?.sections;
    const hits = Array.isArray(sections) ? sections.flatMap((section) => (Array.isArray(section?.hits) ? section.hits : [])) : [];
    const wantTrack = lyricsKey(track);
    const wantArtist = lyricsKey(artist);
    for (const hit of hits) {
        const result = hit?.result;
        const url = textOf(result?.url);
        if (!result || result.instrumental === true || !/^https:\/\/genius\.com\//.test(url)) continue;
        const name = lyricsKey(textOf(result.title));
        const who = lyricsKey(textOf(result.primary_artist?.name));
        const sameTrack = name === wantTrack || (name.length > 3 && (name.startsWith(wantTrack) || wantTrack.startsWith(name)));
        const sameArtist = !wantArtist || !who || who.includes(wantArtist) || wantArtist.includes(who);
        if (sameTrack && sameArtist) return { url, title: textOf(result.title), artist: textOf(result.primary_artist?.name) };
    }
    return null;
}

/** Поиск текста: LRCLIB по полям, LRCLIB общим запросом, потом Genius. Ошибки сети дают null, а не исключение */
export async function findLyrics(
    deps: { getJson: GetJson; getText: GetText },
    input: { title: string; uploader: string; durationMs: number },
): Promise<Lyrics | null> {
    const { artist, track, retimed } = lyricsQuery(input.title, input.uploader);
    if (!track) return null;
    const safe = <T>(task: Promise<T>): Promise<T | null> => task.catch(() => null);
    const lrclib = 'https://lrclib.net/api/search?';
    const asks = [
        lrclib + new URLSearchParams({ track_name: track, ...(artist ? { artist_name: artist } : {}) }).toString(),
        lrclib + new URLSearchParams({ q: (artist + ' ' + track).trim() }).toString(),
    ];
    for (const url of asks) {
        const item = pickLrclib(await safe(deps.getJson(url)), artist, track, retimed ? 0 : input.durationMs);
        if (!item) continue;
        const synced = !retimed && textOf(item.syncedLyrics) ? parseLrc(String(item.syncedLyrics)) : [];
        return {
            source: 'lrclib',
            title: textOf(item.trackName),
            artist: textOf(item.artistName),
            plain: String(item.plainLyrics).trim(),
            synced: synced.length >= 4 ? synced : null,
        };
    }
    const found = pickGenius(await safe(deps.getJson('https://genius.com/api/search/song?per_page=5&q=' + encodeURIComponent((artist + ' ' + track).trim()))), artist, track);
    if (!found) return null;
    const html = await safe(deps.getText(found.url));
    const plain = html ? geniusLyricsFromHtml(html) : null;
    return plain ? { source: 'genius', title: found.title, artist: found.artist, plain, synced: null } : null;
}
