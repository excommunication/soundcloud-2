import { describe, expect, it } from 'vitest';
import { pickCandidate } from './fullTrack';
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
