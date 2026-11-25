import { describe, expect, it } from 'vitest';
import { downloadFileName, extensionFor, isDownloadUrl, parseHlsSegments, sanitizeFilePart, validateDownloadRequest } from './trackDownload';
import { pickTranscoding } from './wave/download';
import type { WaveTrack } from './waveTypes';

describe('имя файла', () => {
    it('убирает запрещённые в Windows знаки и хвостовые точки', () => {
        expect(sanitizeFilePart('a/b\\c:d*e?f"g<h>i|j')).toBe('a b c d e f g h i j');
        expect(sanitizeFilePart('Конец...  ')).toBe('Конец');
        expect(sanitizeFilePart('con')).toBe('_con');
        expect(sanitizeFilePart('x'.repeat(300)).length).toBe(100);
    });
    it('«Артист - Название.расширение» и запасные имена', () => {
        expect(downloadFileName('Artist', 'Song: Live?', 'mp3')).toBe('Artist - Song Live.mp3');
        expect(downloadFileName('', 'Song', 'mp3')).toBe('Song.mp3');
        expect(downloadFileName('Artist', '', 'm4a')).toBe('Artist.m4a');
        expect(downloadFileName('', '', 'mp3')).toBe('track.mp3');
    });
    it('расширение по MIME', () => {
        expect(extensionFor('audio/mpeg')).toBe('mp3');
        expect(extensionFor('audio/mp4; codecs="mp4a.40.2"')).toBe('m4a');
        expect(extensionFor('audio/x-wav')).toBe('wav');
        expect(extensionFor('audio/flac')).toBe('flac');
        expect(extensionFor('application/octet-stream')).toBe('mp3');
    });
});

describe('адрес и запрос от страницы', () => {
    it('только https на soundcloud.com и sndcdn.com', () => {
        expect(isDownloadUrl('https://cf-media.sndcdn.com/a.mp3?x=1')).toBe(true);
        expect(isDownloadUrl('https://api-v2.soundcloud.com/media/1')).toBe(true);
        expect(isDownloadUrl('http://cf-media.sndcdn.com/a.mp3')).toBe(false);
        expect(isDownloadUrl('https://evilsndcdn.com/a')).toBe(false);
        expect(isDownloadUrl('https://sndcdn.com.evil.com/a')).toBe(false);
        expect(isDownloadUrl('https://user:pw@sndcdn.com/a')).toBe(false);
        expect(isDownloadUrl('file:///C:/a.mp3')).toBe(false);
        expect(isDownloadUrl(42)).toBe(false);
    });
    it('проверка запроса чистит текст и отбрасывает чужое', () => {
        const ok = validateDownloadRequest({ url: 'https://cf-media.sndcdn.com/a', kind: 'hls', mime: 'Audio/MPEG', title: ' Песня\n', artist: 'A\u0000B' });
        expect(ok).toEqual({ url: 'https://cf-media.sndcdn.com/a', kind: 'hls', mime: 'audio/mpeg', title: 'Песня', artist: 'A B' });
        expect(validateDownloadRequest({ url: 'https://evil.com/a', kind: 'file' })).toBeNull();
        expect(validateDownloadRequest({ url: 'https://sndcdn.com/a', kind: 'exe' })).toBeNull();
        expect(validateDownloadRequest(null)).toBeNull();
        expect(validateDownloadRequest([])).toBeNull();
    });
});

describe('плейлист HLS', () => {
    const base = 'https://playback.media-streaming.soundcloud.cloud/x/playlist.m3u8';
    it('куски по порядку и кусок описания', () => {
        const plan = parseHlsSegments('#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:10,\nseg1.m4s\n#EXTINF:10,\nhttps://cf-hls.sndcdn.com/seg2.m4s\n#EXT-X-ENDLIST\n', base);
        expect(plan).toEqual({ init: 'https://playback.media-streaming.soundcloud.cloud/x/init.mp4', segments: ['https://playback.media-streaming.soundcloud.cloud/x/seg1.m4s', 'https://cf-hls.sndcdn.com/seg2.m4s'] });
    });
    it('шифрованный и пустой плейлисты не берутся', () => {
        expect(parseHlsSegments('#EXT-X-KEY:METHOD=SAMPLE-AES,URI="x"\nseg.m4s', base)).toBeNull();
        expect(parseHlsSegments('#EXT-X-KEY:METHOD=NONE\nseg.mp3', base)?.segments).toHaveLength(1);
        expect(parseHlsSegments('#EXTM3U\n', base)).toBeNull();
    });
});

const media = (...list: Array<[string, string, boolean?]>): WaveTrack =>
    ({ id: 1, media: { transcodings: list.map(([protocol, mime, snipped]) => ({ url: 'https://api-v2.soundcloud.com/media/' + protocol + mime.length, snipped, format: { protocol, mime_type: mime } })) } }) as unknown as WaveTrack;

describe('выбор потока', () => {
    it('открытый mp3 раньше HLS', () => {
        const pick = pickTranscoding(media(['hls', 'audio/mpeg'], ['progressive', 'audio/mpeg'], ['hls', 'audio/mp4; codecs="mp4a.40.2"']));
        expect(pick?.protocol).toBe('progressive');
    });
    it('без progressive: HLS mp3, потом любой HLS', () => {
        expect(pickTranscoding(media(['hls', 'audio/mp4; codecs="mp4a.40.2"'], ['hls', 'audio/mpeg']))?.mime).toBe('audio/mpeg');
        expect(pickTranscoding(media(['hls', 'audio/mp4; codecs="mp4a.40.2"']))?.protocol).toBe('hls');
    });
    it('отрывки, шифрованные потоки и чужие адреса пропускаются', () => {
        expect(pickTranscoding(media(['progressive', 'audio/mpeg', true], ['ctr-encrypted-hls', 'audio/mp4']))).toBeNull();
        const foreign = { id: 1, media: { transcodings: [{ url: 'https://evil.com/media/1', format: { protocol: 'progressive', mime_type: 'audio/mpeg' } }] } } as unknown as WaveTrack;
        expect(pickTranscoding(foreign)).toBeNull();
        expect(pickTranscoding({ id: 1 } as WaveTrack)).toBeNull();
    });
});
