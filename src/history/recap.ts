// Сводка недели: проверка картинки, которую рисует страница истории, и данных о людях от страницы сайта
const PNG_PREFIX = 'data:image/png;base64,';
// Карточка в два раза крупнее экрана с обложками весит единицы мегабайт; предел с запасом, но не даёт странице прислать что угодно
const MAX_BYTES = 12 * 1024 * 1024;
const PERMALINK = /^[a-z0-9_-]{1,100}$/i;
const ARTIST_PATH = /^\/[a-z0-9_-]{1,100}$/;
// Картинки только с сервера картинок SoundCloud: окно истории другие и не загрузит
const PICTURE = /^https:\/\/[a-z0-9-]{1,40}\.sndcdn\.com\/[^\s"'<>\\]{1,300}$/i;

/** PNG от страницы: только data:image/png с подписью PNG внутри и не больше 12 МБ */
export function recapImage(value: unknown): Buffer | null {
    if (typeof value !== 'string' || !value.startsWith(PNG_PREFIX)) return null;
    const body = value.slice(PNG_PREFIX.length);
    if (!body || body.length > Math.ceil(MAX_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(body)) return null;
    const buffer = Buffer.from(body, 'base64');
    return buffer.length > 8 && buffer.readUInt32BE(0) === 0x89504e47 && buffer.readUInt32BE(4) === 0x0d0a1a0a ? buffer : null;
}

/** Имя файла по неделе ISO: soundcloud-week-2026-40.png; неделя не пришла, значит по сегодняшней дате.
 *  Карточка сводки (2.11.0) добавляет хвост: soundcloud-week-2026-40-artist.png; чужое имя карточки отбрасывается.
 *  Итоги месяца и года (2.12.0): soundcloud-month-2026-11-artist.png, soundcloud-year-2026-week.png; чужой период — неделя */
export function recapName(year: unknown, number: unknown, at: Date, card?: unknown, period?: unknown): string {
    const pad = (n: number): string => String(n).padStart(2, '0');
    const valid = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
    const tail = (typeof card === 'string' && RECAP_CARDS.includes(card) ? '-' + card : '') + '.png';
    const kind = recapKind(period);
    if (kind === 'year') return 'soundcloud-year-' + (valid(year, 2020, 2100) ? year : at.getFullYear()) + tail;
    if (kind === 'month') {
        if (valid(year, 2020, 2100) && valid(number, 1, 12)) return 'soundcloud-month-' + year + '-' + pad(number) + tail;
        return 'soundcloud-month-' + at.getFullYear() + '-' + pad(at.getMonth() + 1) + tail;
    }
    if (valid(year, 2020, 2100) && valid(number, 1, 53)) return 'soundcloud-week-' + year + '-' + pad(number) + tail;
    return 'soundcloud-week-' + at.getFullYear() + '-' + pad(at.getMonth() + 1) + '-' + pad(at.getDate()) + tail;
}
/** Карточки сводки по порядку: неделя, артист, трек, характер */
export const RECAP_CARDS: readonly string[] = ['week', 'artist', 'track', 'vibe'];

const DAY_MS = 86400000;
/** Дней между двумя местными полуночами: переход на летнее время даёт лишний или недостающий час, округление его съедает */
const dayCount = (from: number, to: number): number => Math.max(0, Math.round((to - from) / DAY_MS));
/** Номер недели по ISO от её понедельника: первая неделя та, где 4 января, год по четвергу недели */
function isoWeek(monday: Date): { year: number; week: number } {
    const year = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 3).getFullYear();
    const january = new Date(year, 0, 4);
    const first = new Date(year, 0, 4 - ((january.getDay() + 6) % 7));
    return { year, week: 1 + Math.round((monday.getTime() - first.getTime()) / (7 * DAY_MS)) };
}

/** Прошлая неделя по местному времени: с понедельника до понедельника, номер по ISO (год по четвергу недели) */
export function lastWeek(now: Date): { from: number; to: number; id: string } {
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
    const start = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - 7);
    const { year, week } = isoWeek(start);
    return { from: start.getTime(), to: monday.getTime(), id: year + '-' + String(week).padStart(2, '0') };
}

// ===== Итоги по периодам (2.12.0): неделя, календарный месяц, календарный год =====
export type RecapKind = 'week' | 'month' | 'year';
export type RecapSpan = 'last' | 'this';
export interface RecapPeriod {
    period: RecapKind;
    /** Прошлый период целиком или нынешний до конца сегодняшнего дня */
    span: RecapSpan;
    from: number;
    to: number;
    /** Начало последнего дня периода: для подписи диапазона */
    last: number;
    /** Год недели по ISO, год месяца или сам год */
    year: number;
    /** Номер недели по ISO, месяц 1..12 или год */
    number: number;
    /** Календарных дней в периоде */
    days: number;
}
/** Чужой период — неделя */
export const recapKind = (value: unknown): RecapKind => (value === 'month' || value === 'year' ? value : 'week');

/** Границы итогов по местному времени. Неделя с понедельника, месяц и год календарные: так подпись «Твой ноябрь» честная.
 *  Нынешний период идёт до конца сегодняшнего дня. Без выбора (или с чужим значением): неделя прошлая, месяц нынешний
 *  с 8-го числа (раньше прошлый, в нынешнем ещё мало дней), год нынешний с февраля, в январе прошлый */
export function recapPeriod(period: unknown, span: unknown, now: Date): RecapPeriod {
    const kind = recapKind(period);
    const which: RecapSpan =
        span === 'last' || span === 'this' ? span
        : kind === 'month' ? (now.getDate() >= 8 ? 'this' : 'last')
        : kind === 'year' ? (now.getMonth() >= 1 ? 'this' : 'last')
        : 'last';
    const y = now.getFullYear();
    const m = now.getMonth();
    const tomorrow = new Date(y, m, now.getDate() + 1);
    let from: Date;
    let to: Date;
    if (kind === 'year') {
        from = new Date(which === 'this' ? y : y - 1, 0, 1);
        to = which === 'this' ? tomorrow : new Date(y, 0, 1);
    } else if (kind === 'month') {
        from = new Date(y, which === 'this' ? m : m - 1, 1);
        to = which === 'this' ? tomorrow : new Date(y, m, 1);
    } else {
        const monday = new Date(y, m, now.getDate() - ((now.getDay() + 6) % 7));
        from = which === 'this' ? monday : new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - 7);
        to = which === 'this' ? tomorrow : monday;
    }
    const iso = isoWeek(from);
    return {
        period: kind,
        span: which,
        from: from.getTime(),
        to: to.getTime(),
        last: new Date(to.getFullYear(), to.getMonth(), to.getDate() - 1).getTime(),
        year: kind === 'week' ? iso.year : from.getFullYear(),
        number: kind === 'week' ? iso.week : kind === 'month' ? from.getMonth() + 1 : from.getFullYear(),
        days: dayCount(from.getTime(), to.getTime()),
    };
}

/** Длинный период кусками не длиннее 200 дней: у такого куска обзор режет волну по суткам (waveBinHours), и видно каждый день */
export function recapPieces(from: number, to: number): Array<{ from: number; to: number; days: number }> {
    const days = dayCount(from, to);
    if (days <= 200) return [{ from, to, days }];
    const count = Math.ceil(days / 200);
    const size = Math.ceil(days / count);
    const start = new Date(from);
    const pieces: Array<{ from: number; to: number; days: number }> = [];
    for (let day = 0; day < days; day += size) {
        const a = new Date(start.getFullYear(), start.getMonth(), start.getDate() + day).getTime();
        const b = Math.min(to, new Date(start.getFullYear(), start.getMonth(), start.getDate() + day + size).getTime());
        pieces.push({ from: a, to: b, days: dayCount(a, b) });
    }
    return pieces;
}
/** Минуты по дням куска ровно на его число дней; волна куска крупнее суток — null */
export function recapDaily(part: unknown, days: number): number[] | null {
    if (!part || typeof part !== 'object') return null;
    const s = part as { heat?: unknown; wave?: { binHours?: unknown; bins?: unknown } };
    const binHours = num(s.wave?.binHours);
    if (!Array.isArray(s.wave?.bins) || binHours <= 0 || binHours > 24 || 24 % binHours !== 0) return null;
    const found = recapDays([], { binHours, bins: s.wave.bins.map(num) });
    return Array.from({ length: Math.max(0, days) }, (_, i) => found[i] ?? 0);
}
/** Минуты по месяцам от начала периода: первый элемент — месяц дня from */
export function recapMonths(from: number, daily: readonly number[]): number[] {
    const start = new Date(from);
    const months: number[] = [];
    daily.forEach((minutes, i) => {
        const at = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
        const index = (at.getFullYear() - start.getFullYear()) * 12 + at.getMonth() - start.getMonth();
        while (months.length <= index) months.push(0);
        months[index] += num(minutes);
    });
    return months;
}

export interface RecapPeople {
    me: { username: string; permalink: string; avatar: string } | null;
    avatars: Record<string, string>;
}
const picture = (value: unknown): string => (typeof value === 'string' && PICTURE.test(value) ? value : '');

/** Ответ страницы сайта о людях: ник, ссылка и аватарка человека, аватарки артистов по путям их страниц. Всё лишнее отбрасывается */
export function recapPeople(value: unknown, asked: readonly string[]): RecapPeople | null {
    if (!value || typeof value !== 'object') return null;
    const raw = value as { me?: unknown; avatars?: unknown };
    let me: RecapPeople['me'] = null;
    if (raw.me && typeof raw.me === 'object') {
        const person = raw.me as { username?: unknown; permalink?: unknown; avatar?: unknown };
        const username = typeof person.username === 'string' ? person.username.trim().slice(0, 100) : '';
        if (username) me = { username, permalink: typeof person.permalink === 'string' && PERMALINK.test(person.permalink) ? person.permalink : '', avatar: picture(person.avatar) };
    }
    const avatars: Record<string, string> = {};
    if (raw.avatars && typeof raw.avatars === 'object') {
        const given = raw.avatars as Record<string, unknown>;
        for (const path of asked) {
            if (!ARTIST_PATH.test(path) || !Object.prototype.hasOwnProperty.call(given, path)) continue;
            const url = picture(given[path]);
            if (url) avatars[path] = url;
        }
    }
    return { me, avatars };
}

// ===== Карточки сводки (2.11.0): характер недели, серия дней, пик и цвет карточки по имени =====
export type RecapArchetype = 'starter' | 'nightOwl' | 'loyal' | 'repeat' | 'explorer' | 'earlyBird' | 'marathon' | 'eclectic' | 'steady';
export interface RecapPalette {
    /** Яркий цвет пятна */
    a: string;
    /** Второе пятно, сдвинуто по тону */
    b: string;
    /** Глубокий фон */
    c: string;
}
export interface RecapInsights {
    archetype: RecapArchetype;
    /** Дней с музыкой */
    days: number;
    /** Самая длинная серия дней подряд с музыкой */
    streak: number;
    /** Час, в который музыки больше всего, 0..23; -1 — музыки не было */
    peakHour: number;
    /** Доли в процентах: главный артист по времени, ночь (0-5 ч), утро (5-10 ч), главный трек по прослушиваниям, новые артисты (-1 — история моложе периода) */
    topShare: number;
    nightShare: number;
    morningShare: number;
    trackShare: number;
    freshShare: number;
    /** Запасной цвет карточки по имени главного артиста: обложки нет или холст её не прочитал */
    palette: RecapPalette;
    /** Минуты по дням периода; пусто, когда дни не различить (полосы волны длиннее суток) */
    daily: number[];
    /** Минуты по месяцам от месяца начала периода; пусто без дней */
    months: number[];
}
interface RecapSource {
    from: number;
    to: number;
    /** Дни длинного периода, собранные по кускам (итоги года) */
    daily: unknown;
    heard: number;
    counted: number;
    artistCount: number;
    fresh: number;
    firstAt: number | null;
    artists: Array<{ name: string; ms: number }>;
    tracks: Array<{ plays: number }>;
    genres: Array<{ plays: number }>;
    heat: number[];
    wave: { binHours: number; bins: number[] };
}
const num = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
const share = (part: number, whole: number): number => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/** Минуты по суткам периода: из полос волны, если полоса не длиннее суток; иначе по дням недели из тепловой карты */
export function recapDays(heat: readonly number[], wave: { binHours: number; bins: readonly number[] } | null): number[] {
    if (wave && wave.binHours > 0 && wave.binHours <= 24 && 24 % wave.binHours === 0) {
        const per = 24 / wave.binHours;
        const days: number[] = [];
        for (let i = 0; i < wave.bins.length; i += per) days.push(wave.bins.slice(i, i + per).reduce((sum, minutes) => sum + num(minutes), 0));
        return days;
    }
    return Array.from({ length: 7 }, (_, day) => heat.slice(day * 24, day * 24 + 24).reduce((sum, minutes) => sum + num(minutes), 0));
}
/** Самая длинная серия дней подряд, где музыка была */
export function recapStreak(days: readonly number[]): number {
    let best = 0;
    let run = 0;
    for (const minutes of days) {
        run = minutes > 0 ? run + 1 : 0;
        best = Math.max(best, run);
    }
    return best;
}
/** Час пика по всем дням тепловой карты; -1 — тишина */
export function recapPeakHour(heat: readonly number[]): number {
    const hours = new Array<number>(24).fill(0);
    heat.forEach((minutes, i) => (hours[i % 24] += num(minutes)));
    const top = Math.max(...hours);
    return top > 0 ? hours.indexOf(top) : -1;
}
/** Доля минут в часах [from, to) по всем дням, в процентах */
function hoursShare(heat: readonly number[], from: number, to: number): number {
    let part = 0;
    let whole = 0;
    heat.forEach((minutes, i) => {
        const value = num(minutes);
        whole += value;
        if (i % 24 >= from && i % 24 < to) part += value;
    });
    return share(part, whole);
}

export interface RecapFacts {
    counted: number;
    heardMs: number;
    activeDays: number;
    nightShare: number;
    morningShare: number;
    topShare: number;
    trackShare: number;
    topPlays: number;
    freshShare: number;
    artistCount: number;
    genres: number;
    genreShare: number;
}
/** Характер недели: первое подходящее правило сверху вниз, самое редкое и яркое раньше */
export function recapArchetype(facts: RecapFacts): RecapArchetype {
    if (facts.counted < 5) return 'starter';
    if (facts.nightShare >= 35) return 'nightOwl';
    if (facts.topShare >= 40) return 'loyal';
    if (facts.topPlays >= 8 && facts.trackShare >= 20) return 'repeat';
    if (facts.freshShare >= 50 && facts.artistCount >= 8) return 'explorer';
    if (facts.morningShare >= 35) return 'earlyBird';
    if (facts.activeDays > 0 && facts.heardMs / facts.activeDays >= 3 * 3600000) return 'marathon';
    if (facts.genres >= 4 && facts.genreShare < 35) return 'eclectic';
    return 'steady';
}

/** Тон 0..359 из строки (FNV-1a): у одного артиста карточка всегда одного цвета */
export function recapHue(text: string): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0) % 360;
}
function hsl(h: number, s: number, l: number): string {
    const hue = (((h % 360) + 360) % 360) / 360;
    const sat = Math.max(0, Math.min(1, s));
    const light = Math.max(0, Math.min(1, l));
    const q = light < 0.5 ? light * (1 + sat) : light + sat - light * sat;
    const p = 2 * light - q;
    const channel = (t: number): string => {
        const x = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
        const v = x < 1 / 6 ? p + (q - p) * 6 * x : x < 1 / 2 ? q : x < 2 / 3 ? p + (q - p) * (2 / 3 - x) * 6 : p;
        return Math.round(v * 255).toString(16).padStart(2, '0');
    };
    return '#' + channel(hue + 1 / 3) + channel(hue) + channel(hue - 1 / 3);
}
/** Три цвета карточки от тона: яркое пятно, сосед по кругу и глубокий фон. Та же формула в history.js (paletteOf) для цвета обложки */
export function recapPalette(hue: number, saturation = 0.72): RecapPalette {
    const s = Math.max(0.35, Math.min(0.9, saturation));
    return { a: hsl(hue, s, 0.56), b: hsl(hue + 38, s * 0.92, 0.38), c: hsl(hue - 24, s * 0.8, 0.11) };
}

/** Личное в сводке: считается в main по ответу обзора, страница только рисует */
export function recapInsights(value: unknown): RecapInsights | null {
    if (!value || typeof value !== 'object') return null;
    const s = value as Partial<RecapSource>;
    if (!Array.isArray(s.heat) || !Array.isArray(s.artists) || !Array.isArray(s.tracks) || !Array.isArray(s.genres)) return null;
    const heat = s.heat.map(num);
    const wave = s.wave && Array.isArray(s.wave.bins) ? { binHours: num(s.wave.binHours), bins: s.wave.bins.map(num) } : null;
    // Дни периода: собранные по кускам, иначе из полос волны не длиннее суток (ровно на число календарных дней),
    // иначе по дням недели из тепловой карты — тогда по дням ничего не рисуется
    let days: number[];
    let perDay = true;
    if (Array.isArray(s.daily)) days = s.daily.map(num);
    else {
        days = recapDays(heat, wave);
        perDay = !!wave && wave.binHours > 0 && wave.binHours <= 24 && 24 % wave.binHours === 0;
        if (perDay && num(s.to) > num(s.from)) days = days.slice(0, Math.max(1, dayCount(num(s.from), num(s.to))));
    }
    const heard = num(s.heard);
    const counted = num(s.counted);
    const artistCount = num(s.artistCount);
    const top = s.artists[0];
    const genrePlays = s.genres.reduce((sum, genre) => sum + num(genre?.plays), 0);
    const known = s.firstAt !== null && s.firstAt !== undefined && num(s.from) > num(s.firstAt);
    const insights = {
        days: days.filter((minutes) => minutes > 0).length,
        streak: recapStreak(days),
        peakHour: recapPeakHour(heat),
        topShare: share(num(top?.ms), heard),
        nightShare: hoursShare(heat, 0, 5),
        morningShare: hoursShare(heat, 5, 10),
        trackShare: share(num(s.tracks[0]?.plays), counted),
        freshShare: known ? share(num(s.fresh), artistCount) : -1,
    };
    const archetype = recapArchetype({
        counted,
        heardMs: heard,
        activeDays: insights.days,
        nightShare: insights.nightShare,
        morningShare: insights.morningShare,
        topShare: insights.topShare,
        trackShare: insights.trackShare,
        topPlays: num(s.tracks[0]?.plays),
        freshShare: insights.freshShare,
        artistCount,
        genres: s.genres.length,
        genreShare: share(num(s.genres[0]?.plays), genrePlays),
    });
    const name = typeof top?.name === 'string' && top.name ? top.name : 'SoundCloud';
    return {
        archetype,
        ...insights,
        palette: recapPalette(recapHue(name)),
        daily: perDay ? days : [],
        months: perDay && num(s.from) > 0 ? recapMonths(num(s.from), days) : [],
    };
}
/** Ответ обзора с личным для карточек; не обзор — как есть */
export function withRecapInsights<T>(value: T): T | (T & { insights: RecapInsights }) {
    const insights = recapInsights(value);
    return insights ? { ...value, insights } : value;
}
