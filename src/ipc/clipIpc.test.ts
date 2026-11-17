import { describe, expect, it, vi } from 'vitest';
import { FakeIpc, fakeEvent, trusting } from './fakeIpc.helper.test';
import { ClipGrant, clipFileName, registerClipIpc, type ClipIpcDeps } from './clipIpc';

function setup() {
    const now = { value: 1000 };
    const ipc = new FakeIpc();
    const site = fakeEvent();
    const stranger = fakeEvent();
    const grant = new ClipGrant(() => now.value);
    const deps = {
        trustedSite: trusting(site),
        grant,
        videosDir: () => 'C:/Videos',
        mkdir: vi.fn<(dir: string) => Promise<void>>(async () => undefined),
        write: vi.fn<(file: string, data: Uint8Array) => Promise<void>>(async () => undefined),
        reveal: vi.fn<(file: string) => void>(),
        recording: vi.fn<(on: boolean) => void>(),
        failed: vi.fn<(reason: string) => void>(),
        now: () => new Date(2026, 10, 16, 9, 5, 7).getTime(),
    } satisfies ClipIpcDeps;
    registerClipIpc(ipc, deps);
    return { ipc, site, stranger, grant, deps, now };
}

describe('запись ролика: каналы', () => {
    it('оба канала зарегистрированы и повторная регистрация их не задваивает', () => {
        const { ipc, deps } = setup();
        expect([...ipc.handlers.keys()].sort()).toEqual(['clip:record-arm', 'clip:save']);
        registerClipIpc(ipc, deps);
    });
    it('разрешение на захват одноразовое и живёт 10 секунд', async () => {
        const { ipc, site, grant, now } = setup();
        expect(grant.take()).toBe(false);
        await ipc.invoke('clip:record-arm', site, 'arm');
        expect(grant.take()).toBe(true);
        expect(grant.take()).toBe(false);
        await ipc.invoke('clip:record-arm', site, 'arm');
        now.value += 10001;
        expect(grant.take()).toBe(false);
    });
    it('чужой отправитель разрешения не получает и файл не пишет', async () => {
        const { ipc, stranger, grant, deps } = setup();
        expect(await ipc.invoke('clip:record-arm', stranger, 'arm')).toBe(false);
        expect(grant.take()).toBe(false);
        expect(await ipc.invoke('clip:save', stranger, new ArrayBuffer(4), 'a', 'mp4')).toBeNull();
        expect(deps.write).not.toHaveBeenCalled();
    });
    it('«live» и «off» зажигают и гасят метку записи, «off» снимает неиспользованное разрешение', async () => {
        const { ipc, site, grant, deps } = setup();
        await ipc.invoke('clip:record-arm', site, 'live');
        expect(deps.recording).toHaveBeenLastCalledWith(true);
        await ipc.invoke('clip:record-arm', site, 'arm');
        await ipc.invoke('clip:record-arm', site, 'off');
        expect(deps.recording).toHaveBeenLastCalledWith(false);
        expect(grant.take()).toBe(false);
    });
    it('файл ложится в «Видео/SoundCloud Clips» с временем в имени и показывается в папке', async () => {
        const { ipc, site, deps } = setup();
        const file = await ipc.invoke('clip:save', site, new Uint8Array([1, 2, 3]).buffer, 'Артист: Песня?', 'mp4');
        expect(String(file).replace(/\\/g, '/')).toBe('C:/Videos/SoundCloud Clips/Артист Песня - 2026-11-16 09-05-07.mp4');
        expect(deps.mkdir).toHaveBeenCalled();
        expect(deps.write).toHaveBeenCalledWith(file, expect.any(Uint8Array));
        expect(deps.reveal).toHaveBeenCalledWith(file);
    });
    it('пустой и неверный ввод отвергается, незнакомое расширение становится mp4, webm остаётся', async () => {
        const { ipc, site, deps } = setup();
        expect(await ipc.invoke('clip:save', site, new ArrayBuffer(0), 'a', 'mp4')).toBeNull();
        expect(await ipc.invoke('clip:save', site, 'строка', 'a', 'mp4')).toBeNull();
        expect(String(await ipc.invoke('clip:save', site, new Uint8Array(2), 'a', 'exe'))).toMatch(/\.mp4$/);
        expect(String(await ipc.invoke('clip:save', site, new Uint8Array(2), 'a', 'webm'))).toMatch(/\.webm$/);
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        deps.write.mockRejectedValueOnce(new Error('диск'));
        expect(await ipc.invoke('clip:save', site, new Uint8Array(2), 'a', 'mp4')).toBeNull();
    });
    it('имя файла без запрещённых знаков и не длиннее 80', () => {
        expect(clipFileName('a/b\\c:d*e?f"g<h>i|j')).toBe('a b c d e f g h i j');
        expect(clipFileName('...')).toBe('clip');
        expect(clipFileName(5)).toBe('clip');
        expect(clipFileName('я'.repeat(200)).length).toBe(80);
    });
});

describe('запись ролика: причина отказа', () => {
    it('код причины доходит до журнала, неизвестный превращается в unknown, чужой отправитель игнорируется', async () => {
        const { ipc, site, stranger, deps } = setup();
        expect(await ipc.invoke('clip:record-arm', site, 'fail', 'denied')).toBe(true);
        expect(await ipc.invoke('clip:record-arm', site, 'fail', 'любой <текст>')).toBe(true);
        expect(await ipc.invoke('clip:record-arm', stranger, 'fail', 'denied')).toBe(false);
        expect(deps.failed.mock.calls).toEqual([['denied'], ['unknown']]);
    });
});
