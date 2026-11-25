import { describe, expect, it, vi } from 'vitest';
import { FakeIpc, fakeEvent, trusting } from './fakeIpc.helper.test';
import { registerDownloadIpc, type DownloadIpcDeps, type DownloadResponse, type DownloadSink } from './downloadIpc';

const bodyOf = (...parts: string[]): DownloadResponse['body'] => {
    const queue = parts.map((part) => new TextEncoder().encode(part));
    return { getReader: () => ({ read: async () => (queue.length ? { done: false, value: queue.shift() } : { done: true }), cancel: async () => undefined }) };
};
const reply = (url: string, parts: string[], headers: Record<string, string> = {}): DownloadResponse => ({
    ok: true, status: 200, url, headers: { get: (name) => headers[name.toLowerCase()] ?? null }, body: bodyOf(...parts), text: async () => parts.join(''),
});

function setup(responses: Record<string, DownloadResponse>, chosen: { canceled: boolean; filePath?: string } = { canceled: false, filePath: 'C:/Music/A - B.mp3' }) {
    const ipc = new FakeIpc();
    const site = fakeEvent();
    const written: string[] = [];
    const sink: DownloadSink = { write: async (chunk) => void written.push(new TextDecoder().decode(chunk)), close: vi.fn(async () => undefined), discard: vi.fn(async () => undefined) };
    const deps = {
        trustedSite: trusting(site),
        fetch: vi.fn(async (url: string) => responses[url] ?? { ...reply(url, []), ok: false, status: 404 }),
        saveDialog: vi.fn(async (options: { defaultPath: string }) => (options ? chosen : chosen)),
        downloadsFolder: () => 'C:/Users/me/Downloads',
        mkdir: vi.fn(async () => undefined),
        open: vi.fn(async () => sink),
        progress: vi.fn(),
        notify: vi.fn(),
        translate: (key: string) => key,
    } satisfies DownloadIpcDeps;
    registerDownloadIpc(ipc, deps);
    return { ipc, site, deps, written, sink };
}
const FILE = 'https://cf-media.sndcdn.com/a.mp3';
const LIST = 'https://playback.media-streaming.soundcloud.cloud/p.m3u8';

describe('скачивание трека: канал', () => {
    it('чужой отправитель и чужой адрес не доходят до сети', async () => {
        const { ipc, site, deps } = setup({});
        expect(await ipc.invoke('soundcloud:download-track', fakeEvent(), { url: FILE, kind: 'file' })).toEqual({ ok: false, reason: 'invalid' });
        expect(await ipc.invoke('soundcloud:download-track', site, { url: 'https://evil.com/a.mp3', kind: 'file' })).toEqual({ ok: false, reason: 'invalid' });
        expect(await ipc.invoke('soundcloud:download-track', site, { url: 'http://cf-media.sndcdn.com/a.mp3', kind: 'file' })).toEqual({ ok: false, reason: 'invalid' });
        expect(deps.fetch).not.toHaveBeenCalled();
    });
    it('прямой файл: диалог в Downloads/SoundCloud с «Артист - Название.mp3», запись и уведомление', async () => {
        const { ipc, site, deps, written, sink } = setup({ [FILE]: reply(FILE, ['ab', 'cd'], { 'content-type': 'audio/mpeg', 'content-length': '4' }) });
        const result = await ipc.invoke('soundcloud:download-track', site, { url: FILE, kind: 'file', title: 'B?', artist: 'A' });
        expect(result).toEqual({ ok: true, file: 'C:/Music/A - B.mp3' });
        expect(deps.saveDialog.mock.calls[0][0].defaultPath.replace(/\\/g, '/')).toBe('C:/Users/me/Downloads/SoundCloud/A - B.mp3');
        expect(written.join('')).toBe('abcd');
        expect(sink.close).toHaveBeenCalled();
        expect(deps.notify).toHaveBeenCalledWith('downloadDone');
        expect(deps.progress).toHaveBeenLastCalledWith(null);
    });
    it('отмена в диалоге ничего не пишет', async () => {
        const { ipc, site, deps } = setup({ [FILE]: reply(FILE, ['ab']) }, { canceled: true });
        expect(await ipc.invoke('soundcloud:download-track', site, { url: FILE, kind: 'file' })).toEqual({ ok: false, reason: 'cancelled' });
        expect(deps.open).not.toHaveBeenCalled();
        expect(deps.notify).not.toHaveBeenCalled();
    });
    it('HLS: куски склеиваются по порядку', async () => {
        const one = 'https://playback.media-streaming.soundcloud.cloud/1.mp3';
        const two = 'https://playback.media-streaming.soundcloud.cloud/2.mp3';
        const { ipc, site, written } = setup({ [LIST]: reply(LIST, ['#EXTM3U\n1.mp3\n2.mp3\n']), [one]: reply(one, ['A']), [two]: reply(two, ['B']) });
        expect(await ipc.invoke('soundcloud:download-track', site, { url: LIST, kind: 'hls', mime: 'audio/mpeg' })).toMatchObject({ ok: true });
        expect(written.join('')).toBe('AB');
    });
    it('переход на чужой адрес и сбой куска дают ошибку, неполный файл удаляется', async () => {
        const moved = setup({ [FILE]: reply('https://evil.com/a.mp3', ['x']) });
        expect(await moved.ipc.invoke('soundcloud:download-track', moved.site, { url: FILE, kind: 'file' })).toEqual({ ok: false, reason: 'failed' });
        expect(moved.deps.open).not.toHaveBeenCalled();
        expect(moved.deps.notify).toHaveBeenCalledWith('downloadFailed');
        const broken = setup({ [LIST]: reply(LIST, ['#EXTM3U\nmissing.mp3\n']) });
        expect(await broken.ipc.invoke('soundcloud:download-track', broken.site, { url: LIST, kind: 'hls' })).toEqual({ ok: false, reason: 'failed' });
        expect(broken.sink.discard).toHaveBeenCalled();
    });
    it('пробная ссылка (soft) не открылась: без уведомления и окна, ответ unreachable', async () => {
        const { ipc, site, deps } = setup({});
        expect(await ipc.invoke('soundcloud:download-track', site, { url: FILE, kind: 'file', soft: true })).toEqual({ ok: false, reason: 'unreachable' });
        expect(deps.saveDialog).not.toHaveBeenCalled();
        expect(deps.notify).not.toHaveBeenCalled();
    });
    it('сбой сервера 503 повторяется, оборванный кусок HLS качается заново без дублей', async () => {
        vi.useFakeTimers();
        try {
            const one = 'https://playback.media-streaming.soundcloud.cloud/1.mp3';
            const { ipc, site, deps, written } = setup({ [LIST]: reply(LIST, ['#EXTM3U\n1.mp3\n']) });
            let calls = 0;
            const base = deps.fetch.getMockImplementation()!;
            deps.fetch.mockImplementation(async (url: string) => {
                if (url !== one) return base(url);
                calls++;
                if (calls === 1) return { ...reply(url, []), ok: false, status: 503 };
                if (calls === 2) {
                    const queue = [new TextEncoder().encode('X')];
                    return { ...reply(url, []), body: { getReader: () => ({ read: async () => (queue.length ? { done: false, value: queue.shift() } : Promise.reject(new Error('обрыв'))), cancel: async () => undefined }) } };
                }
                return reply(url, ['AB']);
            });
            const pending = ipc.invoke('soundcloud:download-track', site, { url: LIST, kind: 'hls', mime: 'audio/mpeg' });
            await vi.advanceTimersByTimeAsync(5000);
            expect(await pending).toMatchObject({ ok: true });
            expect(written.join('')).toBe('AB');
            expect(calls).toBe(3);
        } finally {
            vi.useRealTimers();
        }
    });
    it('файл не целиком (меньше Content-Length) считается сбоем', async () => {
        const { ipc, site, sink } = setup({ [FILE]: reply(FILE, ['ab'], { 'content-type': 'audio/mpeg', 'content-length': '9' }) });
        expect(await ipc.invoke('soundcloud:download-track', site, { url: FILE, kind: 'file' })).toEqual({ ok: false, reason: 'failed' });
        expect(sink.discard).toHaveBeenCalled();
    });
    it('канал один и повторная регистрация его не задваивает', () => {
        const { ipc, deps } = setup({});
        expect([...ipc.handlers.keys()]).toEqual(['soundcloud:download-track']);
        expect(() => registerDownloadIpc(ipc, deps)).not.toThrow();
    });
});
