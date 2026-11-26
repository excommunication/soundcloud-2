// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { installLikes, likeStreak } from './likes';

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

describe('таблетка серии', () => {
    const mount = (likedDaysAgo: number[]) => {
        const now = Date.now();
        const collection = likedDaysAgo.map((d) => ({ created_at: new Date(now - d * 86400000).toISOString(), track: { permalink_url: 'https://soundcloud.com/a/t' + d } }));
        const section = installLikes({ lang: 'ru', disposed: () => false, userId: async () => 1, get: async () => ({ collection }), history: async () => null });
        const host = document.createElement('div');
        host.className = 'scw-title';
        document.body.append(host);
        section.streak(host);
        return { section, host };
    };

    it('спокойная: однотонный огонёк одним контуром, без свечения, градиентов и анимации', async () => {
        const { section, host } = mount([0, 1, 2]);
        await vi.waitFor(() => expect(host.querySelector('.scl-streak b')?.textContent).toBe('3'));
        const pill = host.querySelector<HTMLElement>('.scl-streak')!;
        expect(pill.classList.contains('scl-home')).toBe(true);
        expect(['scl-cold', 'scl-wait', 'scl-hot'].filter((c) => pill.classList.contains(c))).toEqual([]);
        const svg = pill.querySelector('svg.scl-flame')!;
        expect(svg.querySelectorAll('path').length).toBe(1);
        expect(svg.innerHTML).not.toMatch(/Gradient|circle|url\(/);
        expect(pill.querySelector('small')?.textContent).toBe('дня подряд');
        expect(pill.title).toContain('Серия лайков: 3 дня подряд');
        expect(pill.getAttribute('aria-label')).toBe(pill.title.replace('\n', '. '));
        const css = document.getElementById('scl-style')?.textContent ?? '';
        const rules = (css.match(/[^{}]*\.scl-(?:streak|flame)[^{}]*\{[^}]*\}/g) ?? []).join('');
        expect(rules).not.toBe('');
        expect(rules).not.toMatch(/drop-shadow|background-clip|gradient|animation|@keyframes/);
        expect(css).not.toMatch(/scl-(?:flicker|spark|core)/);
        // Оранжевый SoundCloud только у огонька и лёгкого оттенка «недели»; число белое
        expect(rules).toContain('.scl-flame{flex:none;width:14px;height:14px;color:#ff5500}');
        section.dispose();
        host.remove();
    });

    it('без лайка сегодня огонёк контуром, неделя подряд помечена scl-hot', async () => {
        const wait = mount([1, 2]);
        await vi.waitFor(() => expect(wait.host.querySelector('.scl-streak')?.classList.contains('scl-wait')).toBe(true));
        wait.section.dispose();
        wait.host.remove();
        const hot = mount([0, 1, 2, 3, 4, 5, 6]);
        await vi.waitFor(() => expect(hot.host.querySelector('.scl-streak')?.classList.contains('scl-hot')).toBe(true));
        const css = document.getElementById('scl-style')?.textContent ?? '';
        expect(css).toContain('.scl-streak.scl-wait .scl-flame path,.scl-streak.scl-cold .scl-flame path{fill:none}');
        hot.section.dispose();
        hot.host.remove();
    });
});
