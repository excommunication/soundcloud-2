import { describe, expect, it } from 'vitest';
import { likeStreak } from './likes';

// Местное время: полдень, чтобы смещение часового пояса не переносило день
const at = (day: number, hour = 12): number => new Date(2026, 10, day, hour).getTime();

describe('likeStreak', () => {
    it('считает дни подряд, включая сегодня', () => {
        expect(likeStreak([at(25), at(24), at(23), at(20)], at(25, 18))).toEqual({ days: 3, today: true, best: 3 });
    });

    it('серия жива, если сегодня лайка ещё нет, но вчера был', () => {
        expect(likeStreak([at(24), at(23)], at(25, 9))).toEqual({ days: 2, today: false, best: 2 });
    });

    it('серия гаснет после пропущенного дня, рекорд остаётся', () => {
        expect(likeStreak([at(23), at(22), at(21), at(20)], at(25))).toEqual({ days: 0, today: false, best: 4 });
    });

    it('несколько лайков за день считаются одним днём, будущие даты не в счёт', () => {
        expect(likeStreak([at(25, 1), at(25, 23), at(24, 8), at(26)], at(25, 23))).toEqual({ days: 2, today: true, best: 2 });
    });

    it('без лайков серия пустая', () => {
        expect(likeStreak([], at(25))).toEqual({ days: 0, today: false, best: 0 });
    });

    it('переход через начало месяца не рвёт серию', () => {
        const dec1 = new Date(2026, 11, 1, 12).getTime();
        expect(likeStreak([at(30), dec1], dec1)).toEqual({ days: 2, today: true, best: 2 });
    });
});
