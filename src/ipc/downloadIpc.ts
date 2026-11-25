// «Скачать трек» (меню правого клика): страница присылает ссылку на аудио, здесь проверка адреса, окно сохранения,
// загрузка с полосой на значке панели задач и уведомление об итоге. Файл создаётся только после выбора места.
// Каждый адрес (и после переходов, и каждый кусок HLS) обязан быть на SoundCloud/sndcdn: чужой хост не качается.
// Зашифрованные потоки (EXT-X-KEY не NONE) не расшифровываются и не качаются
import * as path from 'path';
import type { TranslationKeys } from '../services/translationService';
import {
    DOWNLOAD_MAX_BYTES, downloadFileName, extensionFor, extensionFromResponse, id3Tag, isDownloadUrl, parseHlsSegments, pickHlsVariant, uniqueFilePath,
    validateDownloadRequest, type DownloadRequest,
} from '../services/trackDownload';
import type { IpcRegistry, SenderCheck } from './ipcTypes';

export interface DownloadResponse {
    ok: boolean;
    status: number;
    /** Адрес после переходов: он тоже должен быть на SoundCloud */
    url: string;
    headers: { get(name: string): string | null };
    body: { getReader(): { read(): Promise<{ done: boolean; value?: Uint8Array }>; cancel(): Promise<void> } } | null;
    text(): Promise<string>;
}
export interface DownloadSink {
    write(chunk: Uint8Array): Promise<void>;
    close(): Promise<void>;
    /** Закрыть и убрать неполный файл */
    discard(): Promise<void>;
}
export interface DownloadIpcDeps {
    trustedSite: SenderCheck;
    /** signal обрывает зависший запрос (тайм-аут); его можно не поддерживать: тайм-аут всё равно сработает */
    fetch(url: string, signal?: AbortSignal): Promise<DownloadResponse>;
    saveDialog(options: { title: string; defaultPath: string; filters: Array<{ name: string; extensions: string[] }> }): Promise<{ canceled: boolean; filePath?: string }>;
    downloadsFolder(): string;
    mkdir(dir: string): Promise<void>;
    /** Есть ли уже такой файл: предлагается «Имя (2).mp3», а не перезапись. Без него предлагается обычное имя */
    exists?(file: string): Promise<boolean>;
    open(file: string): Promise<DownloadSink>;
    /** Полоса на значке панели задач: доля 0..1, null убирает */
    progress(value: number | null): void;
    /** Системная плашка клиента: только «уже качается другой трек»; ход и итог показывает карточка на странице */
    notify(message: string): void;
    /** «Показать в папке» из карточки скачивания: проводник с выделенным файлом */
    reveal?(file: string): void;
    translate(key: TranslationKeys): string;
}
/** 'unreachable': пробная ссылка (soft) не открылась до окна сохранения, ничего не показано и не записано: страница пробует другой источник */
export type DownloadResult = { ok: true; file: string } | { ok: false; reason: 'invalid' | 'busy' | 'cancelled' | 'failed' | 'unreachable' };
/** Ход скачивания для карточки на странице (канал DOWNLOAD_PROGRESS_CHANNEL): место выбрано (имя файла), доля 0..1 */
export type DownloadProgress = { phase: 'saving'; name: string } | { phase: 'progress'; value: number };
export const DOWNLOAD_PROGRESS_CHANNEL = 'soundcloud:download-progress';

/** Ответ сервера (заголовки) должен прийти за это время */
export const DOWNLOAD_CONNECT_TIMEOUT_MS = 20000;
/** Без единого байта дольше этого загрузка считается зависшей */
export const DOWNLOAD_IDLE_TIMEOUT_MS = 30000;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
/** Постоянные ответы сервера (нет файла, закрыто) не повторяются; сеть, тайм-аут, 408, 429 и 5xx повторяются */
const retryable = (error: unknown): boolean => {
    const status = /^HTTP (\d+)$/.exec(error instanceof Error ? error.message : '')?.[1];
    return !status || Number(status) >= 500 || status === '408' || status === '429';
};
async function attempt<T>(job: () => Promise<T>, tries = 3): Promise<T> {
    for (let n = 1; ; n++) {
        try {
            return await job();
        } catch (error) {
            if (n >= tries || !retryable(error)) throw error;
            await sleep(500 * n);
        }
    }
}
/** Обещание с потолком времени: по истечении onTimeout (оборвать запрос) и ошибка */
function within<T>(job: Promise<T>, ms: number, onTimeout: () => void): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const limit = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
            onTimeout();
            reject(new Error('Тайм-аут сети'));
        }, ms);
    });
    return Promise.race([job, limit]).finally(() => clearTimeout(timer));
}

export function registerDownloadIpc(ipc: IpcRegistry, deps: DownloadIpcDeps): void {
    let busy = false;
    const get = (url: string): Promise<DownloadResponse> =>
        attempt(async () => {
            if (!isDownloadUrl(url)) throw new Error('HTTP 403');
            const controller = new AbortController();
            const response = await within(deps.fetch(url, controller.signal), DOWNLOAD_CONNECT_TIMEOUT_MS, () => controller.abort());
            if (!response.ok) throw new Error('HTTP ' + response.status);
            if (!isDownloadUrl(response.url)) throw new Error('Адрес после перехода не на SoundCloud');
            return response;
        });
    const textOf = (response: DownloadResponse): Promise<string> => within(response.text(), DOWNLOAD_IDLE_TIMEOUT_MS, () => undefined);
    // Тело ответа в приёмник; потолок размера общий на весь файл, зависание дольше DOWNLOAD_IDLE_TIMEOUT_MS обрывает загрузку
    async function pump(response: DownloadResponse, sink: DownloadSink, counted: { bytes: number }, report: () => void): Promise<void> {
        const reader = response.body?.getReader();
        if (!reader) throw new Error('Пустой ответ');
        const cancel = (): void => void reader.cancel().catch(() => undefined);
        for (;;) {
            const { done, value } = await within(reader.read(), DOWNLOAD_IDLE_TIMEOUT_MS, cancel);
            if (done) return;
            if (!value) continue;
            counted.bytes += value.byteLength;
            if (counted.bytes > DOWNLOAD_MAX_BYTES) {
                cancel();
                throw new Error('Файл слишком большой');
            }
            await sink.write(value);
            report();
        }
    }
    // Кусок HLS целиком в память (это секунды звука) и только потом в файл: оборвавшийся кусок скачивается заново, а не дописывается дублем
    async function segment(url: string): Promise<Uint8Array[]> {
        return attempt(async () => {
            const parts: Uint8Array[] = [];
            const local = { bytes: 0 };
            await pump(await get(url), { write: async (chunk) => void parts.push(chunk), close: async () => undefined, discard: async () => undefined }, local, () => undefined);
            return parts;
        });
    }
    /** Плейлист HLS по ссылке: мастер-плейлист (ABR) раскрывается в лучший вариант. null: зашифрован, пуст или куски не на SoundCloud */
    async function hlsPlan(first: DownloadResponse): Promise<ReturnType<typeof parseHlsSegments>> {
        let text = await textOf(first);
        let base = first.url;
        const variant = pickHlsVariant(text, base);
        if (variant) {
            const inner = await get(variant);
            text = await textOf(inner);
            base = inner.url;
        }
        const plan = parseHlsSegments(text, base);
        return plan && [plan.init, ...plan.segments].every((url) => url === null || isDownloadUrl(url)) ? plan : null;
    }
    /** Расширение HLS: кусок описания (EXT-X-MAP) или .m4s/.mp4 значит fMP4 (AAC) → m4a; .mp3 → mp3; иначе по MIME */
    function hlsExtension(plan: NonNullable<ReturnType<typeof parseHlsSegments>>, mime: string): string {
        const pathOf = (url: string): string => {
            try {
                return new URL(url).pathname.toLowerCase();
            } catch {
                return '';
            }
        };
        const first = pathOf(plan.segments[0]);
        if (plan.init || /\.(m4s|mp4|m4a)$/.test(first) || /mp4|aac|m4a/.test(mime)) return 'm4a';
        if (/\.mp3$/.test(first)) return 'mp3';
        return extensionFor(mime);
    }
    /** Файлы, записанные в этом запуске: «Показать в папке» открывает только их, а не любой путь со страницы */
    const saved = new Set<string>();
    async function run(request: DownloadRequest, report: (update: DownloadProgress) => void): Promise<DownloadResult> {
        let sink: DownloadSink | null = null;
        // Полоса на значке и в карточке; в карточку только при сдвиге на процент, а не на каждый кусок
        let shown = -1;
        const progress = (value: number): void => {
            deps.progress(value);
            const percent = Math.floor(value * 100);
            if (percent === shown) return;
            shown = percent;
            report({ phase: 'progress', value });
        };
        try {
            let first: DownloadResponse;
            let plan: ReturnType<typeof parseHlsSegments> = null;
            let ext = extensionFor(request.mime);
            try {
                first = await get(request.url);
                if (request.kind === 'hls') {
                    plan = await hlsPlan(first);
                    if (!plan) throw new Error('Поток не разобран, зашифрован или не на SoundCloud');
                    ext = hlsExtension(plan, request.mime);
                }
            } catch (error) {
                if (!request.soft) throw error;
                console.warn('Скачивание: пробная ссылка не открылась', error);
                return { ok: false, reason: 'unreachable' };
            }
            if (request.kind !== 'hls') {
                ext = extensionFromResponse(first.headers.get('content-type'), first.headers.get('content-disposition'), first.url, request.mime);
                // Соединение не держится открытым, пока человек выбирает место: за это время сервер его рвал, и файл приходил оборванным
                await first.body?.getReader().cancel().catch(() => undefined);
            }
            const folder = path.join(deps.downloadsFolder(), 'SoundCloud');
            await deps.mkdir(folder);
            const name = downloadFileName(request.artist, request.title, ext);
            const exists = deps.exists;
            const defaultPath = exists ? await uniqueFilePath(folder, name, (file) => exists(file).catch(() => false), path.join) : path.join(folder, name);
            const chosen = await deps.saveDialog({
                title: deps.translate('downloadSaveTitle'),
                defaultPath,
                filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
            });
            if (chosen.canceled || !chosen.filePath) return { ok: false, reason: 'cancelled' };
            const file = chosen.filePath;
            report({ phase: 'saving', name: path.basename(file) });
            progress(0);
            // Файл заново после выбора места: ссылка подписана и живёт минуты, а не часы
            const body = request.kind === 'hls' ? first : await get(request.url);
            sink = await deps.open(file);
            const counted = { bytes: 0 };
            if (plan) {
                // Поток mp3 без своих меток: название и артист в ID3 (дёшево, без зависимостей). fMP4 и исходники не трогаются
                if (ext === 'mp3' && !plan.init) {
                    const tag = id3Tag(request.title, request.artist);
                    if (tag.byteLength) await sink.write(tag);
                }
                // fMP4 (AAC): кусок описания, потом куски по порядку; MPEG/mp3: куски подряд
                const urls = plan.init ? [plan.init, ...plan.segments] : plan.segments;
                for (let i = 0; i < urls.length; i++) {
                    for (const chunk of await segment(urls[i])) {
                        counted.bytes += chunk.byteLength;
                        if (counted.bytes > DOWNLOAD_MAX_BYTES) throw new Error('Файл слишком большой');
                        await sink.write(chunk);
                    }
                    progress((i + 1) / urls.length);
                }
            } else {
                const total = Number(body.headers.get('content-length')) || 0;
                await pump(body, sink, counted, () => progress(total ? Math.min(0.99, counted.bytes / total) : 0.5));
                if (total && counted.bytes < total) throw new Error('Файл пришёл не целиком');
            }
            if (!counted.bytes) throw new Error('Пустой файл');
            await sink.close();
            sink = null;
            saved.add(file);
            return { ok: true, file };
        } catch (error) {
            console.warn('Скачивание трека не удалось', error);
            await sink?.discard().catch(() => undefined);
            return { ok: false, reason: 'failed' };
        } finally {
            deps.progress(null);
        }
    }
    ipc.removeHandler('soundcloud:download-track');
    ipc.handle('soundcloud:download-track', async (event, input: unknown): Promise<DownloadResult> => {
        if (!deps.trustedSite(event)) return { ok: false, reason: 'invalid' };
        const request = validateDownloadRequest(input);
        if (!request) return { ok: false, reason: 'invalid' };
        if (busy) {
            deps.notify(deps.translate('downloadBusy'));
            return { ok: false, reason: 'busy' };
        }
        busy = true;
        // Ход идёт туда, откуда пришёл запрос; страница могла уйти, тогда просто молча
        const report = (update: DownloadProgress): void => {
            try {
                const sender = event.sender as { isDestroyed?(): boolean; send?(channel: string, value: unknown): void } | null;
                if (sender?.send && !sender.isDestroyed?.()) sender.send(DOWNLOAD_PROGRESS_CHANNEL, update);
            } catch (error) {
                console.debug('Скачивание: ход не отправлен', error);
            }
        };
        try {
            return await run(request, report);
        } finally {
            busy = false;
        }
    });
    ipc.removeHandler('soundcloud:download-reveal');
    ipc.handle('soundcloud:download-reveal', (event, input: unknown): boolean => {
        if (!deps.trustedSite(event) || typeof input !== 'string' || !saved.has(input) || !deps.reveal) return false;
        deps.reveal(input);
        return true;
    });
}
