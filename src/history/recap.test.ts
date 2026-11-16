import { expect, it } from 'vitest';
import {
    lastWeek, recapArchetype, recapDaily, recapDays, recapHue, recapImage, recapInsights, recapMonths, recapName, recapPalette, recapPeakHour, recapPeople, recapPeriod, recapPieces, recapStreak, withRecapInsights,
    type RecapFacts,
} from './recap';

// Однопиксельный PNG
const PIXEL = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg==';

it('recapImage: только PNG в data:image/png', () => {
    const buffer = recapImage('data:image/png;base64,' + PIXEL);
    expect(buffer?.subarray(1, 4).toString('latin1')).toBe('PNG');
    expect(recapImage('data:image/jpeg;base64,' + PIXEL)).toBeNull();
    // Не PNG внутри
    expect(recapImage('data:image/png;base64,' + Buffer.from('<svg/>').toString('base64'))).toBeNull();
    expect(recapImage('data:image/png;base64,')).toBeNull();
    expect(recapImage('data:image/png;base64,iVBOR w0K')).toBeNull();
    expect(recapImage(42)).toBeNull();
    // Больше 12 МБ
    expect(recapImage('data:image/png;base64,iVBORw0KGgoA' + 'A'.repeat(17 * 1024 * 1024))).toBeNull();
});

it('recapName: по неделе ISO, без недели по местной дате', () => {
    expect(recapName(2026, 40, new Date(2026, 9, 2))).toBe('soundcloud-week-2026-40.png');
    expect(recapName(2027, 1, new Date(2027, 0, 9))).toBe('soundcloud-week-2027-01.png');
    expect(recapName('2026', 40, new Date(2026, 9, 2, 23, 59))).toBe('soundcloud-week-2026-10-02.png');
    expect(recapName(2026, 54, new Date(2027, 0, 9))).toBe('soundcloud-week-2027-01-09.png');
    // Карточка сводки: хвост к имени, чужое имя карточки отбрасывается
    expect(recapName(2026, 40, new Date(2026, 9, 2), 'artist')).toBe('soundcloud-week-2026-40-artist.png');
    expect(recapName(2026, 40, new Date(2026, 9, 2), '../x')).toBe('soundcloud-week-2026-40.png');
});

it('recapName: месяц и год в имени, чужое отбрасывается', () => {
    const at = new Date(2026, 10, 16);
    expect(recapName(2026, 11, at, 'artist', 'month')).toBe('soundcloud-month-2026-11-artist.png');
    expect(recapName(2026, 3, at, undefined, 'month')).toBe('soundcloud-month-2026-03.png');
    // Месяц вне 1..12 или год строкой: по сегодняшней дате
    expect(recapName(2026, 13, at, 'track', 'month')).toBe('soundcloud-month-2026-11-track.png');
    expect(recapName('2026', 11, at, 'track', 'month')).toBe('soundcloud-month-2026-11-track.png');
    expect(recapName(2026, 2026, at, 'week', 'year')).toBe('soundcloud-year-2026-week.png');
    expect(recapName(2025, null, at, 'vibe', 'year')).toBe('soundcloud-year-2025-vibe.png');
    expect(recapName(1999, null, at, '../../x', 'year')).toBe('soundcloud-year-2026.png');
    // Чужой период — неделя
    expect(recapName(2026, 40, at, 'artist', '../decade')).toBe('soundcloud-week-2026-40-artist.png');
    expect(recapName(2026, 40, at, 'artist', 7)).toBe('soundcloud-week-2026-40-artist.png');
});

it('recapPeriod: неделя, календарный месяц и год по местному времени', () => {
    // Понедельник 16 ноября 2026, вечер
    const now = new Date(2026, 10, 16, 21, 0);
    expect(recapPeriod('week', 'last', now)).toEqual({
        period: 'week', span: 'last', from: new Date(2026, 10, 9).getTime(), to: new Date(2026, 10, 16).getTime(), last: new Date(2026, 10, 15).getTime(), year: 2026, number: 46, days: 7,
    });
    expect(recapPeriod('week', 'this', now)).toMatchObject({ from: new Date(2026, 10, 16).getTime(), to: new Date(2026, 10, 17).getTime(), number: 47, days: 1 });
    expect(recapPeriod('month', 'this', now)).toMatchObject({ from: new Date(2026, 10, 1).getTime(), to: new Date(2026, 10, 17).getTime(), last: new Date(2026, 10, 16).getTime(), year: 2026, number: 11, days: 16 });
    expect(recapPeriod('month', 'last', now)).toMatchObject({ from: new Date(2026, 9, 1).getTime(), to: new Date(2026, 10, 1).getTime(), last: new Date(2026, 9, 31).getTime(), number: 10, days: 31 });
    expect(recapPeriod('year', 'this', now)).toMatchObject({ from: new Date(2026, 0, 1).getTime(), to: new Date(2026, 10, 17).getTime(), year: 2026, number: 2026, days: 320 });
    expect(recapPeriod('year', 'last', now)).toMatchObject({ from: new Date(2025, 0, 1).getTime(), to: new Date(2026, 0, 1).getTime(), year: 2025, days: 365 });
    // Прошлый месяц в январе — декабрь прошлого года; прошлая неделя через границу месяца
    expect(recapPeriod('month', 'last', new Date(2027, 0, 3))).toMatchObject({ from: new Date(2026, 11, 1).getTime(), year: 2026, number: 12 });
    expect(recapPeriod('week', 'last', new Date(2026, 11, 2))).toMatchObject({ from: new Date(2026, 10, 23).getTime(), to: new Date(2026, 10, 30).getTime() });
});

it('recapPeriod: без выбора берёт период, где уже есть что показать; мусор не ломает', () => {
    expect(recapPeriod('week', undefined, new Date(2026, 10, 16)).span).toBe('last');
    expect(recapPeriod('month', 'auto', new Date(2026, 10, 16)).span).toBe('this');
    expect(recapPeriod('month', null, new Date(2026, 10, 3)).span).toBe('last');
    expect(recapPeriod('year', undefined, new Date(2026, 10, 16)).span).toBe('this');
    expect(recapPeriod('year', undefined, new Date(2027, 0, 20))).toMatchObject({ span: 'last', year: 2026 });
    expect(recapPeriod({ evil: true }, 'this', new Date(2026, 10, 16))).toMatchObject({ period: 'week', span: 'this' });
});

it('recapPieces: длинный период кусками до 200 дней по местным полуночам, короткий целиком', () => {
    const from = new Date(2026, 0, 1).getTime();
    const to = new Date(2027, 0, 1).getTime();
    const pieces = recapPieces(from, to);
    expect(pieces).toHaveLength(2);
    expect(pieces[0]).toEqual({ from, to: new Date(2026, 0, 184).getTime(), days: 183 });
    expect(pieces[1]).toEqual({ from: new Date(2026, 0, 184).getTime(), to, days: 182 });
    expect(pieces.every((piece) => piece.days <= 200)).toBe(true);
    const month = recapPieces(new Date(2026, 10, 1).getTime(), new Date(2026, 11, 1).getTime());
    expect(month).toEqual([{ from: new Date(2026, 10, 1).getTime(), to: new Date(2026, 11, 1).getTime(), days: 30 }]);
});

it('recapDaily и recapMonths: дни куска ровно по счёту, месяцы от начала периода', () => {
    // Полосы по 12 часов: 2 на сутки; лишняя полоса от перехода на зимнее время отрезается
    expect(recapDaily({ wave: { binHours: 12, bins: [1, 2, 0, 0, 5, 5, 9] } }, 3)).toEqual([3, 0, 10]);
    expect(recapDaily({ wave: { binHours: 24, bins: [4] } }, 3)).toEqual([4, 0, 0]);
    expect(recapDaily({ wave: { binHours: 48, bins: [4] } }, 3)).toBeNull();
    expect(recapDaily(null, 3)).toBeNull();
    // 30 и 31 января, 1 февраля
    expect(recapMonths(new Date(2026, 0, 30).getTime(), [10, 20, 5])).toEqual([30, 5]);
    expect(recapMonths(new Date(2026, 11, 31).getTime(), [1, 2])).toEqual([1, 2]);
    expect(recapMonths(new Date(2026, 0, 1).getTime(), [])).toEqual([]);
});

it('lastWeek: прошлая неделя с понедельника по местному времени, номер по ISO', () => {
    // Пятница 2 октября 2026: прошлая неделя с 21 по 28 сентября, 39-я
    const week = lastWeek(new Date(2026, 9, 2, 16, 0));
    expect(week).toEqual({ from: new Date(2026, 8, 21).getTime(), to: new Date(2026, 8, 28).getTime(), id: '2026-39' });
    // Понедельник с самого утра уже считает только что закончившуюся неделю
    expect(lastWeek(new Date(2026, 8, 28, 0, 5)).id).toBe('2026-39');
    expect(lastWeek(new Date(2026, 8, 27, 23, 55)).id).toBe('2026-38');
    // Неделя на стыке лет: 28 декабря 2026 - 3 января 2027 это 53-я неделя 2026 года
    expect(lastWeek(new Date(2027, 0, 6)).id).toBe('2026-53');
    // 29 декабря 2025 - 4 января 2026 это 1-я неделя 2026 года
    expect(lastWeek(new Date(2026, 0, 7)).id).toBe('2026-01');
});

it('recapPeople: ник и ссылка проверяются, картинки только с sndcdn и только по спрошенным путям', () => {
    const people = recapPeople(
        {
            me: { username: '  nightdriver  ', permalink: 'nightdriver', avatar: 'https://i1.sndcdn.com/avatars-1-large.jpg' },
            avatars: { '/burial': 'https://i1.sndcdn.com/avatars-2-large.jpg', '/evil': 'https://evil.example/a.jpg', '/other': 'https://i1.sndcdn.com/x.jpg' },
        },
        ['/burial', '/evil'],
    );
    expect(people).toEqual({ me: { username: 'nightdriver', permalink: 'nightdriver', avatar: 'https://i1.sndcdn.com/avatars-1-large.jpg' }, avatars: { '/burial': 'https://i1.sndcdn.com/avatars-2-large.jpg' } });
    expect(recapPeople({ me: { username: 'x', permalink: '../evil', avatar: 'javascript:alert(1)' } }, [])).toEqual({ me: { username: 'x', permalink: '', avatar: '' }, avatars: {} });
    expect(recapPeople({ me: { username: '' } }, [])).toEqual({ me: null, avatars: {} });
    expect(recapPeople(null, [])).toBeNull();
});

// Теплокарта: 7 дней по 24 часа, минуты в нужные часы
const heatWith = (cells: Array<[number, number, number]>): number[] => {
    const heat = new Array<number>(168).fill(0);
    for (const [day, hour, minutes] of cells) heat[day * 24 + hour] += minutes;
    return heat;
};
const facts = (over: Partial<RecapFacts> = {}): RecapFacts => ({
    counted: 40, heardMs: 6 * 3600000, activeDays: 5, nightShare: 5, morningShare: 10, topShare: 15, trackShare: 5, topPlays: 3, freshShare: 20, artistCount: 20, genres: 3, genreShare: 60, ...over,
});

it('recapDays и recapStreak: сутки из полос волны, серия дней подряд', () => {
    // Полосы по 6 часов: 4 на сутки
    const days = recapDays([], { binHours: 6, bins: [0, 10, 0, 0, 5, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1] });
    expect(days).toEqual([10, 5, 0, 4]);
    expect(recapStreak(days)).toBe(2);
    expect(recapStreak([1, 1, 0, 1, 1, 1, 0])).toBe(3);
    expect(recapStreak([])).toBe(0);
    // Полоса длиннее суток: по дням недели из теплокарты
    expect(recapDays(heatWith([[0, 3, 7], [6, 23, 2]]), { binHours: 48, bins: [1] })).toEqual([7, 0, 0, 0, 0, 0, 2]);
});

it('recapPeakHour: час с наибольшей музыкой по всем дням, тишина -1', () => {
    expect(recapPeakHour(heatWith([[0, 23, 30], [1, 23, 30], [2, 9, 50]]))).toBe(23);
    expect(recapPeakHour(new Array(168).fill(0))).toBe(-1);
});

it('recapArchetype: правила по порядку', () => {
    expect(recapArchetype(facts({ counted: 2 }))).toBe('starter');
    expect(recapArchetype(facts({ nightShare: 40, topShare: 60 }))).toBe('nightOwl');
    expect(recapArchetype(facts({ topShare: 45 }))).toBe('loyal');
    expect(recapArchetype(facts({ topPlays: 12, trackShare: 30 }))).toBe('repeat');
    expect(recapArchetype(facts({ freshShare: 60 }))).toBe('explorer');
    // Новых много, но артистов мало: не исследователь
    expect(recapArchetype(facts({ freshShare: 60, artistCount: 4 }))).toBe('steady');
    expect(recapArchetype(facts({ morningShare: 40 }))).toBe('earlyBird');
    expect(recapArchetype(facts({ heardMs: 20 * 3600000, activeDays: 5 }))).toBe('marathon');
    expect(recapArchetype(facts({ genres: 5, genreShare: 25 }))).toBe('eclectic');
    expect(recapArchetype(facts())).toBe('steady');
});

it('recapHue и recapPalette: тон из строки постоянный, цвета в hex', () => {
    expect(recapHue('Burial')).toBe(recapHue('Burial'));
    expect(recapHue('Burial')).not.toBe(recapHue('Four Tet'));
    expect(recapHue('')).toBeGreaterThanOrEqual(0);
    expect(recapHue('x')).toBeLessThan(360);
    const palette = recapPalette(0);
    expect(palette.a).toMatch(/^#[0-9a-f]{6}$/);
    expect(palette.b).toMatch(/^#[0-9a-f]{6}$/);
    expect(palette.c).toMatch(/^#[0-9a-f]{6}$/);
    // Тон 0 — красный: красный канал главный
    expect(parseInt(palette.a.slice(1, 3), 16)).toBeGreaterThan(parseInt(palette.a.slice(3, 5), 16));
    // Фон тёмный
    expect(parseInt(palette.c.slice(1, 3), 16)).toBeLessThan(60);
});

it('recapInsights: личное по ответу обзора, мусор не считается', () => {
    const overview = {
        from: 1000, heard: 10 * 3600000, counted: 50, artistCount: 10, fresh: 6, firstAt: 0,
        artists: [{ name: 'Burial', ms: 5 * 3600000 }], tracks: [{ plays: 6 }], genres: [{ plays: 30 }, { plays: 20 }],
        heat: heatWith([[0, 2, 300], [1, 2, 200], [2, 14, 100]]),
        wave: { binHours: 24, bins: [300, 200, 100, 0, 0, 0, 0] },
    };
    const insights = recapInsights(overview)!;
    expect(insights).toMatchObject({ archetype: 'nightOwl', days: 3, streak: 3, peakHour: 2, topShare: 50, nightShare: 83, trackShare: 12, freshShare: 60 });
    expect(insights.palette).toEqual(recapPalette(recapHue('Burial')));
    // История моложе периода: доля новых неизвестна
    expect(recapInsights({ ...overview, firstAt: 5000 })!.freshShare).toBe(-1);
    expect(recapInsights(null)).toBeNull();
    expect(recapInsights({ heat: 'x' })).toBeNull();
    expect(withRecapInsights({ heard: 1 })).toEqual({ heard: 1 });
    expect(withRecapInsights(overview)).toHaveProperty('insights.archetype', 'nightOwl');
});

it('recapInsights: дни периода из кусков или из волны ровно по календарю, без дней — пусто', () => {
    const base = {
        heard: 3 * 3600000, counted: 30, artistCount: 5, fresh: 0, firstAt: null,
        artists: [{ name: 'Burial', ms: 3600000 }], tracks: [{ plays: 3 }], genres: [], heat: new Array(168).fill(0),
    };
    // Дни, собранные по кускам: серия и число дней по ним, месяцы от месяца начала (30-31 января, 1-3 февраля)
    const from = new Date(2026, 0, 30).getTime();
    const year = recapInsights({ ...base, from, to: new Date(2026, 1, 4).getTime(), wave: { binHours: 48, bins: [1] }, daily: [0, 10, 20, 30, 0] })!;
    expect(year).toMatchObject({ days: 3, streak: 3, daily: [0, 10, 20, 30, 0], months: [10, 50] });
    // Волна по суткам на день длиннее периода (переход времени): лишний день отрезан
    const month = recapInsights({ ...base, from: new Date(2026, 10, 1).getTime(), to: new Date(2026, 10, 3).getTime(), wave: { binHours: 24, bins: [1, 0, 7] } })!;
    expect(month.daily).toEqual([1, 0]);
    expect(month.days).toBe(1);
    // Полосы по двое суток: дней нет, серия по дням недели, как раньше
    const long = recapInsights({ ...base, from, to: from + 400 * 86400000, wave: { binHours: 48, bins: [1] } })!;
    expect(long.daily).toEqual([]);
    expect(long.months).toEqual([]);
});
