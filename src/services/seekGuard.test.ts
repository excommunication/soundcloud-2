import { describe, expect, it } from 'vitest';
import { createSeekWatch, restorePosition, seekBackDelta } from './seekGuard';

describe('restorePosition', () => {
    const base = { savedTrackId: 5, savedPositionMs: 60000, currentTrackId: null, currentPositionMs: 0 };
    it('восстанавливает, когда ничего не играет', () => expect(restorePosition(base)).toBe(60000));
    it('не перематывает при нулевой позиции', () => expect(restorePosition({ ...base, savedPositionMs: 0 })).toBeNull());
    it('не откатывает уже проигранное того же трека', () => {
        expect(restorePosition({ ...base, currentTrackId: 5, currentPositionMs: 75000 })).toBeNull();
        expect(restorePosition({ ...base, currentTrackId: 5, currentPositionMs: 58500 })).toBeNull();
    });
    it('допуск 2 с: сильно позади — восстанавливает', () => expect(restorePosition({ ...base, currentTrackId: 5, currentPositionMs: 10000 })).toBe(60000));
    it('другой трек не мешает', () => expect(restorePosition({ ...base, currentTrackId: 9, currentPositionMs: 90000 })).toBe(60000));
});

describe('seekBackDelta', () => {
    it('откат больше секунды', () => expect(seekBackDelta(30000, 27000, true)).toBe(3000));
    it('мелкий откат и пауза не считаются', () => {
        expect(seekBackDelta(30000, 29500, true)).toBe(0);
        expect(seekBackDelta(30000, 20000, false)).toBe(0);
    });
    it('возврат к началу (повтор, «назад») не считается', () => expect(seekBackDelta(200000, 300, true)).toBe(0));
});

describe('createSeekWatch', () => {
    it('сообщает об откате без действия человека и называет источник', () => {
        const seen: Array<[string, number]> = [];
        const watch = createSeekWatch((source, delta) => seen.push([source, delta]));
        watch.sample(1, 50000, true, 0);
        watch.sample(1, 46000, true, 1000);
        watch.note('seek-restore', 10000);
        watch.sample(1, 44000, true, 11000);
        watch.sample(1, 41000, true, 12000);
        expect(seen[0]).toEqual(['seek-unknown', 4000]);
        expect(seen.length).toBe(3);
        expect(seen[1][0]).toBe('seek-restore');
    });
    it('молчит после действия человека и на смене трека', () => {
        const seen: number[] = [];
        const watch = createSeekWatch((_s, d) => seen.push(d));
        watch.sample(1, 50000, true, 0);
        watch.user(500);
        watch.sample(1, 20000, true, 1000);
        watch.sample(2, 90000, true, 2000);
        watch.sample(2, 10000, true, 60000 + 2000);
        expect(seen).toEqual([80000]);
    });
});
