// «Скачать трек» (меню правого клика): страница присылает ссылку на аудио, здесь проверка адреса, окно сохранения,
// загрузка с полосой на значке панели задач и уведомление об итоге. Файл создаётся только после выбора места
import * as path from 'path';
import type { TranslationKeys } from '../services/translationService';
import {
    DOWNLOAD_MAX_BYTES, downloadFileName, extensionFor, extensionFromResponse, isDownloadUrl, parseHlsSegments, validateDownloadRequest, type DownloadRequest,
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
    fetch(url: string): Promise<DownloadResponse>;
    saveDialog(options: { title: string; defaultPath: string; filters: Array<{ name: string; extensions: string[] }> }): Promise<{ canceled: boolean; filePath?: string }>;
    downloadsFolder(): string;
    mkdir(dir: string): Promise<void>;
    open(file: string): Promise<DownloadSink>;
    /** Полоса на значке панели задач: доля 0..1, null убирает */
    progress(value: number | null): void;
    notify(message: string): void;
    translate(key: TranslationKeys): string;
}
/** 'unreachable': пробная ссылка (soft) не открылась до окна сохранения, ничего не показано и не записано: страница пробует другой источник */
export type DownloadResult = { ok: true; file: string } | { ok: false; reason: 'invalid' | 'busy' | 'cancelled' | 'failed' | 'unreachable' };

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
/** Постоянные ответы сервера (нет файла, закрыто) не повторяются; сеть, 408, 429 и 5xx повторяются */
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

export function registerDownloadIpc(ipc: IpcRegistry, deps: DownloadIpcDeps): void {
    let busy = false;
    const get = (url: string): Promise<DownloadResponse> =>
        attempt(async () => {
            const response = await deps.fetch(url);
            if (!response.ok) throw new Error('HTTP ' + response.status);
            if (!isDownloadUrl(response.url)) throw new Error('Адрес после перехода не на SoundCloud');
            return response;
        });
    // Тело ответа в приёмник; потолок размера общий на весь файл
    async function pump(response: DownloadResponse, sink: DownloadSink, counted: { bytes: number }, report: () => void): Promise<void> {
        const reader = response.body?.getReader();
        if (!reader) throw new Error('Пустой ответ');
        for (;;) {
            const { done, value } = await reader.read();
            if (done) return;
            if (!value) continue;
            counted.bytes += value.byteLength;
            if (counted.bytes > DOWNLOAD_MAX_BYTES) {
                await reader.cancel().catch(() => undefined);
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
    async function run(request: DownloadRequest): Promise<DownloadResult> {
        let sink: DownloadSink | null = null;
        try {
            let first: DownloadResponse;
            try {
                first = await get(request.url);
            } catch (error) {
                if (!request.soft) throw error;
                console.warn('Скачивание: пробная ссылка не открылась', error);
                return { ok: false, reason: 'unreachable' };
            }
            let plan: ReturnType<typeof parseHlsSegments> = null;
            let ext = extensionFor(request.mime);
            if (request.kind === 'hls') {
                plan = parseHlsSegments(await first.text(), first.url);
                if (!plan || ![plan.init, ...plan.segments].every((url) => url === null || isDownloadUrl(url))) {
                    if (request.soft) return { ok: false, reason: 'unreachable' };
                    throw new Error('Поток не разобран, зашифрован или не на SoundCloud');
                }
            } else {
                ext = extensionFromResponse(first.headers.get('content-type'), first.headers.get('content-disposition'), first.url, request.mime);
                // Соединение не держится открытым, пока человек выбирает место: за это время сервер его рвал, и файл приходил оборванным
                await first.body?.getReader().cancel().catch(() => undefined);
            }
            const folder = path.join(deps.downloadsFolder(), 'SoundCloud');
            await deps.mkdir(folder);
            const chosen = await deps.saveDialog({
                title: deps.translate('downloadSaveTitle'),
                defaultPath: path.join(folder, downloadFileName(request.artist, request.title, ext)),
                filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
            });
            if (chosen.canceled || !chosen.filePath) return { ok: false, reason: 'cancelled' };
            const file = chosen.filePath;
            // Файл заново после выбора места: ссылка подписана и живёт минуты, а не часы
            const body = request.kind === 'hls' ? first : await get(request.url);
            sink = await deps.open(file);
            const counted = { bytes: 0 };
            if (plan) {
                const urls = plan.init ? [plan.init, ...plan.segments] : plan.segments;
                for (let i = 0; i < urls.length; i++) {
                    for (const chunk of await segment(urls[i])) {
                        counted.bytes += chunk.byteLength;
                        if (counted.bytes > DOWNLOAD_MAX_BYTES) throw new Error('Файл слишком большой');
                        await sink.write(chunk);
                    }
                    deps.progress((i + 1) / urls.length);
                }
            } else {
                const total = Number(body.headers.get('content-length')) || 0;
                await pump(body, sink, counted, () => deps.progress(total ? Math.min(0.99, counted.bytes / total) : 0.5));
                if (total && counted.bytes < total) throw new Error('Файл пришёл не целиком');
            }
            if (!counted.bytes) throw new Error('Пустой файл');
            await sink.close();
            sink = null;
            deps.notify(deps.translate('downloadDone').replace('{name}', path.basename(file)));
            return { ok: true, file };
        } catch (error) {
            console.warn('Скачивание трека не удалось', error);
            await sink?.discard().catch(() => undefined);
            deps.notify(deps.translate('downloadFailed'));
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
        try {
            return await run(request);
        } finally {
            busy = false;
        }
    });
}
