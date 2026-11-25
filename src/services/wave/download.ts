// «Скачать» в меню правого клика: страница находит ссылку на аудио (ключ клиента и вход есть только у неё) и отдаёт её main,
// а тот спрашивает место, качает и пишет файл. Раздел страницы волны: installDownload и pickTranscoding уходят на страницу
// текстом вместе с волной (pageHelpers в wave.ts) и зовутся по голому имени, поэтому всё нужное внутри функций.
import type { WaveTrack } from '../waveTypes';

export interface Transcoding { url: string; protocol: 'progressive' | 'hls'; mime: string }
/** Запрос в main: ссылка уже проверена страницей, main проверяет её ещё раз */
export interface DownloadPayload { url: string; kind: 'file' | 'hls'; mime: string; title: string; artist: string; soft?: boolean }
export interface DownloadCore {
    lang: 'ru' | 'en';
    disposed(): boolean;
    /** GET api-v2 с правилами сайта (ключ клиента и вход подставляет сайт); null при сбое */
    get(url: string): Promise<unknown>;
    /** Отправка в main; null, если клиент без скачивания */
    send: ((payload: DownloadPayload) => Promise<unknown>) | null;
    showToast(text: string): void;
}
export interface DownloadSection {
    /** Подпись пункта меню или null, если скачивать нечем */
    label(): string | null;
    run(track: WaveTrack): Promise<void>;
}

/** Поток для скачивания из media.transcodings: открытый mp3 по прямой ссылке, потом HLS (mp3, затем любой). Отрывки (snipped)
 *  и зашифрованные потоки не берутся. url без track_authorization: его добавляет вызывающий */
export function pickTranscoding(track: WaveTrack): Transcoding | null {
    const media = (track as { media?: { transcodings?: unknown } }).media;
    const list = Array.isArray(media?.transcodings) ? (media.transcodings as unknown[]) : [];
    const found: Transcoding[] = [];
    for (const raw of list) {
        const item = raw as { url?: unknown; snipped?: unknown; format?: { protocol?: unknown; mime_type?: unknown } } | null;
        const url = item?.url;
        const protocol = item?.format?.protocol;
        if (item?.snipped === true || typeof url !== 'string' || !/^https:\/\/api-v2\.soundcloud\.com\/media\//.test(url)) continue;
        if (protocol !== 'progressive' && protocol !== 'hls') continue;
        found.push({ url, protocol, mime: typeof item?.format?.mime_type === 'string' ? item.format.mime_type : '' });
    }
    const mp3 = (item: Transcoding): boolean => /mpeg|mp3/i.test(item.mime);
    return (
        found.find((item) => item.protocol === 'progressive' && mp3(item)) ??
        found.find((item) => item.protocol === 'hls' && mp3(item)) ??
        found.find((item) => item.protocol === 'hls') ??
        found.find((item) => item.protocol === 'progressive') ??
        null
    );
}

export function installDownload(core: DownloadCore): DownloadSection {
    const ru = core.lang === 'ru';
    const API = 'https://api-v2.soundcloud.com';
    const text = {
        label: ru ? 'Скачать' : 'Download',
        failed: ru ? 'Не удалось получить файл трека' : 'Couldn’t get the track file',
        protectedTrack: ru ? 'Этот трек правообладатель закрыл защитой: SoundCloud даёт его только слушать, не скачивать' : 'This track is protected by the rights holder: SoundCloud allows streaming only, not downloads',
    };
    /** У трека есть только зашифрованный поток (Widevine): скачать нечего, это не сбой */
    const onlyProtected = (track: object): boolean => {
        const list = (track as { media?: { transcodings?: unknown } }).media?.transcodings;
        if (!Array.isArray(list) || !list.length) return false;
        return list.every((raw) => /encrypted/i.test(str((raw as { format?: { protocol?: unknown } } | null)?.format?.protocol)));
    };
    let lastProtected = false;
    const str = (value: unknown): string => (typeof value === 'string' ? value : '');
    // Трек из списков сайта часто без media и track_authorization: берём полный
    async function fullTrack(track: WaveTrack): Promise<{ media?: unknown; track_authorization?: unknown; downloadable?: unknown; has_downloads_left?: unknown } & WaveTrack> {
        const known = track as WaveTrack & { media?: unknown; track_authorization?: unknown };
        if (known.media && known.track_authorization) return known;
        const body = await core.get(API + '/tracks/' + track.id);
        return body && typeof body === 'object' ? { ...track, ...(body as object) } : known;
    }
    // Одна попытка не всегда доходит: ответ api-v2 иногда пустой или не успевает за 10 секунд
    async function getTwice(url: string): Promise<unknown> {
        const first = await core.get(url).catch(() => null);
        if (first || core.disposed()) return first;
        return core.get(url).catch(() => null);
    }
    /** Источники по порядку: официальный файл автора (если включён), потом поток. Официальный помечен soft: если он не открылся, берётся поток */
    async function payloadsOf(track: WaveTrack): Promise<DownloadPayload[]> {
        const full = await fullTrack(track);
        const title = str(full.title) || str(track.title);
        const meta = full.publisher_metadata?.artist;
        const artist = str(full.user?.username) || str(meta) || str(track.user?.username);
        const found: DownloadPayload[] = [];
        // Официальное скачивание, если автор его включил и попытки остались
        if (full.downloadable === true && full.has_downloads_left !== false) {
            const body = (await getTwice(API + '/tracks/' + track.id + '/download')) as { redirectUri?: unknown } | null;
            if (typeof body?.redirectUri === 'string' && /^https:\/\//.test(body.redirectUri)) found.push({ url: body.redirectUri, kind: 'file', mime: '', title, artist });
        }
        const item = pickTranscoding(full);
        const auth = str(full.track_authorization);
        lastProtected = !item && onlyProtected(full);
        if (item) {
            const link = item.url + (item.url.includes('?') ? '&' : '?') + (auth ? 'track_authorization=' + encodeURIComponent(auth) : '');
            const body = (await getTwice(link)) as { url?: unknown } | null;
            if (typeof body?.url === 'string' && /^https:\/\//.test(body.url)) found.push({ url: body.url, kind: item.protocol === 'hls' ? 'hls' : 'file', mime: item.mime, title, artist });
        }
        // Запасной источник есть: основной можно не мучить, при сбое main молча отдаёт управление дальше
        return found.map((payload, index) => (index < found.length - 1 ? { ...payload, soft: true } : payload));
    }
    return {
        label: () => (core.send ? text.label : null),
        run: async (track) => {
            if (!core.send || core.disposed()) return;
            let payloads: DownloadPayload[] = [];
            lastProtected = false;
            try {
                payloads = await payloadsOf(track);
            } catch (error) {
                console.warn('Скачивание: ссылка на файл не получена', error);
            }
            if (core.disposed()) return;
            if (!payloads.length) {
                core.showToast(lastProtected ? text.protectedTrack : text.failed);
                return;
            }
            // Итог (место, ход, готово или ошибка) показывает main; 'unreachable' значит, что источник не открылся и пока ничего не показано
            for (const payload of payloads) {
                const result = (await core.send(payload).catch((error: unknown) => {
                    console.warn('Скачивание: main не принял запрос', error);
                    return null;
                })) as { reason?: unknown } | null;
                if (result?.reason !== 'unreachable') return;
            }
            core.showToast(text.failed);
        },
    };
}
