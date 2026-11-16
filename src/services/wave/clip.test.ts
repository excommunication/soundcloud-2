import { describe, expect, it } from 'vitest';
import { clipArtwork, clipLineAt, clipNextStyle, clipSeekStep, verticalFrame } from './clip';

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
    it('строка текста по времени: начавшаяся последней, до первой -1', () => {
        const lines = [{ at: 1000 }, { at: 3000 }, { at: 5000 }];
        expect(clipLineAt(lines, 0)).toBe(-1);
        expect(clipLineAt(lines, 1000)).toBe(0);
        expect(clipLineAt(lines, 4999)).toBe(1);
        expect(clipLineAt(lines, 90000)).toBe(2);
        expect(clipLineAt([], 500)).toBe(-1);
    });
    it('перемотка не выходит за начало и конец трека', () => {
        expect(clipSeekStep(10000, 60000, 5000)).toBe(15000);
        expect(clipSeekStep(2000, 60000, -5000)).toBe(0);
        expect(clipSeekStep(59000, 60000, 5000)).toBe(59750);
        expect(clipSeekStep(1000, 0, 5000)).toBe(0);
    });
    it('стили текста по кругу: поток, удар, без текста', () => {
        expect(clipNextStyle('flow')).toBe('punch');
        expect(clipNextStyle('punch')).toBe('off');
        expect(clipNextStyle('off')).toBe('flow');
        expect(clipNextStyle('')).toBe('flow');
    });
});
