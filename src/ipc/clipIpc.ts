// Запись ролика из режима «Для роликов» (2.11.0): разрешение на захват кадра страницы и сохранение готового файла.
// Страница сайта сама захват не получает: main отвечает на getDisplayMedia только в течение 10 с после того, как
// скрипт клиента позвал clip:record-arm, и ровно один раз. Файл ложится в «Видео\SoundCloud Clips».
import * as path from 'path';
import type { IpcRegistry, SenderCheck } from './ipcTypes';

/** Сколько после clip:record-arm главная рамка сайта может получить захват */
export const CLIP_GRANT_MS = 10000;
/** Потолок размера файла из страницы: ролики короче, а память не бесконечна */
export const CLIP_MAX_BYTES = 1024 * 1024 * 1024;

/** Одноразовое разрешение на захват: взвели, взяли, всё */
export class ClipGrant {
    private until = 0;
    constructor(private readonly now: () => number = () => Date.now()) {}
    arm(): void {
        this.until = this.now() + CLIP_GRANT_MS;
    }
    disarm(): void {
        this.until = 0;
    }
    /** true один раз за взвод и только пока не вышел срок */
    take(): boolean {
        const ok = this.until > this.now();
        this.until = 0;
        return ok;
    }
}

/** Имя файла без запрещённых в Windows знаков, не длиннее 80 */
export function clipFileName(name: unknown): string {
    const text = typeof name === 'string' ? name : '';
    // eslint-disable-next-line no-control-regex
    const clean = text.replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80).trim().replace(/[. ]+$/, '');
    return clean || 'clip';
}
function stamp(ms: number): string {
    const d = new Date(ms);
    const two = (n: number): string => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate()) + ' ' + two(d.getHours()) + '-' + two(d.getMinutes()) + '-' + two(d.getSeconds());
}

export interface ClipIpcDeps {
    trustedSite: SenderCheck;
    grant: ClipGrant;
    /** Папка «Видео» пользователя */
    videosDir(): string;
    mkdir(dir: string): Promise<void>;
    write(file: string, data: Uint8Array): Promise<void>;
    reveal(file: string): void;
    /** Красная полоса на значке панели задач, пока идёт запись: в кадре ролика никаких меток нет */
    recording(on: boolean): void;
    now(): number;
}

export function registerClipIpc(ipc: IpcRegistry, deps: ClipIpcDeps): void {
    ipc.removeHandler('clip:record-arm');
    ipc.removeHandler('clip:save');
    // 'arm' — через миг будет getDisplayMedia, 'live' — запись пошла, 'off' — закончилась или не вышла
    ipc.handle('clip:record-arm', (event, state: unknown) => {
        if (!deps.trustedSite(event)) return false;
        if (state === 'arm') {
            deps.grant.arm();
            return true;
        }
        if (state === 'live') {
            deps.recording(true);
            return true;
        }
        deps.grant.disarm();
        deps.recording(false);
        return state === 'off';
    });
    ipc.handle('clip:save', async (event, data: unknown, name: unknown, ext: unknown) => {
        if (!deps.trustedSite(event)) return null;
        const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : null;
        if (!bytes || !bytes.byteLength || bytes.byteLength > CLIP_MAX_BYTES) return null;
        const extension = ext === 'webm' ? 'webm' : 'mp4';
        try {
            const dir = path.join(deps.videosDir(), 'SoundCloud Clips');
            await deps.mkdir(dir);
            const file = path.join(dir, clipFileName(name) + ' - ' + stamp(deps.now()) + '.' + extension);
            await deps.write(file, bytes);
            deps.reveal(file);
            return file;
        } catch (error) {
            console.warn('Ролик не сохранён', error);
            return null;
        }
    });
}
