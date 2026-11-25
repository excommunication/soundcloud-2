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
    const sent: Array<[string, unknown]> = [];
    Object.assign(site.sender, { send: (channel: string, value: unknown) => void sent.push([channel, value]) });
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
        reveal: vi.fn(),
        translate: (key: string) => key,
    } satisfies DownloadIpcDeps;
    registerDownloadIpc(ipc, deps);
    return { ipc, site, deps, written, sink, sent };
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
        const { ipc, site, deps, written, sink, sent } = setup({ [FILE]: reply(FILE, ['ab', 'cd'], { 'content-type': 'audio/mpeg', 'content-length': '4' }) });
        const result = await ipc.invoke('soundcloud:download-track', site, { url: FILE, kind: 'file', title: 'B?', artist: 'A' });
        expect(result).toEqual({ ok: true, file: 'C:/Music/A - B.mp3' });
        expect(deps.saveDialog.mock.calls[0][0].defaultPath.replace(/\\/g, '/')).toBe('C:/Users/me/Downloads/SoundCloud/A - B.mp3');
        expect(written.join('')).toBe('abcd');
        expect(sink.close).toHaveBeenCalled();
        // Ход и итог показывает карточка на странице: место выбрано, доля; системная плашка молчит
        expect(deps.notify).not.toHaveBeenCalled();
        expect(sent[0]).toEqual(['soundcloud:download-progress', { phase: 'saving', name: 'A - B.mp3' }]);
        expect(sent.slice(1).every(([channel, value]) => channel === 'soundcloud:download-progress' && (value as { phase: string }).phase === 'progress')).toBe(true);
        expect(sent.length).toBeGreaterThan(1);
        expect(deps.progress).toHaveBeenLastCalledWith(null);
    });
    it('«Показать в папке» открывает только скачанный в этом запуске файл и только своей странице', async () => {
        const { ipc, site, deps } = setup({ [FILE]: reply(FILE, ['ab'], { 'content-type': 'audio/mpeg', 'content-length': '2' }) });
        expect(await ipc.invoke('soundcloud:download-reveal', site, 'C:/Music/A - B.mp3')).toBe(false);
        await ipc.invoke('soundcloud:download-track', site, { url: FILE, kind: 'file', title: 'B', artist: 'A' });
        expect(await ipc.invoke('soundcloud:download-reveal', fakeEvent(), 'C:/Music/A - B.mp3')).toBe(false);
        expect(await ipc.invoke('soundcloud:download-reveal', site, 'C:/Windows/System32')).toBe(false);
        expect(await ipc.invoke('soundcloud:download-reveal', site, { file: 'C:/Music/A - B.mp3' })).toBe(false);
        expect(deps.reveal).not.toHaveBeenCalled();
        expect(await ipc.invoke('soundcloud:download-reveal', site, 'C:/Music/A - B.mp3')).toBe(true);
        expect(deps.reveal).toHaveBeenCalledWith('C:/Music/A - B.mp3');
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
        expect(moved.deps.notify).not.toHaveBeenCalled();
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
    it('HLS AAC (fMP4): кусок описания и куски по порядку в один .m4a', async () => {
        const base = 'https://playback.media-streaming.soundcloud.cloud/x/aac_160k/';
        const list = base + 'playlist.m3u8';
        const pl = `#EXTM3U\n#EXT-X-VERSION:7\n#EXT-X-MAP:URI="${base}init.mp4"\n#EXTINF:10,\n${base}0.m4s\n#EXTINF:10,\n1.m4s\n#EXT-X-ENDLIST\n`;
        const { ipc, site, deps, written } = setup({
            [list]: reply(list, [pl]), [base + 'init.mp4']: reply(base + 'init.mp4', ['I']), [base + '0.m4s']: reply(base + '0.m4s', ['0']), [base + '1.m4s']: reply(base + '1.m4s', ['1']),
        });
        expect(await ipc.invoke('soundcloud:download-track', site, { url: list, kind: 'hls', mime: 'audio/mp4; codecs="mp4a.40.2"', title: 'T', artist: 'A' })).toMatchObject({ ok: true });
        expect(written.join('')).toBe('I01');
        expect(deps.saveDialog.mock.calls[0][0].defaultPath.replace(/\\/g, '/')).toBe('C:/Users/me/Downloads/SoundCloud/A - T.m4a');
        expect(deps.notify).not.toHaveBeenCalled();
    });
    it('HLS mp3: метка ID3 с названием и артистом перед кусками', async () => {
        const one = 'https://playback.media-streaming.soundcloud.cloud/1.mp3';
        const { ipc, site, written } = setup({ [LIST]: reply(LIST, ['#EXTM3U\n1.mp3\n']), [one]: reply(one, ['A']) });
        expect(await ipc.invoke('soundcloud:download-track', site, { url: LIST, kind: 'hls', mime: 'audio/mpeg', title: 'T', artist: 'B' })).toMatchObject({ ok: true });
        expect(written[0].startsWith('ID3')).toBe(true);
        expect(written[written.length - 1]).toBe('A');
    });
    it('мастер-плейлист (ABR) раскрывается в вариант с наибольшим BANDWIDTH', async () => {
        const hi = 'https://playback.media-streaming.soundcloud.cloud/hi.m3u8';
        const seg = 'https://playback.media-streaming.soundcloud.cloud/s.m4s';
        const master = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=96000\nlo.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=160000\nhi.m3u8\n';
        const { ipc, site, written } = setup({ [LIST]: reply(LIST, [master]), [hi]: reply(hi, ['#EXTM3U\ns.m4s\n']), [seg]: reply(seg, ['S']) });
        expect(await ipc.invoke('soundcloud:download-track', site, { url: LIST, kind: 'hls', mime: 'audio/mpegurl' })).toMatchObject({ ok: true });
        expect(written.join('')).toBe('S');
    });
    it('зашифрованный плейлист и куски на чужом хосте не качаются', async () => {
        const enc = setup({ [LIST]: reply(LIST, ['#EXTM3U\n#EXT-X-KEY:METHOD=SAMPLE-AES,URI="skd://x"\ns.m4s\n']) });
        expect(await enc.ipc.invoke('soundcloud:download-track', enc.site, { url: LIST, kind: 'hls' })).toEqual({ ok: false, reason: 'failed' });
        expect(enc.deps.saveDialog).not.toHaveBeenCalled();
        const foreign = setup({ [LIST]: reply(LIST, ['#EXTM3U\nhttps://evil.com/s.m4s\n']) });
        expect(await foreign.ipc.invoke('soundcloud:download-track', foreign.site, { url: LIST, kind: 'hls' })).toEqual({ ok: false, reason: 'failed' });
        expect(foreign.deps.fetch).not.toHaveBeenCalledWith('https://evil.com/s.m4s', expect.anything());
    });
    it('занятое имя: предлагается «Имя (2)», а не перезапись', async () => {
        const { ipc, site, deps } = setup({ [FILE]: reply(FILE, ['ab'], { 'content-type': 'audio/mpeg' }) });
        const taken = new Set(['C:/Users/me/Downloads/SoundCloud/A - B.mp3']);
        const withExists = { ...deps, exists: async (file: string) => taken.has(file.replace(/\\/g, '/')) };
        registerDownloadIpc(ipc, withExists);
        await ipc.invoke('soundcloud:download-track', site, { url: FILE, kind: 'file', title: 'B', artist: 'A' });
        expect(deps.saveDialog.mock.calls[0][0].defaultPath.replace(/\\/g, '/')).toBe('C:/Users/me/Downloads/SoundCloud/A - B (2).mp3');
    });
    it('исходник AIFF сохраняется как .aiff, а не .mp3', async () => {
        const { ipc, site, deps } = setup({ [FILE]: reply(FILE, ['ab'], { 'content-type': 'audio/x-aiff', 'content-disposition': 'attachment;filename=4_Flickermood.aiff' }) });
        await ipc.invoke('soundcloud:download-track', site, { url: FILE, kind: 'file', title: 'B', artist: 'A' });
        expect(deps.saveDialog.mock.calls[0][0].defaultPath).toMatch(/A - B\.aiff$/);
    });
    it('зависший сервер: тайм-аут, повторы и ошибка вместо вечного «уже идёт скачивание»', async () => {
        vi.useFakeTimers();
        try {
            const { ipc, site, deps } = setup({});
            deps.fetch.mockImplementation(() => new Promise(() => undefined));
            const pending = ipc.invoke('soundcloud:download-track', site, { url: FILE, kind: 'file' });
            await vi.advanceTimersByTimeAsync(120000);
            expect(await pending).toEqual({ ok: false, reason: 'failed' });
            expect(deps.fetch).toHaveBeenCalledTimes(3);
            expect(deps.notify).not.toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });
    it('канал один и повторная регистрация его не задваивает', () => {
        const { ipc, deps } = setup({});
        expect([...ipc.handlers.keys()]).toEqual(['soundcloud:download-track', 'soundcloud:download-reveal']);
        expect(() => registerDownloadIpc(ipc, deps)).not.toThrow();
    });
});
