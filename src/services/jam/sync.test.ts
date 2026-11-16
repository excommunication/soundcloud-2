import { describe, expect, it } from 'vitest';
import { expectedPosition, isSeekJump, medianOffset, offsetFromPong, planFollow, shouldAdvance } from './sync';

const now = (extra: Record<string, unknown> = {}) => ({ startedAt: 10000, positionMs: 5000, paused: false, track: { id: 1, durationMs: 180000 }, ...extra });

describe('позиция по часам сервера', () => {
    it('идёт с момента startedAt, на паузе стоит', () => {
        expect(expectedPosition(now(), 13000)).toBe(8000);
        expect(expectedPosition(now({ paused: true }), 99999)).toBe(5000);
    });
    it('не уходит в минус и дальше конца трека', () => {
        expect(expectedPosition(now(), 9000)).toBe(5000);
        expect(expectedPosition(now(), 1e9)).toBe(180000);
        expect(expectedPosition(now({ track: { id: 1, durationMs: 0 } }), 20000)).toBe(15000);
    });
});

describe('что делать плееру', () => {
    const ok = { trackId: 1, positionMs: 8000, playing: true };
    it('джема нет: ничего', () => {
        expect(planFollow(null, 1, ok)).toEqual({ open: false, setPlaying: null, seekTo: null });
    });
    it('другой трек или тишина: открыть, позиция по часам', () => {
        expect(planFollow(now(), 13000, { ...ok, trackId: 2 })).toEqual({ open: true, setPlaying: null, seekTo: 8000 });
        expect(planFollow(now(), 13000, null).open).toBe(true);
    });
    it('в допуске 2,5 с перемотки нет, за допуском есть', () => {
        expect(planFollow(now(), 13000, { ...ok, positionMs: 10400 }).seekTo).toBeNull();
        expect(planFollow(now(), 13000, { ...ok, positionMs: 10600 }).seekTo).toBe(8000);
        expect(planFollow(now(), 13000, { ...ok, positionMs: 5400 }).seekTo).toBe(8000);
        expect(planFollow(now(), 13000, { ...ok, positionMs: 10600 }, 5000).seekTo).toBeNull();
    });
    it('пауза и возобновление зеркалятся', () => {
        expect(planFollow(now({ paused: true }), 13000, ok)).toEqual({ open: false, setPlaying: false, seekTo: 5000 });
        expect(planFollow(now(), 13000, { ...ok, playing: false }).setPlaying).toBe(true);
        expect(planFollow(now(), 13000, ok).setPlaying).toBeNull();
    });
    it('на паузе допуск мал: позиция неподвижна', () => {
        expect(planFollow(now({ paused: true }), 13000, { ...ok, playing: false, positionMs: 5300 }).seekTo).toBeNull();
        expect(planFollow(now({ paused: true }), 13000, { ...ok, playing: false, positionMs: 6000 }).seekTo).toBe(5000);
    });
});

describe('прыжок позиции', () => {
    it('нормальный ход и подвисание не прыжок, перемотка прыжок', () => {
        expect(isSeekJump(10000, 11000, 1000, true)).toBe(false);
        expect(isSeekJump(10000, 10000, 1000, true)).toBe(false);
        expect(isSeekJump(10000, 40000, 1000, true)).toBe(true);
        expect(isSeekJump(40000, 10000, 1000, true)).toBe(true);
        expect(isSeekJump(10000, 10100, 1000, false)).toBe(false);
        expect(isSeekJump(10000, 30000, 1000, false)).toBe(true);
    });
});

describe('когда переключать трек', () => {
    it('доиграл локально: да; на паузе и без джема: нет', () => {
        expect(shouldAdvance(now(), 20000, true)).toBe(true);
        expect(shouldAdvance(now({ paused: true }), 1e9, true)).toBe(false);
        expect(shouldAdvance(null, 1e9, true)).toBe(false);
    });
    it('по часам: только когда вышло время плюс запас', () => {
        expect(shouldAdvance(now(), 10000 + 175000 + 4000 - 1, false)).toBe(false);
        expect(shouldAdvance(now(), 10000 + 175000 + 4001, false)).toBe(true);
        expect(shouldAdvance(now({ track: { id: 1, durationMs: 0 } }), 1e9, false)).toBe(false);
    });
});

describe('часы', () => {
    it('смещение из ответа: сервер впереди на 5 с, задержка 100 мс', () => {
        expect(offsetFromPong(1000, 6050, 1100)).toEqual({ offset: 5000, rtt: 100 });
    });
    it('медиана пяти измерений не двигается от одного выброса', () => {
        expect(medianOffset([5000, 5002, 4998, 5001, 9000])).toBe(5001);
        expect(medianOffset([3, 1])).toBe(2);
        expect(medianOffset([])).toBe(0);
        expect(medianOffset([NaN, 7])).toBe(7);
    });
});
