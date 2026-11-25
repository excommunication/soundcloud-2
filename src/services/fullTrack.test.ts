import { describe, expect, it } from 'vitest';
import { FullTrackService, isBotCheck, pickCandidate } from './fullTrack';
import { allowFullTrackMedia } from '../contentPolicy';

const q = { title: 'HIGHEST IN THE ROOM', uploader: 'Travis Scott', durationMs: 175000 };
describe('полный трек', () => {
    it('берёт официальное видео нужной длительности, не ремикс и не слишком длинное', () => {
        const pick = pickCandidate(
            [
                { id: 'a', title: 'Travis Scott - HIGHEST IN THE ROOM (Remix)', duration: 175, channel: 'x' },
                { id: 'b', title: 'HIGHEST IN THE ROOM (1 hour)', duration: 3600, channel: 'y' },
                { id: 'c', title: 'Travis Scott - HIGHEST IN THE ROOM (Official Music Video)', duration: 177, channel: 'Travis Scott' },
            ],
            q,
        );
        expect(pick?.id).toBe('c');
    });
    it('ничего, если подходящей длительности нет', () => {
        expect(pickCandidate([{ id: 'a', title: 'Travis Scott - HIGHEST IN THE ROOM', duration: 240, channel: 'Travis Scott' }], q)).toBeNull();
    });
    it('политика: media-src получает googlevideo, остальное остаётся', () => {
        const out = allowFullTrackMedia("default-src 'self'; media-src blob: https://cf-media.sndcdn.com; img-src *");
        expect(out).toContain('https://*.googlevideo.com');
        expect(out).toContain("default-src 'self'");
        expect(out).toContain('img-src *');
        expect(allowFullTrackMedia("img-src *")).toBe('img-src *');
    });
});

describe('отказ YouTube «не бот»', () => {
    it('узнаёт ответ yt-dlp с любым апострофом и в stderr', () => {
        expect(isBotCheck(new Error("ERROR: [youtube] x: Sign in to confirm you’re not a bot."))).toBe(true);
        expect(isBotCheck(new Error("Sign in to confirm you�re not a bot"))).toBe(true);
        expect(isBotCheck(Object.assign(new Error('Command failed'), { stderr: "Sign in to confirm you're not a bot" }))).toBe(true);
        expect(isBotCheck(new Error('Video unavailable'))).toBe(false);
    });

    it('после отказа YouTube не дёргается, пока не придут новые cookie, и yt-dlp получает копию файла', async () => {
        if (process.platform !== 'win32') return;
        const { mkdtempSync, writeFileSync, readFileSync } = await import('fs');
        const { join } = await import('path');
        const { tmpdir } = await import('os');
        const dir = mkdtempSync(join(tmpdir(), 'sc-full-'));
        writeFileSync(join(dir, 'yt-cookies.txt'), 'original');
        writeFileSync(join(dir, 'yt-dlp.exe'), 'MZ');
        let calls = 0;
        let cookieArg = '';
        let answer: 'bot' | 'none' = 'bot';
        const service = new FullTrackService({
            dataDir: dir,
            nodePath: 'node',
            download: () => Promise.reject(new Error('no')),
            run: (_file, args) => {
                calls++;
                cookieArg = args[args.indexOf('--cookies') + 1];
                writeFileSync(cookieArg, 'rewritten by yt-dlp');
                return answer === 'bot' ? Promise.reject(new Error("Sign in to confirm you're not a bot")) : Promise.resolve('{"entries":[]}');
            },
        });
        await service.resolve({ title: 'Song', uploader: 'Artist', durationMs: 180000 });
        expect(calls).toBe(1);
        expect(cookieArg).not.toBe(join(dir, 'yt-cookies.txt'));
        expect(readFileSync(join(dir, 'yt-cookies.txt'), 'utf8')).toBe('original');
        expect(service.blocked()).toBe(true);
        await service.resolve({ title: 'Another', uploader: 'Artist', durationMs: 180000 });
        expect(calls).toBe(1);
        service.unblock();
        answer = 'none';
        await service.resolve({ title: 'Song', uploader: 'Artist', durationMs: 180000 });
        expect(calls).toBe(2);
        expect(service.blocked()).toBe(false);
    });

    it('предупреждение отдаётся один раз на каждый блок', async () => {
        if (process.platform !== 'win32') return;
        const { mkdtempSync, writeFileSync } = await import('fs');
        const { join } = await import('path');
        const { tmpdir } = await import('os');
        const dir = mkdtempSync(join(tmpdir(), 'sc-full-'));
        writeFileSync(join(dir, 'yt-cookies.txt'), '');
        writeFileSync(join(dir, 'yt-dlp.exe'), 'MZ');
        const service = new FullTrackService({
            dataDir: dir,
            nodePath: 'node',
            download: () => Promise.reject(new Error('no')),
            run: () => Promise.reject(new Error("ERROR: Sign in to confirm you're not a bot")),
        });
        expect(await service.resolve({ title: 'Song', uploader: 'Artist', durationMs: 180000 })).toBeNull();
        expect(service.takeBotWarning()).toBe(true);
        expect(service.takeBotWarning()).toBe(false);
        expect(await service.resolve({ title: 'Other', uploader: 'Artist', durationMs: 180000 })).toBeNull();
        expect(service.takeBotWarning()).toBe(false);
    });
});
