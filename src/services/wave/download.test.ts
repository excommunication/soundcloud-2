import { describe, expect, it, vi } from 'vitest';
import type { WaveTrack } from '../waveTypes';
import { installDownload, pickTranscoding, type DownloadPayload } from './download';

const API = 'https://api-v2.soundcloud.com';
const tr = (protocol: string, mime: string, preset: string, extra: object = {}) => ({
    url: `${API}/media/soundcloud:tracks:7/${preset}-${protocol}/stream/${protocol}`, preset, snipped: false, format: { protocol, mime_type: mime }, ...extra,
});
const AAC = 'audio/mp4; codecs="mp4a.40.2"';
// Так api-v2 отдаёт обычный трек с конца 2025: только AAC в HLS и ABR-плейлист
const today = [tr('hls', AAC, 'aac_160k'), tr('hls', AAC, 'aac_96k'), tr('hls', 'audio/mpegurl', 'abr_sq')];

function setup(track: object, api: Record<string, unknown>, sendResult: unknown = { ok: true }) {
    const get = vi.fn(async (url: string) => (url in api ? api[url] : null));
    const send = vi.fn(async (payload: DownloadPayload) => (payload ? sendResult : sendResult));
    const showToast = vi.fn();
    const section = installDownload({ lang: 'ru', disposed: () => false, get, send, showToast });
    const run = () => section.run({ id: 7, title: 'Песня', user: { username: 'Автор' }, track_authorization: 'AUTH', ...track } as unknown as WaveTrack);
    return { get, send, showToast, run };
}

describe('выбор потока по api-v2 сегодня', () => {
    it('audio/mpegurl (abr_sq) это плейлист, а не mp3: идёт последним; AAC по битрейту', () => {
        const ranked = pickTranscoding({ id: 7, media: { transcodings: [today[2], today[1], today[0]] } } as unknown as WaveTrack, true);
        expect(ranked.map((item) => item.url.split('/')[5])).toEqual(['aac_160k-hls', 'aac_96k-hls', 'abr_sq-hls']);
    });
    it('progressive mp3, потом HLS mp3, потом AAC', () => {
        const list = [tr('hls', AAC, 'aac_160k'), tr('hls', 'audio/mpeg', 'mp3_1_0'), tr('progressive', 'audio/mpeg', 'mp3_0_1')];
        expect(pickTranscoding({ id: 7, media: { transcodings: list } } as unknown as WaveTrack, true).map((item) => item.protocol + ' ' + item.mime)).toEqual([
            'progressive audio/mpeg', 'hls audio/mpeg', 'hls ' + AAC,
        ]);
    });
});

describe('скачивание на странице', () => {
    it('официальный файл автора первым (soft), поток запасным', async () => {
        const aac = today[0].url + '?track_authorization=AUTH';
        const { send, run } = setup({ downloadable: true, has_downloads_left: true, media: { transcodings: today } }, {
            [`${API}/tracks/7/download`]: { redirectUri: 'https://cf-media.sndcdn.com/orig?Signature=1' },
            [aac]: { url: 'https://playback.media-streaming.soundcloud.cloud/x/aac_160k/playlist.m3u8' },
        }, { ok: false, reason: 'unreachable' });
        await run();
        expect(send.mock.calls.map(([payload]) => [payload.kind, payload.url, payload.soft ?? false])).toEqual([
            ['file', 'https://cf-media.sndcdn.com/orig?Signature=1', true],
            ['hls', 'https://playback.media-streaming.soundcloud.cloud/x/aac_160k/playlist.m3u8', false],
        ]);
        expect(send.mock.calls[0][0]).toMatchObject({ title: 'Песня', artist: 'Автор' });
    });
    it('progressive: ссылка с track_authorization, в main уходит подписанный адрес файла', async () => {
        const prog = tr('progressive', 'audio/mpeg', 'mp3_0_1');
        const { send, get, run } = setup({ media: { transcodings: [prog] } }, { [prog.url + '?track_authorization=AUTH']: { url: 'https://cf-media.sndcdn.com/a.128.mp3?Policy=x' } });
        await run();
        expect(get).toHaveBeenCalledWith(prog.url + '?track_authorization=AUTH');
        expect(send).toHaveBeenCalledTimes(1);
        expect(send.mock.calls[0][0]).toMatchObject({ kind: 'file', url: 'https://cf-media.sndcdn.com/a.128.mp3?Policy=x', mime: 'audio/mpeg' });
        expect(send.mock.calls[0][0].soft).toBeUndefined();
    });
    it('поток, который не открылся (404 у abr_sq), пропускается: берётся следующий', async () => {
        const { send, run } = setup({ media: { transcodings: [today[2], today[1]] } }, {
            [today[1].url + '?track_authorization=AUTH']: { url: 'https://playback.media-streaming.soundcloud.cloud/x/aac_96k/playlist.m3u8' },
        });
        await run();
        expect(send.mock.calls.map(([payload]) => payload.url)).toEqual(['https://playback.media-streaming.soundcloud.cloud/x/aac_96k/playlist.m3u8']);
    });
    it('только зашифрованные потоки: ничего не запрашивается и не шлётся, понятное сообщение о защите', async () => {
        const drm = [tr('ctr-encrypted-hls', AAC, 'aac_160k'), tr('cbc-encrypted-hls', AAC, 'aac_160k'), tr('encrypted-hls', 'audio/mpegurl', 'abr_sq')];
        const { send, get, showToast, run } = setup({ media: { transcodings: drm } }, {});
        await run();
        expect(get).not.toHaveBeenCalled();
        expect(send).not.toHaveBeenCalled();
        expect(showToast).toHaveBeenLastCalledWith(expect.stringContaining('защитой'));
    });
    it('только отрывок: сообщение про отрывок; нет ссылок: общая ошибка', async () => {
        const snip = setup({ media: { transcodings: [tr('hls', AAC, 'aac_160k', { snipped: true })] } }, {});
        await snip.run();
        expect(snip.showToast).toHaveBeenLastCalledWith(expect.stringContaining('отрывком'));
        const none = setup({ media: { transcodings: today } }, {});
        await none.run();
        expect(none.showToast).toHaveBeenLastCalledWith('Не удалось получить файл трека');
        expect(none.send).not.toHaveBeenCalled();
    });
    it('трек из списка без media догружается с api-v2', async () => {
        const { get, send, run } = setup({ track_authorization: undefined }, {
            [`${API}/tracks/7`]: { id: 7, track_authorization: 'AUTH', media: { transcodings: [today[0]] } },
            [today[0].url + '?track_authorization=AUTH']: { url: 'https://playback.media-streaming.soundcloud.cloud/p.m3u8' },
        });
        await run();
        expect(get.mock.calls[0][0]).toBe(`${API}/tracks/7`);
        expect(send).toHaveBeenCalledTimes(1);
    });
});
