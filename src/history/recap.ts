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
 *  Карточка сводки (2.11.0) добавляет хвост: soundcloud-week-2026-40-artist.png; чужое имя карточки отбрасывается */
export function recapName(year: unknown, week: unknown, at: Date, card?: unknown): string {
    const pad = (n: number): string => String(n).padStart(2, '0');
    const valid = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
    const tail = typeof card === 'string' && RECAP_CARDS.includes(card) ? '-' + card : '';
    if (valid(year, 2020, 2100) && valid(week, 1, 53)) return 'soundcloud-week-' + year + '-' + pad(week) + tail + '.png';
    return 'soundcloud-week-' + at.getFullYear() + '-' + pad(at.getMonth() + 1) + '-' + pad(at.getDate()) + tail + '.png';
}
/** Карточки сводки по порядку: неделя, артист, трек, характер */
export const RECAP_CARDS: readonly string[] = ['week', 'artist', 'track', 'vibe'];

/** Прошлая неделя по местному времени: с понедельника до понедельника, номер по ISO (год по четвергу недели) */
export function lastWeek(now: Date): { from: number; to: number; id: string } {
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
    const start = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - 7);
    const year = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 3).getFullYear();
    const january = new Date(year, 0, 4);
    const first = new Date(year, 0, 4 - ((january.getDay() + 6) % 7));
    // Через переход на летнее время неделя короче или длиннее на час: округление это съедает
    const week = 1 + Math.round((start.getTime() - first.getTime()) / (7 * 86400000));
    return { from: start.getTime(), to: monday.getTime(), id: year + '-' + String(week).padStart(2, '0') };
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
}
interface RecapSource {
    from: number;
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
    const days = recapDays(heat, wave);
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
    return { archetype, ...insights, palette: recapPalette(recapHue(name)) };
}
/** Ответ обзора с личным для карточек; не обзор — как есть */
export function withRecapInsights<T>(value: T): T | (T & { insights: RecapInsights }) {
    const insights = recapInsights(value);
    return insights ? { ...value, insights } : value;
}
