import { describe, expect, it } from 'vitest';
import { clipArtwork, verticalFrame } from './clip';

describe('режим «Для роликов»', () => {
    it('кадр 9:16 во всю высоту, в узком окне во всю ширину', () => {
        expect(verticalFrame(1920, 1080)).toEqual({ width: 608, height: 1080 });
        expect(verticalFrame(400, 1080)).toEqual({ width: 400, height: 711 });
        expect(verticalFrame(0, 1080)).toEqual({ width: 0, height: 0 });
    });
    it('крупная обложка вместо 500×500, чужие адреса как были', () => {
        expect(clipArtwork('https://i1.sndcdn.com/artworks-abc-t500x500.jpg')).toBe('https://i1.sndcdn.com/artworks-abc-original.jpg');
        expect(clipArtwork('https://i1.sndcdn.com/avatars-abc-t500x500.png?x=1')).toBe('https://i1.sndcdn.com/avatars-abc-original.png?x=1');
        expect(clipArtwork('https://example.test/a.jpg')).toBe('https://example.test/a.jpg');
        expect(clipArtwork('')).toBe('');
    });
});
