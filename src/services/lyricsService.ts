// Текст играющего трека для карточки волны (2.7.1). Сначала LRCLIB: открытая база без ключа, у многих песен там
// строки с таймкодами, и карточка подсвечивает их в такт. Не нашлось: Genius (поиск и страница песни), если он
// отвечает без проверки Cloudflare. Ходит main: у страницы сайта CORS не пустит. Наружу уходят только название и артист
export type GetJson = (url: string) => Promise<unknown>;
export type GetText = (url: string) => Promise<string>;

export interface LyricWord {
    /** Начало слова, мс */
    at: number;
    text: string;
}
export interface LyricLine {
    /** Начало строки, мс */
    at: number;
    text: string;
    /** Слова с таймкодами из расширенного LRC («<мм:сс.хх> слово»); без них карточка раскладывает слова сама */
    words?: LyricWord[];
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

const stampMs = (min: string, sec: string, frac?: string): number => (Number(min) * 60 + Number(sec)) * 1000 + (frac ? Number(frac.padEnd(3, '0').slice(0, 3)) : 0);
/** Строки LRC «[мм:сс.хх] текст»; пустые строки между куплетами остаются пустыми. Расширенный LRC со словами
 *  «<мм:сс.хх>» даёт и таймкоды слов, сами метки из текста убираются */
export function parseLrc(text: string): LyricLine[] {
    const lines: LyricLine[] = [];
    for (const row of text.split(/\r?\n/)) {
        const stamps = [...row.matchAll(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
        if (!stamps.length) continue;
        const body = row.replace(/\[[^\]]*\]/g, '');
        const words: LyricWord[] = [];
        const tagged = /<(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?>\s*([^<]*)/g;
        for (let match = tagged.exec(body); match; match = tagged.exec(body)) {
            const word = match[4].trim();
            if (word) words.push({ at: stampMs(match[1], match[2], match[3]), text: word });
        }
        const plain = body.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
        for (const stamp of stamps) {
            const line: LyricLine = { at: stampMs(stamp[1], stamp[2], stamp[3]), text: plain };
            if (words.length >= 2) line.words = words.map((word) => ({ ...word }));
            lines.push(line);
        }
    }
    return lines.sort((a, b) => a.at - b.at);
}

/** Таймкоды под другой темп: slowed и sped up растягивают песню целиком, строки сдвигаются в той же пропорции */
export function scaleLines(lines: LyricLine[], ratio: number): LyricLine[] {
    const at = (value: number): number => Math.round(value * ratio);
    return lines.map((line) => ({ ...line, at: at(line.at), ...(line.words ? { words: line.words.map((word) => ({ ...word, at: at(word.at) })) } : {}) }));
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
        // Длительность решает между версиями одной песни: чужая версия (радио, расширенная, ремастер) даёт отставание строк
        if (durationMs > 0 && seconds > 0) {
            const diff = Math.abs(seconds * 1000 - durationMs);
            score += diff < 1500 ? 3 : diff < 4000 ? 2 : diff < 10000 ? 0 : -1;
        }
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
/** Числовая ссылка &#NNN; или &#xHH;: кривая или вне Юникода остаётся как есть, а не роняет разбор (fromCodePoint бросает RangeError) */
function numericEntity(name: string, whole: string): string {
    const hex = /^#x([0-9a-f]{1,6})$/i.exec(name);
    const dec = hex ? null : /^#(\d{1,7})$/.exec(name);
    const code = hex ? parseInt(hex[1], 16) : dec ? Number(dec[1]) : NaN;
    return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
}
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
        .replace(/&(#?\w+);/g, (whole, name: string) => ENTITIES[name.toLowerCase()] ?? (name.startsWith('#') ? numericEntity(name, whole) : whole))
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

/** Разница длительностей, при которой таймкоды ещё совпадают с загрузкой на SoundCloud */
const SYNC_DRIFT_MS = 3500;
/** Таймкоды записи LRCLIB под эту загрузку. Темп переделки: пересчёт по отношению длительностей. Обычная загрузка
 *  с другой длительностью (вступление, другая версия) строки не получает: лучше простой текст, чем отставание */
export function syncedFor(item: LrclibItem, durationMs: number, retimed: boolean): LyricLine[] | null {
    const raw = textOf(item.syncedLyrics);
    if (!raw) return null;
    let lines = parseLrc(String(item.syncedLyrics));
    if (lines.length < 4) return null;
    const seconds = typeof item.duration === 'number' ? item.duration : 0;
    if (durationMs > 0 && seconds > 0) {
        const ratio = durationMs / (seconds * 1000);
        if (retimed) {
            if (ratio < 0.6 || ratio > 1.6 || Math.abs(ratio - 1) < 0.02) return null;
            lines = scaleLines(lines, ratio);
        } else if (Math.abs(durationMs - seconds * 1000) > SYNC_DRIFT_MS) return null;
    } else if (retimed) return null;
    return lines;
}

/** Поиск текста: LRCLIB точной записью по длительности, по полям, общим запросом, потом Genius. Ошибки сети дают null */
export async function findLyrics(
    deps: { getJson: GetJson; getText: GetText },
    input: { title: string; uploader: string; durationMs: number },
): Promise<Lyrics | null> {
    const { artist, track, retimed } = lyricsQuery(input.title, input.uploader);
    if (!track) return null;
    const safe = <T>(task: Promise<T>): Promise<T | null> => task.catch(() => null);
    const lrclib = 'https://lrclib.net/api/';
    const asks: string[] = [];
    // /get отдаёт запись той же длительности (±2 с): у неё таймкоды совпадают с этой загрузкой
    if (artist && !retimed && input.durationMs > 0) {
        asks.push(lrclib + 'get?' + new URLSearchParams({ track_name: track, artist_name: artist, duration: String(Math.round(input.durationMs / 1000)) }).toString());
    }
    asks.push(
        lrclib + 'search?' + new URLSearchParams({ track_name: track, ...(artist ? { artist_name: artist } : {}) }).toString(),
        lrclib + 'search?' + new URLSearchParams({ q: (artist + ' ' + track).trim() }).toString(),
    );
    // Первая подходящая запись с текстом запоминается; если у неё нет годных таймкодов, ищется запись, где они есть
    let first: { item: LrclibItem } | null = null;
    for (const url of asks) {
        const body = await safe(deps.getJson(url));
        const items = Array.isArray(body) ? body : body && typeof body === 'object' ? [body] : [];
        const item = pickLrclib(items, artist, track, input.durationMs);
        if (!item) continue;
        first ??= { item };
        const synced = syncedFor(item, input.durationMs, retimed);
        if (synced) return { source: 'lrclib', title: textOf(item.trackName), artist: textOf(item.artistName), plain: String(item.plainLyrics).trim(), synced };
    }
    if (first) {
        const item = first.item;
        return { source: 'lrclib', title: textOf(item.trackName), artist: textOf(item.artistName), plain: String(item.plainLyrics).trim(), synced: null };
    }
    const found = pickGenius(await safe(deps.getJson('https://genius.com/api/search/song?per_page=5&q=' + encodeURIComponent((artist + ' ' + track).trim()))), artist, track);
    if (!found) return null;
    const html = await safe(deps.getText(found.url));
    const plain = html ? geniusLyricsFromHtml(html) : null;
    return plain ? { source: 'genius', title: found.title, artist: found.artist, plain, synced: null } : null;
}
