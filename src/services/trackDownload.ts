// Скачивание трека («Скачать» в меню правого клика): чистые части для main. Страница сама получает ссылку на аудио
// (ключ клиента и вход есть только у неё) и присылает её сюда; main проверяет адрес, спрашивает место и пишет файл.

export type DownloadKind = 'file' | 'hls';
export interface DownloadRequest {
    url: string;
    kind: DownloadKind;
    /** MIME потока из списка transcodings; у официального файла пусто: расширение берётся из ответа сервера */
    mime: string;
    title: string;
    artist: string;
    /** Пробная ссылка (официальный файл): при сбое до окна сохранения main молчит и отвечает 'unreachable', страница пробует поток */
    soft: boolean;
}

/** Потолок размера файла: трек в WAV бывает сотни мегабайт, но не гигабайты */
export const DOWNLOAD_MAX_BYTES = 1024 * 1024 * 1024;
/** Потолок числа кусков HLS: час звука по 10 секунд это 360 */
export const DOWNLOAD_MAX_SEGMENTS = 5000;

/** https и только SoundCloud (soundcloud.com, потоки на soundcloud.cloud) или его CDN sndcdn.com: чужой адрес страница прислать не может */
export function isDownloadUrl(value: unknown): value is string {
    if (typeof value !== 'string' || value.length > 4096) return false;
    try {
        const url = new URL(value);
        if (url.protocol !== 'https:' || url.username || url.password) return false;
        const host = url.hostname.toLowerCase();
        return ['soundcloud.com', 'soundcloud.cloud', 'sndcdn.com'].some((domain) => host === domain || host.endsWith('.' + domain));
    } catch {
        return false;
    }
}

function cleanText(value: unknown, max: number): string {
    // eslint-disable-next-line no-control-regex
    return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

/** Запрос со страницы: неверный вид или чужой адрес дают null */
export function validateDownloadRequest(input: unknown): DownloadRequest | null {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
    const value = input as Record<string, unknown>;
    if (!isDownloadUrl(value.url)) return null;
    if (value.kind !== 'file' && value.kind !== 'hls') return null;
    return {
        url: value.url,
        kind: value.kind,
        mime: cleanText(value.mime, 120).toLowerCase(),
        title: cleanText(value.title, 200),
        artist: cleanText(value.artist, 200),
        soft: value.soft === true,
    };
}

const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
/** Часть имени файла для Windows: без запрещённых знаков, управляющих символов, точек и пробелов на конце, не длиннее max */
export function sanitizeFilePart(value: string, max = 100): string {
    // eslint-disable-next-line no-control-regex
    const clean = value.replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max).trim().replace(/[. ]+$/, '');
    return RESERVED.test(clean) ? '_' + clean : clean;
}

/** «Артист - Название.mp3»; без артиста только название, совсем без имён «track» */
export function downloadFileName(artist: string, title: string, ext: string): string {
    const a = sanitizeFilePart(artist);
    const t = sanitizeFilePart(title);
    const name = a && t ? a + ' - ' + t : t || a || 'track';
    return sanitizeFilePart(name, 180) + '.' + ext;
}

/** Расширение по MIME потока или ответа сервера; неизвестное считается mp3 */
export function extensionFor(mime: string): string {
    const type = mime.toLowerCase();
    if (/mpeg|mp3/.test(type)) return 'mp3';
    if (/flac/.test(type)) return 'flac';
    if (/wav|wave/.test(type)) return 'wav';
    if (/ogg|opus/.test(type)) return 'ogg';
    if (/mp4|aac|m4a/.test(type)) return 'm4a';
    return 'mp3';
}

const KNOWN_EXT = new Set(['mp3', 'flac', 'wav', 'aiff', 'aif', 'ogg', 'opus', 'm4a', 'aac', 'alac']);
/** Расширение официального файла: имя из Content-Disposition, потом MIME, потом имя в адресе (ответ application/octet-stream не значит mp3: автор мог залить wav) */
export function extensionFromResponse(contentType: string | null, disposition: string | null, url: string, fallbackMime = ''): string {
    const named = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition ?? '')?.[1];
    const fromName = (value: string | undefined): string | null => {
        const ext = /\.([a-z0-9]{2,5})$/i.exec((value ?? '').trim())?.[1]?.toLowerCase();
        return ext && KNOWN_EXT.has(ext) ? ext : null;
    };
    const decoded = (() => {
        try {
            return named ? decodeURIComponent(named) : named;
        } catch {
            return named;
        }
    })();
    const typed = (contentType ?? '').split(';')[0].trim().toLowerCase();
    const generic = !typed || /octet-stream|binary|x-download|force-download/.test(typed);
    if (!generic) return extensionFor(contentType ?? '');
    let path = '';
    try {
        path = new URL(url).pathname;
    } catch {
        // адрес разобран выше; здесь запасной путь
    }
    return fromName(decoded) ?? fromName(path) ?? extensionFor(fallbackMime);
}

export interface HlsPlan { init: string | null; segments: string[] }
/** Плейлист HLS: куски по порядку и кусок описания fMP4. Шифрованный (кроме METHOD=NONE) или пустой плейлист дают null */
export function parseHlsSegments(text: string, base: string): HlsPlan | null {
    const absolute = (value: string): string | null => {
        try {
            return new URL(value, base).href;
        } catch {
            return null;
        }
    };
    let init: string | null = null;
    const segments: string[] = [];
    for (const raw of text.split('\n')) {
        const line = raw.trim();
        if (line.startsWith('#EXT-X-KEY:')) {
            if (!/METHOD=NONE/i.test(line)) return null;
        } else if (line.startsWith('#EXT-X-MAP:')) {
            const uri = /URI="([^"]+)"/.exec(line)?.[1];
            init = uri ? absolute(uri) : null;
        } else if (line && !line.startsWith('#')) {
            const url = absolute(line);
            if (!url) return null;
            segments.push(url);
        }
    }
    return segments.length && segments.length <= DOWNLOAD_MAX_SEGMENTS ? { init, segments } : null;
}
