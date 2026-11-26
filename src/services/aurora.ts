// Оформление: переливы WebGL за сайтом и стеклянные панели поверх них. Эффект, палитра, скорость, яркость, зерно,
// стекло и скругления настраиваются в F1 → Оформление и применяются без перезагрузки.
// Фон это один <canvas> на весь экран под содержимым сайта: полноэкранный треугольник и фрагментный шейдер выбранного
// эффекта. Палитра «Из обложки» берётся у трека в нижнем плеере (тот же разбор цвета, что у света волны, glowPalette).
// Рисуется с пониженным разрешением и ограничением кадров, на скрытом окне не рисуется вовсе, на паузе музыки замедляется.
// auroraPage уходит на страницу текстом: ссылается только на glowPalette, которая идёт объявлением рядом
import * as glowModule from './wave/glow';
import * as uiSoundModule from './uiSound';
import { polishCss } from './polish';

const { glowPalette } = glowModule;
const { createUiSound } = uiSoundModule;

export const AURORA_EFFECTS = ['off', 'liquid', 'aurora', 'mesh', 'silk', 'nebula', 'contour'] as const;
export const AURORA_PALETTES = ['cover', 'ocean', 'aurum', 'sunset', 'emerald', 'violet', 'ember', 'sakura', 'mono', 'custom'] as const;
export const AURORA_QUALITY = ['eco', 'balanced', 'high'] as const;
export type AuroraEffect = (typeof AURORA_EFFECTS)[number];
export type AuroraPaletteName = (typeof AURORA_PALETTES)[number];
export type AuroraQuality = (typeof AURORA_QUALITY)[number];

export interface Appearance {
    effect: AuroraEffect;
    palette: AuroraPaletteName;
    /** Свои три цвета для palette: 'custom' */
    colors: [string, string, string];
    /** 0..100 */
    speed: number;
    intensity: number;
    grain: number;
    /** Плотность стеклянных панелей 0..100 и размытие под ними в пикселях 0..40 */
    glass: number;
    blur: number;
    /** Скругления интерфейса 0..24 px */
    radius: number;
    quality: AuroraQuality;
    /** На паузе музыки переливы замедляются и притухают */
    calmOnPause: boolean;
    /** Фон слегка тянется за курсором */
    parallax: boolean;
    /** Подъём карточек и плавные наведения */
    hoverMotion: boolean;
    /** Под бит 0..100: скорость по темпу трека и разгон на дропах; 0 выключает */
    beat: number;
    /** Короткий звук на лайк */
    likeSound: boolean;
    /** Не снижать кадры и не ставить лучи на паузу, когда окно не в фокусе (свёрнутое окно всё равно стоит) */
    keepFramesUnfocused: boolean;
}

export const APPEARANCE_DEFAULTS: Appearance = {
    effect: 'liquid',
    palette: 'aurum',
    colors: ['#3a6bff', '#7a3cff', '#00c2ff'],
    speed: 35,
    intensity: 60,
    grain: 22,
    glass: 55,
    blur: 22,
    radius: 14,
    quality: 'balanced',
    calmOnPause: true,
    parallax: true,
    hoverMotion: true,
    beat: 40,
    likeSound: true,
    keepFramesUnfocused: false,
};

/** Положение ползунка «Интенсивность бита» 0..100 -> множитель 0..1. Кривая степенная: низ заметно тише, максимум прежний.
 *  Раньше множитель был value / 100 (65 давало 0.65), теперь 65 даёт 0.5, а умолчание 40 — 0.23; сохранённые значения
 *  не пересчитываются, ползунок просто мягче. Функция уходит на страницу текстом, поэтому ни от чего снаружи не зависит */
export function beatAmount(value: number): number {
    const v = Number(value);
    if (!(v > 0)) return 0;
    return Math.pow(Math.min(100, v) / 100, 1.6);
}

/** Состояние повтора по классам кнопки сайта: m-one повтор трека, m-all повтор очереди. Уходит на страницу текстом */
export function repeatMode(classes: string): 'off' | 'one' | 'all' {
    const list = String(classes).split(/\s+/);
    return list.includes('m-one') ? 'one' : list.includes('m-all') ? 'all' : 'off';
}

/** Подсказка кнопки повтора. Уходит на страницу текстом */
export function repeatLabel(mode: 'off' | 'one' | 'all', ru: boolean): string {
    const names = ru ? { off: 'выкл', all: 'очередь', one: 'трек' } : { off: 'off', all: 'queue', one: 'track' };
    return (ru ? 'Повтор: ' : 'Repeat: ') + names[mode];
}

/** Нужно ли экономить кадры без фокуса: да, если окно не в фокусе и пользователь не включил «Не ограничивать кадры».
 *  Уходит на страницу текстом, поэтому ни от чего снаружи не зависит */
export function shouldThrottleIdle(idle: boolean, keepFramesUnfocused: boolean, recording?: boolean): boolean {
    // Во время записи ролика окно считается в фокусе: экран снимают, и фон не должен рваться до 8 к/с
    return idle === true && keepFramesUnfocused !== true && recording !== true;
}

/** Готовые палитры: три цвета, первый главный */
export const PALETTES: Record<Exclude<AuroraPaletteName, 'cover' | 'custom'>, [string, string, string]> = {
    ocean: ['#1b4dff', '#0a1f7a', '#2fb8ff'],
    aurum: ['#2350ff', '#0b1540', '#6f8bff'],
    sunset: ['#ff5e3a', '#ff2d87', '#ffb347'],
    emerald: ['#00c48c', '#0a6b6b', '#7dffb3'],
    violet: ['#8a3cff', '#3a0ca3', '#ff5cf0'],
    ember: ['#ff5500', '#8a1c00', '#ffb000'],
    sakura: ['#ff8ab8', '#7a4cff', '#ffd1e3'],
    mono: ['#9aa4b8', '#2a2f3a', '#e6ebf5'],
};

const isHex = (value: unknown): value is string => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
const isNumberIn = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

/** Ввод из F1 и из хранилища: известные поля нужных типов, остальное по умолчанию */
export function normalizeAppearance(input: unknown): Appearance {
    const value = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
    const pick = <T extends string>(list: readonly T[], item: unknown, fallback: T): T => list.find((entry) => entry === item) ?? fallback;
    const num = (key: keyof Appearance, min: number, max: number): number => {
        const item = value[key];
        return isNumberIn(item, min, max) ? Math.round(item) : (APPEARANCE_DEFAULTS[key] as number);
    };
    const colors = Array.isArray(value.colors) && value.colors.length === 3 && value.colors.every(isHex) ? (value.colors.map((c: string) => c.toLowerCase()) as [string, string, string]) : APPEARANCE_DEFAULTS.colors;
    const bool = (key: 'calmOnPause' | 'parallax' | 'hoverMotion' | 'likeSound' | 'keepFramesUnfocused'): boolean => (typeof value[key] === 'boolean' ? (value[key] as boolean) : APPEARANCE_DEFAULTS[key]);
    return {
        effect: pick(AURORA_EFFECTS, value.effect, APPEARANCE_DEFAULTS.effect),
        palette: pick(AURORA_PALETTES, value.palette, APPEARANCE_DEFAULTS.palette),
        colors,
        speed: num('speed', 0, 100),
        intensity: num('intensity', 0, 100),
        grain: num('grain', 0, 100),
        glass: num('glass', 0, 100),
        blur: num('blur', 0, 40),
        radius: num('radius', 0, 24),
        quality: pick(AURORA_QUALITY, value.quality, APPEARANCE_DEFAULTS.quality),
        calmOnPause: bool('calmOnPause'),
        parallax: bool('parallax'),
        hoverMotion: bool('hoverMotion'),
        beat: num('beat', 0, 100),
        likeSound: bool('likeSound'),
        keepFramesUnfocused: bool('keepFramesUnfocused'),
    };
}

/** Строгая проверка смены из F1: объект, который normalizeAppearance не меняет */
export function isAppearance(input: unknown): input is Appearance {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
    return JSON.stringify(normalizeAppearance(input)) === JSON.stringify(sortKeys(input as Record<string, unknown>));
}
function sortKeys(value: Record<string, unknown>): Record<string, unknown> {
    const order = Object.keys(APPEARANCE_DEFAULTS);
    if (Object.keys(value).length !== order.length || !order.every((key) => key in value)) return {};
    return Object.fromEntries(order.map((key) => [key, value[key]]));
}

/** Состояние детектора бита: огибающие баса, вспышка, моменты ударов и темп */
export interface BeatState {
    fast: number;
    slow: number;
    level: number;
    pulse: number;
    last: number;
    beats: number[];
    bpm: number;
    /** Громкость за 0,4 с и за 8 с: дроп это когда первая заметно выше второй */
    short: number;
    long: number;
    /** 0..1, плавно: 1 во время дропа */
    drop: number;
    /** Среднее и разброс всплесков баса за ~1,5 с: из них порог удара */
    mean: number;
    dev: number;
    /** Шаг ровного ритма в мс для дорисовки пропущенных ударов; 0, если ритм не ровный */
    period: number;
    /** Сколько ударов подряд дорисовано по темпу */
    ghosts: number;
}
export function beatInit(): BeatState {
    return { fast: 0, slow: 0, level: 0, pulse: 0, last: -1e9, beats: [], bpm: 0, short: 0, long: 0, drop: 0, mean: 0, dev: 0, period: 0, ghosts: 0 };
}
/** Шаг детектора (пересобран в 2.8.0): bass и level 0..1 в момент now (мс), dt с прошлого шага.
 *  Удар это всплеск баса над его же огибающей за последние ~0,1 с, а порог подстраивается под трек: среднее всплесков
 *  за полторы секунды плюс их разброс. Так удар ловится в тихом и в плотном месте одинаково, а ровный гул бас-линии
 *  не даёт ложных. Когда темп известен, пауза после удара больше половины такта: шестнадцатые и хэты между ударами
 *  не считаются. Пропущенный удар (бочка утонула в миксе) дорисовывается по темпу слабой вспышкой, не больше двух подряд.
 *  Темп по медиане промежутков последних ударов, сведённый в 80..170 ударов в минуту. Возвращает true на настоящем ударе */
export function beatStep(state: BeatState, bass: number, level: number, now: number, dt: number): boolean {
    const ema = (value: number, target: number, tau: number): number => value + (target - value) * (1 - Math.exp(-dt / tau));
    // Первый отсчёт после тишины ставит обе огибающие сразу: иначе разгон медленной даёт ложные удары
    if (state.fast === 0 && state.slow === 0) state.fast = state.slow = bass;
    // Всплеск считается против огибающей до этого отсчёта: сам удар её ещё не поднял
    const rise = Math.max(0, bass - state.fast);
    state.fast = ema(state.fast, bass, 110);
    state.slow = ema(state.slow, bass, 900);
    state.level = ema(state.level, level, 600);
    state.short = ema(state.short, level, 400);
    state.long = ema(state.long, level, 8000);
    // Дроп: громкость за последние полсекунды на треть выше средней за 8 с. Входит за ~1 с, выходит за ~2,5 с
    const dropping = state.short > state.long * 1.35 + 0.02 && state.short > 0.2 ? 1 : 0;
    state.drop = ema(state.drop, dropping, dropping > state.drop ? 900 : 2500);
    state.pulse *= Math.exp(-dt / 170);
    const threshold = state.mean + 2.2 * state.dev + 0.035;
    state.mean = ema(state.mean, rise, 1500);
    state.dev = ema(state.dev, Math.abs(rise - state.mean), 1500);
    const refractory = state.period ? Math.max(190, state.period * 0.55) : 230;
    let hit = false;
    if (rise > threshold && now - state.last > refractory) {
        hit = true;
        state.last = now;
        state.ghosts = 0;
        state.pulse = Math.min(1, 0.55 + rise * 2.2);
        state.beats.push(now);
        if (state.beats.length > 16) state.beats.shift();
    } else if (state.period && state.ghosts < 2 && now - state.last > state.period * 1.12 && state.short > 0.08) {
        // Удар по темпу не пришёл: слабая вспышка в его место, фаза сохраняется
        state.last += state.period;
        state.ghosts++;
        state.pulse = Math.max(state.pulse, 0.4);
    }
    const recent = state.beats.filter((at) => now - at < 8000);
    if (recent.length >= 5) {
        const gaps = recent.slice(1).map((at, i) => at - recent[i]).sort((a, b) => a - b);
        const gap = gaps[gaps.length >> 1];
        let bpm = 60000 / gap;
        while (bpm < 80) bpm *= 2;
        while (bpm > 170) bpm /= 2;
        state.bpm = state.bpm ? state.bpm + (bpm - state.bpm) * 0.15 : bpm;
        // Шаг дорисовки только для ровного ритма: половина промежутков рядом с медианой
        const steady = gaps.filter((item) => Math.abs(item - gap) < gap * 0.12).length >= gaps.length / 2;
        state.period = steady && gap >= 300 && gap <= 800 ? gap : 0;
    } else if (now - state.last > 4000) {
        state.bpm = 0;
        state.period = 0;
    }
    return hit;
}

/** Темп по форме волны трека, когда анализатор слышит тишину (зашифрованный поток): автокорреляция огибающей в диапазоне
 *  80..170 ударов в минуту, период с дробной точностью. null, если ритма не видно или отсчёты слишком редкие.
 *  Функция уходит на страницу текстом вместе с beatStep, поэтому ни от чего снаружи не зависит */
export function envelopeTempo(raw: number[], duration: number): { period: number } | null {
    const n = raw.length;
    if (n < 64 || !(duration > 0)) return null;
    const step = duration / n;
    let mean = 0;
    for (let i = 0; i < n; i++) mean += raw[i];
    mean /= n;
    let energy = 0;
    const x = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        x[i] = raw[i] - mean;
        energy += x[i] * x[i];
    }
    if (energy <= 0) return null;
    const minLag = Math.max(2, Math.floor(60000 / 170 / step));
    const maxLag = Math.ceil(60000 / 80 / step);
    if (maxLag + 2 >= n / 2 || minLag >= maxLag) return null;
    const score: number[] = [];
    for (let lag = minLag - 1; lag <= maxLag + 1; lag++) {
        let sum = 0;
        for (let i = 0; i + lag < n; i++) sum += x[i] * x[i + lag];
        score[lag] = sum / energy;
    }
    let best = minLag;
    for (let lag = minLag; lag <= maxLag; lag++) if (score[lag] > score[best]) best = lag;
    if (!(score[best] > 0.1)) return null;
    // Вершина параболы по трём соседним отсчётам: период не округляется до шага формы волны
    const a = score[best - 1];
    const b = score[best];
    const c = score[best + 1];
    const bend = a - 2 * b + c;
    const shift = bend < 0 ? (0.5 * (a - c)) / bend : 0;
    return { period: (best + Math.max(-0.5, Math.min(0.5, shift))) * step };
}

/** Три цвета палитры; у «Из обложки» это цвета до первой обложки */
export function paletteColors(appearance: Appearance): [string, string, string] {
    if (appearance.palette === 'custom') return appearance.colors;
    if (appearance.palette === 'cover') return PALETTES.aurum;
    return PALETTES[appearance.palette];
}

// Общие функции шейдеров: шум и fbm
const GLSL_COMMON = `
precision mediump float;
uniform vec2 u_res;
uniform float u_time;
uniform vec3 u_c1;
uniform vec3 u_c2;
uniform vec3 u_c3;
uniform float u_intensity;
uniform float u_grain;
uniform vec2 u_mouse;
uniform float u_seed;
uniform float u_pulse;
uniform float u_energy;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }
float fbm(vec2 p){ float v = 0.0; float a = 0.5; mat2 r = mat2(0.8, -0.6, 0.6, 0.8); for (int i = 0; i < 5; i++) { v += a * noise(p); p = r * p * 2.02 + 3.1; a *= 0.5; } return v; }
vec3 base(){ return mix(vec3(0.012, 0.016, 0.035), u_c2 * 0.08, 0.6); }
vec3 finish(vec3 col, vec2 uv){
  vec2 q = uv - 0.5; col *= 1.0 - dot(q, q) * 0.9;
  col *= 1.0 + 0.22 * u_energy;
  // Клуб за стеной: на ударе бас подсвечивает низ кадра цветом палитры и чуть толкает яркость
  col += u_c1 * u_pulse * 0.16 * smoothstep(0.75, 0.0, uv.y);
  col *= 1.0 + 0.1 * u_pulse;
  col = mix(base(), col, u_intensity);
  col = col / (1.0 + col * 0.55);
  col += (hash(gl_FragCoord.xy + fract(u_time * 7.0) * 100.0) - 0.5) * u_grain * 0.12;
  return clamp(col, 0.0, 1.0);
}
`;

/** Фрагментные шейдеры эффектов: каждый задаёт vec3 effect(vec2 uv, vec2 p), p это координаты с учётом пропорций */
export const SHADERS: Record<Exclude<AuroraEffect, 'off'>, string> = {
    // Жидкость: fbm с двойным искажением координат, глубокие тёмные провалы и светлые жилы
    liquid: `
vec3 effect(vec2 uv, vec2 p){
  float t = u_time * 0.06;
  vec2 q = vec2(fbm(p * 1.4 + vec2(0.0, t)), fbm(p * 1.4 + vec2(5.2, -t)));
  vec2 r = vec2(fbm(p * 1.6 + 3.5 * q + vec2(1.7, 9.2) + t * 1.3), fbm(p * 1.6 + 3.5 * q + vec2(8.3, 2.8) - t));
  float f = fbm(p * 1.2 + 3.0 * r);
  vec3 col = mix(base(), mix(u_c2, u_c1, 0.45) * 0.9, smoothstep(0.15, 0.85, f));
  col = mix(col, u_c1 * 1.15, smoothstep(0.5, 1.05, length(q)) * 0.9);
  col = mix(col, u_c3, pow(smoothstep(0.5, 1.0, r.x), 2.0) * 0.75);
  float vein = pow(smoothstep(0.55, 0.95, f), 3.0);
  col += mix(u_c3, vec3(0.85, 0.9, 1.0), 0.35) * vein * 0.9;
  return col * (0.6 + 0.7 * f);
}`,
    // Северное сияние: вертикальные шторы из шума, яркие у кромки, над тёмным небом с редкими звёздами
    aurora: `
vec3 effect(vec2 uv, vec2 p){
  float t = u_time * 0.08;
  vec3 col = base();
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float x = p.x * (1.2 + fi * 0.35) + fbm(vec2(p.x * 0.8 + t * (0.6 + fi * 0.2), fi * 3.1)) * 2.2;
    float band = fbm(vec2(x, t * 0.5 + fi));
    float h = 0.15 + 0.32 * fi / 2.0 + band * 0.45;
    float y = uv.y - h;
    float curtain = exp(-max(y, 0.0) * (5.5 - fi)) * smoothstep(-0.02, 0.06, y) * (0.35 + 0.65 * noise(vec2(x * 5.0, t * 3.0)));
    vec3 c = i == 0 ? u_c1 : i == 1 ? u_c3 : u_c2 * 1.6;
    col += c * curtain * (0.9 - fi * 0.18);
  }
  float star = step(0.9975, hash(floor(gl_FragCoord.xy * 0.5))) * smoothstep(0.35, 1.0, uv.y);
  return col + star * 0.6;
}`,
    // Мягкая сетка: четыре крупных пятна медленно плавают и смешиваются, как градиенты в macOS
    mesh: `
vec3 effect(vec2 uv, vec2 p){
  float t = u_time * 0.07;
  vec2 a = vec2(0.25 + 0.2 * sin(t * 1.1), 0.3 + 0.2 * cos(t * 0.9));
  vec2 b = vec2(0.75 + 0.18 * cos(t * 0.7 + 1.0), 0.35 + 0.22 * sin(t * 1.3));
  vec2 c = vec2(0.6 + 0.2 * sin(t * 0.8 + 2.0), 0.8 + 0.15 * cos(t * 1.2));
  vec2 d = vec2(0.2 + 0.15 * cos(t * 1.4 + 3.0), 0.8 + 0.12 * sin(t * 0.6));
  vec2 w = uv + (vec2(fbm(uv * 2.0 + t), fbm(uv * 2.0 - t)) - 0.5) * 0.18;
  float ka = exp(-dot(w - a, w - a) * 7.0);
  float kb = exp(-dot(w - b, w - b) * 6.0);
  float kc = exp(-dot(w - c, w - c) * 7.5);
  float kd = exp(-dot(w - d, w - d) * 9.0);
  vec3 col = base() + u_c1 * ka + u_c2 * 1.4 * kb + u_c3 * kc * 0.9 + mix(u_c1, u_c3, 0.5) * kd * 0.7;
  return col * 0.9;
}`,
    // Шёлк: складки ткани из искажённых синусов с бликом на гребнях
    silk: `
vec3 effect(vec2 uv, vec2 p){
  float t = u_time * 0.12;
  vec2 q = p * 2.1;
  q += 0.45 * vec2(sin(q.y * 1.7 + t), cos(q.x * 1.3 - t * 0.8));
  q += 0.25 * vec2(sin(q.y * 3.1 - t * 1.2), cos(q.x * 2.7 + t));
  float s = sin(q.x * 2.6 + q.y * 1.9 + fbm(q + t * 0.3) * 3.0);
  float fold = 0.5 + 0.5 * s;
  float sheen = pow(max(0.0, sin(q.x * 2.6 + q.y * 1.9 + 0.6 + fbm(q + t * 0.3) * 3.0)), 14.0);
  vec3 col = mix(base(), mix(u_c2 * 1.1, u_c1, fold), 0.3 + 0.7 * fold);
  col += u_c3 * sheen * 0.8;
  return col * (0.45 + 0.55 * fold);
}`,
    // Туманность: облака пыли из fbm, яркое ядро цвета палитры и звёзды
    nebula: `
vec3 effect(vec2 uv, vec2 p){
  float t = u_time * 0.025;
  vec2 q = p * 1.1 + vec2(t, -t * 0.6);
  float n1 = fbm(q + fbm(q * 1.7 + t));
  float n2 = fbm(q * 2.3 - vec2(t * 1.5, 0.0) + n1);
  vec3 col = base();
  col += mix(u_c2, u_c1, 0.4) * 1.3 * smoothstep(0.3, 0.85, n1);
  col += u_c1 * pow(smoothstep(0.4, 0.95, n2), 2.0) * 1.6;
  col += u_c3 * pow(n1 * n2, 3.0) * 2.0;
  float s = hash(floor(gl_FragCoord.xy * 0.7));
  col += step(0.997, s) * (0.4 + 0.6 * sin(u_time * 2.0 + s * 50.0)) * 0.8;
  return col;
}`,
    // Контуры: светящиеся изолинии медленно текущего рельефа, как топографическая карта
    contour: `
vec3 effect(vec2 uv, vec2 p){
  float t = u_time * 0.05;
  float h = fbm(p * 1.3 + vec2(t, t * 0.7)) + 0.35 * fbm(p * 3.0 - t);
  float lines = abs(fract(h * 14.0) - 0.5);
  float w = fwidthApprox(h * 14.0);
  float line = 1.0 - smoothstep(0.0, w * 1.6, lines);
  vec3 col = mix(base(), u_c2 * 0.35, h);
  vec3 lc = mix(u_c1, u_c3, smoothstep(0.3, 0.8, h));
  col += lc * line * (0.35 + 0.65 * smoothstep(0.2, 0.9, h));
  return col;
}`,
};

// Без расширения OES_standard_derivatives ширина линии считается по разрешению
const FWIDTH = 'float fwidthApprox(float v){ return 0.025 + 300.0 / u_res.y * 0.01; }\n';

/** Полный исходник фрагментного шейдера эффекта */
export function fragmentSource(effect: Exclude<AuroraEffect, 'off'>): string {
    return (
        GLSL_COMMON +
        FWIDTH +
        SHADERS[effect] +
        `
void main(){
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 p = (gl_FragCoord.xy - 0.5 * u_res) / min(u_res.x, u_res.y) + u_mouse * 0.04 + u_seed;
  gl_FragColor = vec4(finish(effect(uv, p), uv), 1.0);
}`
    );
}

/** Стекло и мелкая моторика поверх сайта. Селекторы тёмной темы SoundCloud; без эффекта фон сайта остаётся сплошным */
export function appearanceCss(appearance: Appearance): string {
    const a = appearance;
    const on = a.effect !== 'off';
    const glass = (a.glass / 100).toFixed(3);
    const panel = `rgba(14,16,26,${(0.25 + (a.glass / 100) * 0.55).toFixed(3)})`;
    const surface = `rgba(255,255,255,${(0.03 + (a.glass / 100) * 0.05).toFixed(3)})`;
    const blur = `blur(${a.blur}px) saturate(1.4)`;
    const r = a.radius;
    const rows: string[] = [
        `:root{--sca-radius:${r}px;--sca-glass:${glass};--sca-panel:${panel};--sca-surface:${surface}}`,
        // Скругления: обложки, кнопки, поля, всплывающие меню
        `.sc-artwork,.image__full,.sc-artwork span,.playbackSoundBadge__avatar,.sound__coverArt,.badgeList__item .sc-artwork{border-radius:${Math.max(0, r - 6)}px!important;overflow:hidden}`,
        `.sc-button,.sc-button-medium,.sc-button-small,.sc-button-follow,.sc-button-play{border-radius:${Math.min(r, 12)}px!important}`,
        `.headerSearch__input,.sc-input,input.sc-input,textarea.sc-input{border-radius:${r}px!important}`,
        `.dropdownMenu,.moreActions,.dialog,.modal__modal,.dropbar{border-radius:${r}px!important;overflow:hidden}`,
        'html{scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.18) transparent}',
        '::selection{background:color-mix(in srgb,var(--sca-c1,#3a6bff) 45%,transparent)}',
    ];
    if (on) {
        rows.push(
            // Фон сайта прозрачный: под ним холст переливов
            'html{background:#04060c!important}',
            `:root{--background-base:transparent!important;--background-surface:${surface}!important}`,
            'body,#app,#content,.l-container,.l-main,.l-content,.l-fluid-fixed,.l-fixed-fluid,.l-sidebar-right,.l-sidebar-left,.l-collection,.l-user-main,.l-about-main,.l-listen-wrapper,.l-front-content,.l-product-banner,.l-hero,.l-inner-fullwidth,.l-full-width,.l-fixed-top-one-column,.l-content-wrapper,.l-col-2,.modular-home{background:transparent!important;background-color:transparent!important}',
            '#sca-bg{position:fixed;inset:0;width:100vw;height:100vh;z-index:-1;pointer-events:none;display:block;opacity:0;transition:opacity 1.2s ease}',
            '#sca-bg.on{opacity:1}',
            // Шапка сайта и плеер снизу: стекло
            // Стекло только у полосы во всю ширину окна: внутренние контейнеры сайта (1240px по центру) прозрачные, иначе
            // второй слой стекла рисует тёмный прямоугольник с резкими краями поверх полосы
            `.header{background:${panel}!important;backdrop-filter:${blur};-webkit-backdrop-filter:${blur};border-bottom:1px solid rgba(255,255,255,.06)!important;box-shadow:none!important}`,
            `.header__inner,.header__background{background:transparent!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;border:0!important;box-shadow:none!important}`,
            `.header__inner{height:auto!important;max-height:100%}`,
            `.playControls__inner{background:${panel}!important;backdrop-filter:${blur};-webkit-backdrop-filter:${blur};border-top:1px solid rgba(255,255,255,.07)!important}`,
            `.playControls__bg,.playControls__wrapper{background:transparent!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;border:0!important}`,
            // Боковые колонки, модули и всплывающее: мягкие стеклянные карточки
            `.sidebarModule,.l-sidebar-right .sidebarModule,.dropdownMenu,.moreActions,.dropbar,.queue,.modal__modal,.dialog{background:${panel}!important;backdrop-filter:${blur};-webkit-backdrop-filter:${blur}}`,
            `.sidebarModule{border-radius:${r}px;padding:4px 12px!important;margin-bottom:16px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.06)}`,
            `.l-listen-hero,.fullHero,.profileHeader,.fullListenHero{border-radius:${r}px;overflow:hidden;margin-top:8px}`,
            `.headerSearch__input{background:rgba(255,255,255,.07)!important;border:1px solid rgba(255,255,255,.08)!important}`,
            // Библиотека (2.12.8): вкладки таблеткой в стиле клиента, секции без жёстких линий, плитки-карточки со стеклом
            `.collectionNav,.g-tabs{display:flex;flex-wrap:wrap;gap:6px;border:0!important;padding:4px 0 6px!important;margin:0 0 12px!important}`,
            `.collectionNav .g-tabs-item,.g-tabs .g-tabs-item{margin:0!important;border:0!important}`,
            `.collectionNav .g-tabs-link,.g-tabs .g-tabs-link{display:inline-flex!important;align-items:center;height:36px;padding:0 16px!important;border:0!important;border-radius:999px;font-weight:600;font-size:14px;color:rgba(255,255,255,.7)!important;background:rgba(255,255,255,.06);box-shadow:inset 0 0 0 1px rgba(255,255,255,.07);transition:background-color .16s ease,color .16s ease,transform .16s ease}`,
            `.collectionNav .g-tabs-link:hover,.g-tabs .g-tabs-link:hover{background:rgba(255,255,255,.12);color:#fff!important}`,
            `.collectionNav .g-tabs-link.active,.g-tabs .g-tabs-link.active{background:#fff!important;color:#0b0c10!important;box-shadow:none}`,
            `.collectionNav .g-tabs-link::after,.g-tabs .g-tabs-link::after,.g-tabs .g-tabs-link::before{display:none!important}`,
            `.collectionSection{margin-bottom:28px!important;border:0!important}`,
            `.collectionSection__title,.collectionSection__titleLink{font-size:20px!important;font-weight:700!important;letter-spacing:-.2px}`,
            // Карточка одна: если в пункте списка лежит плитка, стекло у плитки, а пункт без подложки (иначе две рамки одна в другой)
            `.collectionSection .badgeList__item:not(:has(.playableTile)),.collectionSection .playableTile{padding:10px!important;border-radius:${r}px;background:rgba(255,255,255,.04);box-shadow:inset 0 0 0 1px rgba(255,255,255,.06);transition:background-color .18s ease,transform .18s ease}`,
            `.collectionSection .badgeList__item:has(.playableTile){padding:0!important;height:auto!important;background:none!important;box-shadow:none!important;transform:none!important}`,
            `.collectionSection .badgeList__item:not(:has(.playableTile)):hover,.collectionSection .playableTile:hover{background:rgba(255,255,255,.09)}`,
            `.collectionSection .playableTile__artwork,.collectionSection .sc-artwork{border-radius:${Math.max(6, r - 6)}px!important;overflow:hidden}`,
            // Строки списков: лёгкая подложка на наведении
            `.soundList__item:hover,.trackList__item:hover,.compactTrackList__item:hover,.systemPlaylistTrackList__item:hover{background:rgba(255,255,255,.04)!important;border-radius:${Math.max(4, r - 4)}px}`,
            // Блок волны и строка по описанию: стекло вокруг
        );
    }
    // Нижний бар: свечение и дыхание
    // обложки, пока играет музыка; на паузе обложки чуть уменьшаются и тускнеют
    rows.push(
        'html.scm-resizing *,html.scm-resizing *::before,html.scm-resizing *::after{animation-play-state:paused!important;transition:none!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}',
        '.playbackTimeline__progressWrapper{position:relative}',
        '.playControls__inner{position:relative}',
        '.playControls__inner::before{content:"";position:absolute;left:0;right:0;top:-1px;height:1px;pointer-events:none;background:linear-gradient(90deg,transparent,var(--sca-c1,#ff5500),var(--sca-c3,#ff9a52),transparent);opacity:0;transition:opacity .8s ease}',
        'html.sca-playing .playControls__inner::before{opacity:calc(.5 + var(--sca-drop,0) * .5);transition:opacity 1.2s ease}',
        'html.sca-playing .playControls__inner{box-shadow:0 -24px 70px -34px var(--sca-c1,#ff5500)}',
        '.playbackSoundBadge__avatar{transition:transform .4s cubic-bezier(.2,0,0,1),box-shadow .4s ease,filter .4s ease}',
        'html:not(.sca-playing) .playbackSoundBadge__avatar{transform:scale(.92);filter:saturate(.85)}',
        'html.sca-playing .playbackSoundBadge__avatar{transform:none;box-shadow:0 0 18px -6px var(--sca-c1,#ff5500)}',
        'html:not(.sca-playing) #sc-wave .scw-cover{transform:scale(.96)!important;filter:saturate(.85)}',
        '#sc-wave .scw-cover{transition:transform .4s cubic-bezier(.2,0,0,1),filter .4s ease!important}',
        'a.soundTitle__title:hover,a.playbackSoundBadge__titleLink:hover,a.sc-link-primary:hover{color:color-mix(in srgb,var(--sca-c1,#ff5500) 45%,#fff)!important}',
        '@media (prefers-reduced-motion:reduce){.playbackSoundBadge__avatar,#sc-wave .scw-cover{transition:none!important;transform:none!important}}',
    );
    // Дизайн-система SoundCloud 2: белые главные кнопки и стекло, один мягкий акцент из обложки, без градиентов. Карточки большие, с обложкой на всю площадь, подсветкой за курсором (--mx, --my
    // ставит переливам pointermove). Цвет обложки в фоне карточки волны (--sca-cover)
    const panelAlpha = (0.38 + (a.glass / 100) * 0.4).toFixed(3);
    rows.push(
        `:root{--sc2-surface-1:rgba(255,255,255,.05);--sc2-surface-2:rgba(255,255,255,.085);--sc2-surface-3:rgba(255,255,255,.14);--sc2-line:rgba(255,255,255,.1);` +
            `--sc2-text:#fff;--sc2-text-2:rgba(255,255,255,.72);--sc2-text-3:rgba(255,255,255,.48);` +
            `--sc2-vice:#fff;--sc2-vice-soft:rgba(255,255,255,.1);` +
            `--sc2-ink:#0b0c10;--sc2-accent:color-mix(in srgb,var(--sca-c1,#8aa0ff) 55%,#fff);--sc2-panel:rgba(12,14,22,${panelAlpha});--sc2-blur:blur(${a.blur}px) saturate(1.4);` +
            `--sc2-r1:${Math.max(6, Math.round(r * 0.6))}px;--sc2-r2:${Math.max(8, Math.round(r * 0.9))}px;--sc2-r3:${Math.round(r * 1.15)}px;--sc2-r4:${Math.round(r * 1.7)}px;` +
            `--sc2-fast:140ms;--sc2-mid:240ms;--sc2-ease:cubic-bezier(.2,.8,.2,1);--sc2-shadow:0 24px 60px -24px rgba(0,0,0,.85)}`,
        // Главная кнопка: белая с тёмным текстом, на наведении чуть светлеет тень, нажатие проседает
        `.sc2-cta{background:#fff!important;color:var(--sc2-ink)!important;font-weight:700!important;box-shadow:0 8px 22px -12px rgba(0,0,0,.8)!important;transition:transform var(--sc2-fast) var(--sc2-ease),box-shadow var(--sc2-mid)!important}`,
        `.sc2-cta:hover{box-shadow:0 10px 26px -10px rgba(0,0,0,.9)!important}`,
        `.sc2-cta:active{transform:scale(.97)}`,
        // Меню по правому клику, подсказки и тосты волны
        `.scw-menu{background:var(--sc2-panel)!important;backdrop-filter:var(--sc2-blur);-webkit-backdrop-filter:var(--sc2-blur);border:0!important;border-radius:var(--sc2-r3)!important;padding:6px!important;box-shadow:var(--sc2-shadow),inset 0 0 0 1px var(--sc2-line)!important;min-width:240px}`,
        `.scw-menu .scw-mi{height:36px!important;padding:0 12px!important;border-radius:var(--sc2-r1)!important;border:0!important;background:none!important;color:var(--sc2-text-2)!important;font-weight:600!important;transition:background var(--sc2-fast),color var(--sc2-fast)}`,
        `.scw-menu .scw-mi:hover,.scw-menu .scw-mi:focus-visible{background:var(--sc2-vice-soft)!important;color:#fff!important;outline:none!important}`,
        `.scw-toast{background:var(--sc2-panel)!important;backdrop-filter:var(--sc2-blur);-webkit-backdrop-filter:var(--sc2-blur);border-radius:999px!important;padding:11px 20px!important;box-shadow:var(--sc2-shadow),inset 0 0 0 1px var(--sc2-line)!important;color:#fff!important;font-weight:600}`,
        `.scw-toast .scw-undo{color:var(--sc2-accent)!important}`,
        `.scw-tip{background:var(--sc2-panel)!important;backdrop-filter:var(--sc2-blur);border-radius:var(--sc2-r1)!important;box-shadow:inset 0 0 0 1px var(--sc2-line)!important}`,
        `.sc-button-small,.sc-button-medium{border-radius:999px!important}`,
        `.sc-button-selected,.playbackSoundBadge__like.sc-button-selected,.sc-button-like.sc-button-selected{color:var(--sc2-accent)!important}`,
        // Подсветка за курсором у всех карточек: мягкое пятно цвета там, где мышь
        `.sc2-spot{position:relative;isolation:isolate}`,
        `.sc2-spot::before{content:"";position:absolute;inset:0;z-index:-1;border-radius:inherit;pointer-events:none;opacity:0;transition:opacity var(--sc2-mid);background:radial-gradient(260px circle at var(--mx,50%) var(--my,50%),rgba(255,255,255,.09),transparent 70%)}`,
        `.sc2-spot:hover::before{opacity:1}`,
        // Боковые колонки сайта: карточки-стекло, обложки скруглены, строки подсвечиваются
        `.sidebarModule{border-radius:var(--sc2-r4)!important;padding:8px 14px 4px!important;background:var(--sc2-panel)!important;backdrop-filter:var(--sc2-blur);-webkit-backdrop-filter:var(--sc2-blur);box-shadow:inset 0 0 0 1px var(--sc2-line)!important}`,
        `.sidebarModule .soundBadge .sc-artwork,.sidebarModule .sc-artwork{border-radius:var(--sc2-r1)!important;overflow:hidden}`,
        // Кнопки у трека в правой колонке (2.8.6): у сайта под ними сплошной градиент #121212, чтобы закрыть текст.
        // На стеклянной плашке он лежал тёмным прямоугольником. Теперь фона нет, текст под кнопками плавно растворяется,
        // а сами кнопки стеклянные круги
        `.sidebarModule .soundBadge__additional{background:none!important}`,
        `.sidebarModule .soundBadge .soundTitle,.sidebarModule .soundBadge .soundStats{transition:-webkit-mask-position .2s ease}`,
        `.sidebarModule .soundBadge:hover .soundTitle,.sidebarModule .soundBadge:hover .soundStats,.sidebarModule .soundBadge:focus-within .soundTitle,.sidebarModule .soundBadge:focus-within .soundStats{-webkit-mask-image:linear-gradient(90deg,#000 calc(100% - 120px),transparent calc(100% - 70px));mask-image:linear-gradient(90deg,#000 calc(100% - 120px),transparent calc(100% - 70px))}`,
        `.sidebarModule .soundBadge__actions .sc-button{border:0!important;border-radius:999px!important;background:rgba(255,255,255,.1)!important;box-shadow:inset 0 0 0 1px rgba(255,255,255,.12)!important}`,
        `.sidebarModule .soundBadge__actions .sc-button:hover{background:rgba(255,255,255,.18)!important}`,
        `.sidebarHeader__title,.sidebarModule h3{letter-spacing:.08em;font-weight:800!important}`,
        // Пустая полоса справа над лайками (2.8.1): модуль, из которого блокировщик убрал содержимое, оставался стеклянной плашкой
        // с отступами. Модуль без ссылок, картинок, кнопок, списков и текста не показывается
        `.sidebarModule:empty,.l-sidebar-right .sidebarModule:not(:has(a,img,button,li,p,h2,h3,canvas,iframe,input,[class*="Artwork"],.sc-artwork)){display:none!important}`,
    );
    // Блок «Моей волны»: большая карточка «сейчас играет» с размытой обложкой в фоне, плитки «Далее» как карточки-обложки,
    // чипы и кнопки как у фирменного стиля. html body в начале перебивает правила волны (#sc-wave …) без !important
    const w = 'html body #sc-wave';
    rows.push(
        `${w}{--scw-surface:var(--sc2-surface-2);--scw-film:var(--sc2-surface-1);--scw-film-strong:var(--sc2-surface-2);--scw-tile:var(--sc2-surface-2);--scw-muted:var(--sc2-text-2);--scw-faint:var(--sc2-text-3);--scw-btn:#fff;--scw-btn-ink:var(--sc2-ink)}`,
        `${w} .scw-title{font-size:30px;line-height:36px;font-weight:800;letter-spacing:-.6px;color:#fff}`,
        `${w} .scw-head .scw-hint{display:none}`,
        `${w} .scw-seg{padding:4px;border-radius:999px;background:var(--sc2-panel);box-shadow:inset 0 0 0 1px var(--sc2-line)}`,
        `${w} .scw-seg button{border-radius:999px;font-weight:700;transition:background var(--sc2-mid),color var(--sc2-mid)}`,
        `${w} .scw-seg button[aria-checked="true"]{background:var(--sc2-vice);color:var(--sc2-ink);box-shadow:0 6px 18px -8px rgba(0,0,0,.55)}`,
        `${w} .scw-genre,${w} .scw-icon{border-radius:999px;background:var(--sc2-panel);box-shadow:inset 0 0 0 1px var(--sc2-line);transition:background var(--sc2-fast),transform var(--sc2-fast)}`,
        `${w} .scw-icon:hover,${w} .scw-genre:hover{background:var(--sc2-surface-3);transform:translateY(-1px)}`,
        `${w} .scw-genre.set{background:var(--sc2-vice);color:var(--sc2-ink)}`,
        `${w} .scw-pop{border-radius:var(--sc2-r3);background:var(--sc2-panel);backdrop-filter:var(--sc2-blur);box-shadow:var(--sc2-shadow),inset 0 0 0 1px var(--sc2-line)}`,
        // Карточка «сейчас играет»: под стеклом размытая обложка играющего трека и бегущая рамка Vice, пока играет
        `${w} .scw-body{margin:0;padding:24px;gap:24px;border-radius:var(--sc2-r4);overflow:hidden;background:rgba(14,12,26,.35);backdrop-filter:var(--sc2-blur);-webkit-backdrop-filter:var(--sc2-blur);box-shadow:var(--sc2-shadow),inset 0 0 0 1px var(--sc2-line)}`,
        `${w} .scw-body::before{content:"";position:absolute;inset:-40px;z-index:-2;background:var(--sca-cover,none) center/cover;filter:blur(48px) saturate(1.7) brightness(.55);opacity:.85;transition:opacity .6s}`,
        `${w} .scw-body.lit{background:rgba(14,12,26,.3)}`,
        `${w} .scw-cover{width:var(--scw-cover-size);height:var(--scw-cover-size);border-radius:var(--sc2-r3);overflow:hidden;box-shadow:0 30px 60px -22px rgba(0,0,0,.9),0 0 0 1px rgba(255,255,255,.08)}`,
        `${w} .scw-play{width:54px;height:54px;background:#fff;box-shadow:0 12px 30px -12px rgba(0,0,0,.9);transition:transform var(--sc2-fast) var(--sc2-ease)}`,
        `${w} .scw-play svg{fill:var(--sc2-ink)}`,
        `${w} .scw-play:not(:disabled):hover{transform:scale(1.06);filter:none}`,
        `${w} .scw-play:not(:disabled):active{transform:scale(.94)}`,
        `${w} .scw-track{font-size:22px;line-height:28px;font-weight:800;letter-spacing:-.4px}`,
        `${w} .scw-artist{color:var(--sc2-text-2);font-weight:600}`,
        `${w} .scw-why{color:var(--sc2-text-2)}`,
        `${w} .scw-like{border-radius:999px;transition:background var(--sc2-fast),transform var(--sc2-fast) var(--sc2-ease)}`,
        `${w} .scw-like:hover{background:var(--sc2-surface-3);transform:translateY(-1px)}`,
        `${w} .scw-like[aria-pressed="true"] svg{fill:var(--sc2-accent)}`,
        `${w} .scw-btn{border-radius:999px;padding:0 18px;background:var(--sc2-surface-2);font-weight:700}`,
        // Капсулы со значком и подписью (2.8.5): «Текст», а у трека не из волны «Моя волна» и «По треку» в том же
        // ряду, что значки. Главная белая, остальные стеклянные, включённый «Текст» подсвечен цветом обложки
        `${w} .scw-meta.outside{flex-wrap:nowrap;gap:8px}`,
        `${w} .scw-sub{color:var(--sc2-text-2);font-weight:600}`,
        `${w} .scw-chip{height:34px;padding:0 14px 0 11px;display:inline-flex;align-items:center;gap:7px;flex:none;border-radius:999px;font-size:13px;font-weight:700;letter-spacing:-.1px;white-space:nowrap;color:#fff;background:rgba(255,255,255,.09);box-shadow:inset 0 0 0 1px rgba(255,255,255,.13);transition:transform var(--sc2-fast) var(--sc2-ease),background var(--sc2-fast),box-shadow var(--sc2-fast)}`,
        `${w} .scw-chip svg{width:16px;height:16px;flex:none;fill:currentColor}`,
        `${w} .scw-chip:hover{background:rgba(255,255,255,.17);transform:translateY(-1px)}`,
        `${w} .scw-chip:active{transform:scale(.96)}`,
        `${w} .scw-chip.scw-chip-main{background:#fff;color:var(--sc2-ink);box-shadow:0 8px 20px -10px rgba(0,0,0,.8)}`,
        `${w} .scw-chip.scw-chip-main:hover{background:#fff;filter:brightness(.94)}`,
        `${w} .scw-chip.scw-lyrics-toggle[aria-pressed="true"]{background:color-mix(in srgb,var(--sca-c1,#fff) 30%,rgba(255,255,255,.08));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--sca-c1,#fff) 60%,transparent)}`,
        `@media (max-width:1100px){${w} .scw-meta.outside .scw-chip:not(.scw-chip-main) span{display:none}${w} .scw-meta.outside .scw-chip:not(.scw-chip-main){padding:0 9px}}`,
        `${w} .scw-btn.scw-primary{background:#fff;color:var(--sc2-ink);box-shadow:0 10px 24px -12px rgba(0,0,0,.8)}`,
        `${w} .scw-btn.scw-primary:hover{background:#fff;filter:brightness(.95)}`,
        // Текст песни поверх обложки (2.8.1, для съёмки роликов): обложка затемнена, строки по центру. Размер обложки
        // в режиме текста тот же (2.9.0): раньше она росла с 236 до 320 px, и весь блок прыгал при включении текста.
        // Текст листается внутри обложки, крупный кадр для роликов теперь даёт режим «Для роликов»
        `${w} .scw-cover.lyr{width:var(--scw-cover-size);height:var(--scw-cover-size)}`,
        `${w} .scw-cover.lyr .scw-img{filter:brightness(.62) saturate(1.1)}`,
        `${w} .scw-lyrics-note{position:absolute;left:0;right:0;bottom:12px;z-index:3;margin:0;text-align:center;font-size:12px;font-weight:600;color:rgba(255,255,255,.78);text-shadow:0 1px 8px rgba(0,0,0,.7);pointer-events:none}`,
        `${w} .scw-lyrics{position:absolute;inset:0;z-index:3;margin:0;border-radius:inherit;overflow:hidden;background:radial-gradient(120% 80% at 50% 50%,rgba(0,0,0,.12),rgba(0,0,0,.5));box-shadow:none}`,
        // Текст в такт (2.8.3), для роликов: строки едут лентой, текущая крупно посередине, слова загораются по одному
        // с пружинкой и свечением цвета обложки, вся строка чуть набухает на ударе баса. Соседние строки размыты
        `${w} .scw-lyrics-rows{position:absolute;inset:0;max-height:none;overflow:auto;padding:38% 14px;box-sizing:border-box;scrollbar-width:none;text-align:center;-webkit-mask-image:linear-gradient(transparent,#000 22%,#000 78%,transparent);mask-image:linear-gradient(transparent,#000 22%,#000 78%,transparent)}`,
        `${w} .scw-lyrics[data-synced] .scw-lyrics-rows{overflow:hidden;padding:0 20px}`,
        `${w} .scw-lyrics-track{position:relative;will-change:transform;transition:transform .75s cubic-bezier(.22,1,.36,1)}`,
        `${w} .scw-lyrics-track.calm{transition:none}`,
        `${w} .scw-lyrics-rows::-webkit-scrollbar{display:none}`,
        `${w} .scw-lyric{all:unset;display:block;box-sizing:border-box;width:100%;padding:5px 0;font-size:19px;line-height:1.16;font-weight:900;letter-spacing:-.5px;text-align:center;color:rgba(255,255,255,.3);text-shadow:0 2px 14px rgba(0,0,0,.6);cursor:pointer;` +
            `transform:scale(.92);transform-origin:center;filter:blur(1.6px);opacity:.75;transition:color .45s ease,transform .6s cubic-bezier(.22,1,.36,1),filter .5s ease,opacity .5s ease}`,
        `${w} .scw-lyric.near{filter:blur(.7px);opacity:.9}`,
        `${w} .scw-lyric.past{color:rgba(255,255,255,.45)}`,
        `${w} .scw-lyric.now{color:rgba(255,255,255,.38);transform:scale(1.04);filter:none;opacity:1}`,
        `${w} .scw-lyric:hover{filter:none;opacity:1}`,
        `${w} .scw-ln{display:inline-block;transform:scale(1);transition:transform 80ms ease-out}`,
        `html.sca-playing:not(.sca-fx-off) ${w} .scw-lyric.now .scw-ln{transform:scale(calc(1 + var(--sca-kick,0) * .07)) translateY(calc(var(--sca-kick,0) * -2px))}`,
        `${w} .scw-w{display:inline-block;transition:color .22s ease,text-shadow .4s ease,transform .5s cubic-bezier(.34,1.56,.64,1),filter .3s ease}`,
        `${w} .scw-lyric.now .scw-w{transform:translateY(.12em) scale(.96)}`,
        `${w} .scw-lyric.now .scw-w.on{color:#fff;transform:none;text-shadow:0 0 22px color-mix(in srgb,var(--sca-c1,#fff) 75%,transparent),0 0 2px rgba(255,255,255,.6),0 2px 14px rgba(0,0,0,.7);animation:scw-word .5s cubic-bezier(.34,1.56,.64,1) both}`,
        `${w} .scw-lyric.past .scw-w{color:rgba(255,255,255,.5)}`,
        '@keyframes scw-word{0%{transform:translateY(.3em) scale(.86);filter:blur(5px);opacity:.4}55%{transform:translateY(-.04em) scale(1.1);filter:blur(0);opacity:1}100%{transform:none;filter:none;opacity:1}}',
        `html.scm-reduce ${w} .scw-w,html.scm-reduce ${w} .scw-lyrics-track,html.scm-reduce ${w} .scw-ln{animation:none!important;transition:none!important}`,
        `@media (prefers-reduced-motion:reduce){${w} .scw-w,${w} .scw-lyrics-track,${w} .scw-ln{animation:none!important;transition:none!important}}`,
        `${w} .scw-lyric.plain{cursor:text;user-select:text;font-size:16px;font-weight:800;color:rgba(255,255,255,.88);filter:none;opacity:1;transform:none}`,
        // Плашки на обложке (2.8.5): «Скрыть текст» сверху справа поверх текста, «Показать текст» снизу справа, когда
        // текст выключен. Подписаны словами и видны на наведении, поэтому в ролик не попадают
        `${w} .scw-cover-chip{position:absolute;z-index:4;height:30px;padding:0 12px 0 9px;display:inline-flex;align-items:center;gap:6px;border-radius:999px;font-size:12px;font-weight:700;white-space:nowrap;color:#fff;background:rgba(0,0,0,.45);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);box-shadow:inset 0 0 0 1px rgba(255,255,255,.16);opacity:0;transform:translateY(4px);transition:opacity .2s ease,transform .2s var(--sc2-ease),background .15s ease}`,
        `${w} .scw-cover-chip svg{width:15px;height:15px;flex:none;fill:currentColor}`,
        `${w} .scw-lyrics-hide{top:10px;right:10px}`,
        `${w} .scw-lyrics-show{right:10px;bottom:10px}`,
        `${w} .scw-cover:hover .scw-cover-chip,${w} .scw-cover-chip:focus-visible{opacity:1;transform:none}`,
        `${w} .scw-cover-chip:hover{background:rgba(0,0,0,.62)}`,
        `${w} .scw-lyrics-src{position:absolute;left:0;right:0;bottom:8px;padding:0;text-align:center;font-size:10px;color:rgba(255,255,255,.55);pointer-events:none}`,
        `${w} .scw-up-h{font-size:13px;line-height:16px;font-weight:700;letter-spacing:.02em;color:var(--sc2-text-2);margin:24px 0 8px}`,
        `${w} .scw-tiles:not(.scw-shelf){gap:12px}`,
        // «Далее» (2.13.6): одна компактная строка при любой ширине окна, число плиток по ширине блока; стекла на плитках нет (дёшево для GPU)
        `${w} .scw-tile{display:grid;grid-template-columns:clamp(44px,30%,64px) minmax(0,1fr);column-gap:12px;align-items:center;align-content:center;padding:8px;margin:0;border-radius:var(--sc2-r3);background:var(--sc2-panel);box-shadow:inset 0 0 0 1px var(--sc2-line);transition:background-color var(--sc2-mid),box-shadow var(--sc2-mid)}`,
        `${w} .scw-tile:hover{background:var(--sc2-surface-2);box-shadow:inset 0 0 0 1px rgba(255,255,255,.16)}`,
        // Обложка квадратом слева (в wave.ts её ширина растёт с плиткой), картинка заполняет квадрат; подписи в одну строку
        `${w} .scw-tile>.scw-art{grid-row:1/4;width:100%;aspect-ratio:1;margin:0;border-radius:var(--sc2-r1);overflow:hidden}`,
        `${w} .scw-tile>.scw-art .scw-img{background-size:cover;background-position:center}`,
        `${w} .scw-tile>.scw-art img{width:100%;height:100%;object-fit:cover}`,
        `${w} .scw-tile>.scw-t1,${w} .scw-tile>.scw-t2,${w} .scw-tile>.scw-t3{display:block;grid-column:2;margin:0;min-width:0;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}`,
        `${w} .scw-t1{font-weight:800}`,
        `${w} .scw-t2,${w} .scw-t3{color:var(--sc2-text-2)}`,
        `${w} .scw-t3{font-size:11px;color:var(--sc2-text-3)}`,
        `${w} .scw-chip{height:32px;padding:0 14px;border-radius:999px;background:var(--sc2-panel);box-shadow:inset 0 0 0 1px var(--sc2-line);color:var(--sc2-text-2);font-weight:700;transition:background var(--sc2-fast),color var(--sc2-fast),transform var(--sc2-fast)}`,
        `${w} .scw-chip:hover{background:var(--sc2-surface-3);color:#fff;transform:translateY(-1px)}`,
        `${w} .scw-moods .scw-chip[aria-checked="true"],${w} .scw-chip[aria-pressed="true"]{background:var(--sc2-vice);color:var(--sc2-ink);box-shadow:0 8px 20px -10px rgba(0,0,0,.55)}`,
        `${w} .scw-pin{height:32px;border-radius:999px;background:var(--sc2-panel);box-shadow:inset 0 0 0 1px var(--sc2-line)}`,
        `${w} .scw-shelf-h{font-size:24px;line-height:30px;font-weight:800;letter-spacing:-.4px}`,
        // Подборки на полке: обложка-карточка с затемнением снизу, увеличение картинки и подсветка
        `${w} .scw-card .scw-art{border-radius:var(--sc2-r3);overflow:hidden;box-shadow:0 18px 40px -20px rgba(0,0,0,.9)}`,
        `${w} .scw-card .scw-art .scw-img{transition:transform .5s var(--sc2-ease),opacity .2s}`,
        `${w} .scw-card:hover .scw-art .scw-img{transform:scale(1.07)}`,
        `${w} .scw-card .scw-art::after{background:var(--sc2-vice);height:4px}`,
        `${w} .scw-card .scw-card-play{background:var(--sc2-vice)}`,
        `${w} .scw-card .scw-card-play svg{fill:var(--sc2-ink)}`,
        `${w} .scw-card .scw-card-play:hover{background:var(--sc2-vice);transform:translateY(0) scale(1.08)}`,
        `${w} .scw-mix,${w} .scw-lib{border-radius:var(--sc2-r4);padding:16px 16px 8px;background:var(--sc2-panel);box-shadow:inset 0 0 0 1px var(--sc2-line)}`,
        `${w} .scw-mix-play{background:var(--sc2-vice)}`,
        `${w} .scw-mix-play svg{fill:var(--sc2-ink)}`,
        `${w} .scw-row{border-radius:var(--sc2-r2)}`,
        `${w} .scw-row[aria-current="true"] .scw-row-t b,${w} .scw-lib-here{color:var(--sc2-accent)}`,
        `${w} .scw-lib-opt{border-radius:var(--sc2-r2)}`,
    );
    // Клуб за стеной (2.7.0): за сайтом снизу светится «щель под дверью» в цвет обложки, бьётся на басу, вверх уходят два
    // мягких луча, которые качаются в темп. Поверх всего только края окна чуть темнеют на ударе, как будто стены дрожат
    rows.push(
        '#sca-club{position:fixed;inset:0;z-index:-1;pointer-events:none;overflow:hidden;opacity:0;transition:opacity 1.4s ease}',
        'html.sca-playing #sca-club{opacity:1}',
        '#sca-club i{position:absolute;display:block}',
        '#sca-club .door{left:-15%;right:-15%;bottom:-38vh;height:76vh;border-radius:50%;background:radial-gradient(50% 50% at 50% 60%,var(--sca-c1,#3a6bff) 0%,color-mix(in srgb,var(--sca-c3,#6f8bff) 50%,transparent) 35%,transparent 70%);' +
            'filter:blur(36px);opacity:calc(.14 + var(--sca-bass,0) * .5 + var(--sca-kick,0) * .25);transform:scale(calc(1 + var(--sca-kick,0) * .12),calc(1 + var(--sca-kick,0) * .3));transform-origin:50% 100%;will-change:transform,opacity}',
        '#sca-club .beam{bottom:-12vh;width:16vw;min-width:160px;height:135vh;transform-origin:50% 100%;filter:blur(30px);mix-blend-mode:screen;opacity:calc(.03 + var(--sca-energy,0) * .2);' +
            'animation:sca-sweep var(--sca-sweep,10s) ease-in-out infinite alternate;will-change:transform}',
        // Окно без фокуса (игра поверх, другое окно): лучи стоят, компоситор не крутит размытые слои
        'html.sca-idle #sca-club .beam,html.sca-idle .scw-glow>i{animation-play-state:paused}',
        '#sca-club .beam.l{left:16%;--from:-26deg;--to:16deg;background:linear-gradient(to top,color-mix(in srgb,var(--sca-c3,#6f8bff) 80%,transparent),transparent 75%)}',
        '#sca-club .beam.r{right:16%;--from:24deg;--to:-14deg;animation-delay:calc(var(--sca-sweep,10s) * -.5);background:linear-gradient(to top,color-mix(in srgb,var(--sca-c1,#3a6bff) 80%,transparent),transparent 75%)}',
        '@keyframes sca-sweep{from{transform:rotate(var(--from))}to{transform:rotate(var(--to))}}',
        '#sca-thump{position:fixed;inset:0;z-index:2147482000;pointer-events:none;opacity:0;transition:opacity 1s ease;' +
            'box-shadow:inset 0 0 calc(70px + var(--sca-kick,0) * 90px) calc(var(--sca-kick,0) * 10px) rgba(0,0,0,calc(.18 + var(--sca-kick,0) * .3))}',
        'html.sca-playing #sca-thump{opacity:1}',
        // Обложка в карточке волны вздрагивает на ударе
        // Карточка (обложка и текст поверх) на ударе дрожит в сторону, выбранную для удара, и чуть набухает
        'html.sca-playing #sc-wave .scw-cover{transform:translate3d(calc(var(--sca-sx,0) * 5px),calc(var(--sca-sy,0) * 5px),0) scale(calc(1 + var(--sca-kick,0) * .035))!important;transition:transform 70ms ease-out,filter .4s ease!important;will-change:transform}',
        // Фон на ударе: холст чуть увеличен, чтобы края не показывались, и дёргается в ту же сторону
        'html.sca-playing:not(.sca-fx-soft):not(.sca-fx-off) #sca-bg{transform:translate3d(calc(var(--sca-sx,0) * 12px),calc(var(--sca-sy,0) * 12px),0) scale(calc(1.05 + var(--sca-kick,0) * .04));transition:opacity 1.2s ease,transform 70ms ease-out}',
        'html.scm-reduce #sca-club,html.scm-reduce #sca-thump{display:none}',
        // Стекло карточки волны (вернули в 2.8.3): лёгкий наклон за курсором, бегущий блик и светлый край ближе к мыши.
        // Наклон мягче, чем в 2.7.1, чтобы карточка не плыла на съёмке; в режиме «Выкл» и при «меньше движения» карточка ровная
        'html body #sc-wave .scw-body{transform:perspective(1600px) rotateX(var(--ty,0deg)) rotateY(var(--tx,0deg));transition:transform .6s cubic-bezier(.2,.8,.2,1),box-shadow .4s ease}',
        'html body #sc-wave .scw-body.sc2-glass-on{transition:transform .14s linear,box-shadow .4s ease;box-shadow:0 34px 70px -28px rgba(0,0,0,.9),inset 0 0 0 1px rgba(255,255,255,.16)}',
        'html body #sc-wave .scw-body::after{content:"";position:absolute;inset:0;z-index:4;border-radius:inherit;pointer-events:none;opacity:0;transition:opacity .4s ease;' +
            'background:radial-gradient(520px circle at var(--gx,50%) var(--gy,50%),rgba(255,255,255,.12),rgba(255,255,255,.03) 35%,transparent 60%),' +
            'linear-gradient(115deg,transparent 30%,rgba(255,255,255,.06) 45%,transparent 60%) calc(var(--gx,50%) * 1.4 - 20%) 0/200% 100% no-repeat;mix-blend-mode:screen}',
        'html body #sc-wave .scw-body.sc2-glass-on::after{opacity:1}',
        // Пустые модули справа, которые скрипт пометил: блокировщик спрятал содержимое, а плашка с отступами осталась полоской
        // Плашка сжимается в ноль, а не прячется: так скрипт видит, когда содержимое вернётся
        '.sidebarModule.sc2-void{padding:0!important;margin:0!important;min-height:0!important;background:none!important;box-shadow:none!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;border:0!important;overflow:hidden}',
        // Уровни эффектов (2.7.1): «мягкие» без затемнения краёв и толчка обложки, «выкл» без клуба вовсе
        'html.sca-fx-soft #sca-thump,html.sca-fx-off #sca-thump,html.sca-fx-off #sca-club{display:none}',
        'html.sca-fx-soft #sca-club .beam{opacity:calc(.02 + var(--sca-energy,0) * .12)}',
        'html.sca-fx-soft.sca-playing #sc-wave .scw-cover,html.sca-fx-off.sca-playing #sc-wave .scw-cover{transform:none!important}',
        '.playControls button.sca-fx{all:unset;box-sizing:border-box;flex:none;width:32px;height:32px;margin:0 3px;border-radius:999px;display:inline-grid;place-items:center;cursor:pointer;' +
            'background:rgba(255,255,255,.06);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08);color:rgba(255,255,255,.75);transition:transform .16s cubic-bezier(.2,.8,.2,1),background-color .16s ease,color .16s ease}',
        '.playControls button.sca-fx svg{width:16px;height:16px}',
        '.playControls button.sca-fx:hover{background:rgba(255,255,255,.12);color:#fff}',
        '.playControls button.sca-fx:active{transform:scale(.9)}',
        '.playControls button.sca-fx:focus-visible{outline:2px solid var(--sc2-accent,#fff);outline-offset:2px}',
        '.playControls button.sca-fx[data-level="full"]{color:#fff;background:color-mix(in srgb,var(--sca-c1,#3a6bff) 28%,transparent)}',
        '.playControls button.sca-fx[data-level="off"]{color:rgba(255,255,255,.35)}',
        // Меню кнопки эффектов: четыре радио-пункта режима и ниже ползунок «Интенсивность бита», над кнопкой
        '.sca-fx-pop{position:fixed;z-index:2147483601;transform:translate(-50%,-100%);display:none;flex-direction:column;gap:2px;box-sizing:border-box;width:250px;max-width:calc(100vw - 16px);padding:6px;border-radius:14px;font:600 13px/1.2 system-ui,-apple-system,sans-serif;color:#fff;' +
            'background:rgba(14,15,22,.94);backdrop-filter:blur(20px);box-shadow:0 10px 30px -10px rgba(0,0,0,.9),inset 0 0 0 1px rgba(255,255,255,.1)}',
        '.sca-fx-pop.on{display:flex}',
        '.sca-fx-item{all:unset;box-sizing:border-box;display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:10px;cursor:pointer;white-space:nowrap;color:rgba(255,255,255,.88)}',
        '.sca-fx-item i{flex:none;width:14px;height:14px;border-radius:50%;box-sizing:border-box;box-shadow:inset 0 0 0 2px rgba(255,255,255,.4)}',
        '.sca-fx-item.on i{box-shadow:inset 0 0 0 4px var(--sca-c1,#3a6bff),inset 0 0 0 14px #fff}',
        '.sca-fx-item:hover,.sca-fx-item:focus-visible{background:rgba(255,255,255,.12);color:#fff}',
        '.sca-fx-item:focus-visible{outline:2px solid var(--sc2-accent,#fff);outline-offset:-2px}',
        '.sca-fx-hr{height:1px;margin:4px 8px;background:rgba(255,255,255,.12)}',
        '.sca-fx-beat{display:flex;flex-direction:column;gap:6px;padding:6px 10px 8px;font-size:12px}.sca-fx-beat.off{opacity:.45}',
        '.sca-fx-pop .row{display:flex;justify-content:space-between;gap:8px}',
        '.sca-fx-pop output{opacity:.7;font-variant-numeric:tabular-nums}',
        '.sca-fx-pop input{width:100%;margin:0;accent-color:var(--sca-c1,#3a6bff);cursor:pointer}',
        '.sca-fx-pop input:disabled{cursor:default}',
        // Разделитель между действиями над треком и правой группой («С другом», ролики, эффекты)
        '.playControls .sca-bar-sep{flex:none;width:1px;height:20px;margin:0 8px;background:rgba(255,255,255,.14)}',
        '@media (prefers-reduced-motion:reduce){#sca-club,#sca-thump{display:none}}',
    );
    // Нижний бар в духе Apple Music (2.7.0): у сайта кнопки трёх размеров и разной яркости. Теперь одна сетка: «назад» и
    // «вперёд» 38 px, play 44 px белым кругом, перемешивание и повтор 32 px приглушённые, включённые белые с точкой снизу.
    // Кнопки справа (лайк, подписка, док, громкость) одного размера 32 px на одном стекле
    const bar = 'html body .playControls';
    const transport = ['button.skipControl', 'button.playControls__play', 'button.shuffleControl', 'button.repeatControl'].map((item) => `${bar} ${item}`).join(',');
    rows.push(
        `${bar} .playControls__elements{align-items:center}`,
        `${bar} .playControls__control{margin:0 2px!important}`,
        `${transport}{display:inline-grid!important;place-items:center!important;padding:0!important;margin:0 3px!important;border:0!important;border-radius:999px!important;background:transparent!important;box-shadow:none!important;` +
            // flex:none: в узком окне ряд плеера сжимал круглые кнопки по ширине, и play становился овалом 26×44
            `color:rgba(255,255,255,.9)!important;min-width:0!important;flex:none!important;transition:transform .16s cubic-bezier(.2,.8,.2,1),background-color .16s ease,color .16s ease,opacity .16s ease!important}`,
        // Иконка строго по центру круга (2.7.1): у сайта кнопки с заменой текста картинкой (sc-ir), отступ текста и
        // вложенные div уводили треугольник play в левый верхний угол. Каждый слой на весь круг, подпись скрыта
        `${transport}{position:relative!important;overflow:hidden!important;text-indent:0!important;font-size:0!important;line-height:0!important}`,
        `${transport.split(',').map((item) => item + ' div').join(',')}{position:absolute!important;inset:0!important;display:grid!important;place-items:center!important;width:auto!important;height:auto!important;margin:0!important;padding:0!important;background:none!important;text-indent:0!important}`,
        `${transport.split(',').map((item) => item + ' svg').join(',')}{position:static!important;display:block!important;margin:0!important;flex:none}`,
        `${transport.split(',').map((item) => item + ' .sc-button-label').join(',')}{display:none!important}`,
        `${bar} button.playControls__play::before,${bar} button.playControls__play::after{display:none!important}`,
        `${bar} button.skipControl{width:38px!important;height:38px!important}`,
        `${bar} button.skipControl svg{width:19px!important;height:19px!important}`,
        `${bar} button.playControls__play{width:44px!important;height:44px!important;background:#fff!important;color:#0b0c10!important;box-shadow:0 8px 22px -10px rgba(0,0,0,.9),0 0 0 1px rgba(255,255,255,.2)!important}`,
        `${bar} button.playControls__play svg{width:20px!important;height:20px!important}`,
        `${bar} button.playControls__play .sc-button-label{display:none!important}`,
        `${bar} button.shuffleControl,${bar} button.repeatControl{position:relative;width:32px!important;height:32px!important;color:rgba(255,255,255,.5)!important}`,
        `${bar} button.shuffleControl svg,${bar} button.repeatControl svg{width:16px!important;height:16px!important}`,
        `${bar} button.skipControl:hover,${bar} button.shuffleControl:hover,${bar} button.repeatControl:hover{background:rgba(255,255,255,.09)!important;color:#fff!important}`,
        `${bar} button.playControls__play:hover{transform:scale(1.05)}`,
        `${bar} button.skipControl:active,${bar} button.shuffleControl:active,${bar} button.repeatControl:active,${bar} button.playControls__play:active{transform:scale(.9)!important}`,
        `${bar} button.skipControl.disabled{opacity:.35}`,
        `${bar} button.shuffleControl.m-shuffling,${bar} button.repeatControl.m-one,${bar} button.repeatControl.m-all{color:#fff!important}`,
        `${bar} button.shuffleControl.m-shuffling::after,${bar} button.repeatControl.m-one::after,${bar} button.repeatControl.m-all::after{content:"";position:absolute;left:50%;bottom:2px;width:4px;height:4px;margin-left:-2px;border-radius:50%;background:var(--sc2-accent,#fff)}`,
        // Повтор виден сразу (2.12.4): включённый — иконка цвета акцента на мягком круге, у «повтора трека» ещё цифра 1
        `${bar} button.repeatControl.m-one,${bar} button.repeatControl.m-all{color:var(--sc2-accent,#fff)!important;background:color-mix(in srgb,var(--sc2-accent,#fff) 20%,transparent)!important}`,
        `${bar} button.repeatControl.m-one::before{content:"1";position:absolute;right:3px;top:3px;min-width:12px;height:12px;border-radius:6px;padding:0 3px;box-sizing:border-box;background:var(--sc2-accent,#fff);color:#0b0c10;font:700 9px/12px system-ui,sans-serif;text-align:center;z-index:2}`,
        `${bar} .playbackTimeline__timePassed,${bar} .playbackTimeline__duration{font-size:11px!important;font-variant-numeric:tabular-nums;color:rgba(255,255,255,.55)!important}`,
        // Правая часть бара: все кнопки одинаковые круги на стекле
        `${bar} .playbackSoundBadge__actions{display:inline-flex!important;align-items:center;gap:6px}`,
        `${bar} .playbackSoundBadge__actions .sc-button,${bar} .volume__button{width:32px!important;height:32px!important;min-width:0!important;padding:0!important;margin:0!important;display:inline-grid!important;place-items:center!important;` +
            `border:0!important;border-radius:999px!important;background:rgba(255,255,255,.06)!important;box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)!important;color:rgba(255,255,255,.75)!important;` +
            `transition:transform .16s cubic-bezier(.2,.8,.2,1),background-color .16s ease,color .16s ease!important}`,
        `${bar} .playbackSoundBadge__actions .sc-button svg,${bar} .volume__button svg{width:16px!important;height:16px!important}`,
        `${bar} .playbackSoundBadge__actions .sc-button:hover,${bar} .volume__button:hover{background:rgba(255,255,255,.12)!important;color:#fff!important}`,
        `${bar} .playbackSoundBadge__actions .sc-button:active{transform:scale(.9)}`,
        `${bar} .playbackSoundBadge__actions .sc-button-selected{color:var(--sc2-accent,#fff)!important;background:color-mix(in srgb,var(--sca-c1,#3a6bff) 22%,transparent)!important}`,
        // Бейдж трека и док в одну строку (2.8.0): у сайта бейдж фиксированной ширины 328 px, и док из пяти кнопок
        // переносился под бар, за край окна. Теперь бейдж сжимается, название обрезается, док всегда виден
        `${bar} .playControls__soundBadge{display:flex!important;align-items:center;flex:0 1 540px;width:auto!important;min-width:260px;gap:8px}`,
        `${bar} .playControls__soundBadge .playbackSoundBadge{flex:1 1 0;width:auto!important;min-width:0}`,
        `${bar} .playControls__timeline{flex:1 1 0!important;min-width:160px}`,
        `${bar} .scd-dock{flex:none;margin-left:0;padding:0;gap:6px;background:none;box-shadow:none}`,
        // Кнопки справа по смыслу (2.8.3): док растворяется в ряду кнопок сайта, порядок задаётся order.
        // Оценка: лайк, «Не нравится», «Больше такого» · очередь: «Следующим», «Волна от трека», очередь сайта · подписка · «К дропу»
        `${bar} .playbackSoundBadge__actions{flex-wrap:nowrap}`,
        `${bar} .playbackSoundBadge__actions>.scd-dock{display:contents}`,
        `${bar} .playbackSoundBadge__actions>*{order:60}`,
        `${bar} .playbackSoundBadge__actions .playbackSoundBadge__like,${bar} .playbackSoundBadge__actions .sc-button-like{order:10}`,
        `${bar} .playbackSoundBadge__actions .scd-dock>[data-act="dislike"]{order:11}`,
        `${bar} .playbackSoundBadge__actions .scd-dock>[data-act="more"]{order:12}`,
        `${bar} .playbackSoundBadge__actions .scd-dock>[data-act="next"]{order:20;margin-left:8px}`,
        `${bar} .playbackSoundBadge__actions .scd-dock>[data-act="wave"]{order:21}`,
        `${bar} .playbackSoundBadge__actions [class*="showQueue"],${bar} .playbackSoundBadge__actions [class*="queue"]{order:22}`,
        `${bar} .playbackSoundBadge__actions .sc-button-follow,${bar} .playbackSoundBadge__actions [class*="follow"]{order:30;margin-left:8px!important}`,
        `${bar} .playbackSoundBadge__actions .scd-dock>[data-act="drop"]{order:40;margin-left:8px}`,
        `${bar} .scd-dock button{width:32px;height:32px;background:rgba(255,255,255,.06);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08);color:rgba(255,255,255,.75)}`,
        `${bar} .scd-dock button:hover{background:rgba(255,255,255,.12);color:#fff}`,
        `${bar} .scd-dock svg{width:16px;height:16px}`,
        `${bar} .playbackSoundBadge__titleLink{font-weight:700!important;color:#fff!important}`,
        `${bar} .playbackSoundBadge__lightLink{color:rgba(255,255,255,.55)!important}`,
        `${bar} .playbackSoundBadge__avatar{border-radius:8px!important;overflow:hidden}`,
    );
    // Очередь сайта как «Далее» в Apple Music: стекло, крупный заголовок, кнопки-капсулы, строки без лишнего отступа,
    // играющий трек подсвечен цветом обложки, ручка перетаскивания видна только на наведении
    const q = 'html body .queue';
    rows.push(
        `${q}{background:rgba(14,15,22,.82)!important;backdrop-filter:blur(30px) saturate(1.6);-webkit-backdrop-filter:blur(30px) saturate(1.6);border:0!important;border-radius:20px!important;overflow:hidden;` +
            `box-shadow:0 30px 80px -30px rgba(0,0,0,.95),inset 0 0 0 1px rgba(255,255,255,.08)!important}`,
        `${q} .queue__panel{height:64px!important;padding:0 14px 0 22px!important;background:transparent!important;border:0!important}`,
        `${q} .queue__title{padding:0!important;font-size:22px!important;line-height:28px!important;font-weight:800!important;letter-spacing:-.4px;color:#fff!important}`,
        `${q} .queue__clear{height:30px!important;margin:0 8px 0 0!important;padding:0 14px!important;border:0!important;border-radius:999px!important;background:rgba(255,255,255,.1)!important;color:#fff!important;font-size:13px!important;font-weight:700!important;box-shadow:none!important}`,
        `${q} .queue__clear:hover{background:rgba(255,255,255,.18)!important}`,
        `${q} .queue__hide{width:30px!important;height:30px!important;margin:0!important;padding:0!important;display:grid!important;place-items:center!important;border:0!important;border-radius:999px!important;background:rgba(255,255,255,.1)!important;color:#fff!important;box-shadow:none!important}`,
        `${q} .queue__hide svg{width:16px!important;height:16px!important}`,
        `${q} .queue__hide:hover{background:rgba(255,255,255,.18)!important}`,
        `${q} .queue__scrollable,${q} .queue__scrollableInner,${q} .queue__dragCover{background:transparent!important;top:64px!important}`,
        `${q} .queue__itemsHeight{background-image:none!important;padding:0 8px!important}`,
        `${q} .queue__itemWrapper{background:transparent!important}`,
        `${q} .queueItemView{display:flex!important;align-items:center!important;position:relative;gap:12px;height:56px;box-sizing:border-box;padding:0 12px 0 8px!important;border-radius:12px;background:transparent!important;transition:background-color .14s ease,opacity .2s ease}`,
        `${q} .queueItemView:hover{background:rgba(255,255,255,.06)!important}`,
        `${q} .queueItemView__dragHandle{flex:none;width:14px!important;margin:0!important;color:rgba(255,255,255,.4);opacity:0;transition:opacity .14s ease;cursor:grab}`,
        `${q} .queueItemView__dragHandle svg{width:14px;height:14px}`,
        `${q} .queueItemView:hover .queueItemView__dragHandle{opacity:1}`,
        `${q} .queueItemView__playButton{position:absolute!important;left:30px;width:40px;height:40px;display:grid;place-items:center;z-index:1;opacity:0;transition:opacity .14s ease}`,
        `${q} .queueItemView__playButton .sc-button{width:26px!important;height:26px!important;border:0!important;border-radius:999px!important;background:#fff!important;color:#0b0c10!important;display:grid!important;place-items:center!important;padding:0!important}`,
        `${q} .queueItemView:hover .queueItemView__playButton{opacity:1}`,
        `${q} .queueItemView__artwork{flex:none;position:relative;width:40px!important;height:40px!important;margin:0!important;border-radius:8px!important;overflow:hidden;box-shadow:0 6px 14px -8px rgba(0,0,0,.9)}`,
        `${q} .queueItemView__artwork span,${q} .queueItemView__artworkImage{border-radius:8px!important}`,
        `${q} .queueItemView:hover .queueItemView__artwork{filter:brightness(.6)}`,
        `${q} .queueItemView__details{flex:1;min-width:0;margin:0!important;padding:0!important}`,
        `${q} .queueItemView__username,${q} .queueItemView__username a{font-size:12px!important;line-height:16px!important;color:rgba(255,255,255,.5)!important;font-weight:500!important}`,
        `${q} .queueItemView__title,${q} .queueItemView__title a,${q} .queueItemView__title span{font-size:14px!important;line-height:18px!important;color:#fff!important;font-weight:600!important;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}`,
        `${q} .queueItemView__context{color:rgba(255,255,255,.4)!important;font-size:11px!important}`,
        `${q} .queueItemView__meta,${q} .queueItemView__duration{flex:none;color:rgba(255,255,255,.45)!important;font-size:12px!important;font-variant-numeric:tabular-nums}`,
        `${q} .queueItemView__actions{display:flex;gap:4px;opacity:0;transition:opacity .14s ease}`,
        `${q} .queueItemView:hover .queueItemView__actions{opacity:1}`,
        `${q} .queueItemView__actions .sc-button{width:28px!important;height:28px!important;padding:0!important;border:0!important;border-radius:999px!important;background:rgba(255,255,255,.08)!important;display:grid!important;place-items:center!important}`,
        `${q} .queueItemView.m-playing{background:color-mix(in srgb,var(--sca-c1,#3a6bff) 20%,transparent)!important;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--sca-c1,#3a6bff) 35%,transparent)}`,
        `${q} .queueItemView.m-playing .queueItemView__title a,${q} .queueItemView.m-playing .queueItemView__title span{color:var(--sc2-accent,#fff)!important}`,
    );
    // Полировка 2.8.0 по ревью дизайна. Стекло читается как стекло, а не как тонированная плёнка, когда у панели есть
    // блик по верхней кромке (приём Liquid Glass): он добавлен всем стеклянным поверхностям. Движение пружинит: кривая
    // --sc2-spring с лёгким перелётом для подъёма карточек, нажатий и появления плашек. Цифры времени не прыгают по ширине
    const edge = 'inset 0 1px 0 rgba(255,255,255,.14),inset 0 0 0 1px rgba(255,255,255,.07)';
    rows.push(
        ':root{--sc2-spring:linear(0,.009,.035 2.1%,.141 4.4%,.723 12.9%,.938 16.7%,1.017,1.077,1.121,1.149 24.3%,1.159,1.163,1.161,1.154 29.9%,1.129 32.8%,1.051 39.6%,1.017 43.1%,.991,.977 51%,.974 53.8%,.975 57.1%,.997 69.8%,1.003 76.9%,1.004 83.8%,1);--sc2-edge:' + edge + '}',
        `${w} .scw-body{box-shadow:var(--sc2-shadow),${edge}}`,
        `${w} .scw-tile,${w} .scw-mix,${w} .scw-lib,${w} .scw-seg,${w} .scw-chip,${w} .scw-genre,${w} .scw-icon,${w} .scw-pop{box-shadow:${edge}}`,
        `.sidebarModule{box-shadow:${edge}!important}`,
        `.scw-menu,.scw-toast{box-shadow:var(--sc2-shadow),${edge}!important}`,
        `html body .queue{box-shadow:0 30px 80px -30px rgba(0,0,0,.95),${edge}!important}`,
        `.header,.header__inner{box-shadow:inset 0 -1px 0 rgba(255,255,255,.06)!important}`,
        // Пружина: подъём плиток, нажатие кнопок волны, появление меню и плашек
        `${w} .scw-tile{transition:background-color var(--sc2-mid),box-shadow var(--sc2-mid)}`,
        `${w} .scw-tile:hover{box-shadow:0 22px 40px -22px rgba(0,0,0,.9),inset 0 1px 0 rgba(255,255,255,.2),inset 0 0 0 1px rgba(255,255,255,.14)}`,
        `${w} .scw-like,${w} .scw-chip,${w} .scw-icon,${w} .scw-btn,${w} .scw-play{transition:background var(--sc2-fast),color var(--sc2-fast),transform .45s var(--sc2-spring)}`,
        `${w} .scw-like:active,${w} .scw-chip:active,${w} .scw-icon:active,${w} .scw-btn:active{transform:scale(.92)}`,
        `.scw-menu{transform-origin:top left;animation:sc2-pop .34s var(--sc2-spring)}`,
        `.scw-toast{animation:sc2-toast .5s var(--sc2-spring)}`,
        '@keyframes sc2-pop{from{opacity:0;transform:scale(.92)}}',
        '@keyframes sc2-toast{from{opacity:0;transform:translateY(14px) scale(.96)}}',
        // Смена трека в карточке: название и автор въезжают снизу
        `${w} .scw-swap>*{animation:sc2-rise .5s var(--sc2-spring) both}`,
        `${w} .scw-swap>*:nth-child(2){animation-delay:.05s}`,
        '@keyframes sc2-rise{from{opacity:0;transform:translateY(10px)}}',
        // Типографика: заголовки не оставляют одно слово на строке, время и счётчики ровной ширины
        `${w} .scw-track,${w} .scw-title,${w} .scw-shelf-h{text-wrap:balance}`,
        `${w} .scw-time,.playbackTimeline__timePassed,.playbackTimeline__duration{font-variant-numeric:tabular-nums}`,
        // Один вид фокуса с клавиатуры везде
        `${w} :focus-visible,.scd-dock button:focus-visible,html body .queue :focus-visible{outline:2px solid var(--sc2-accent,#fff)!important;outline-offset:2px;border-radius:inherit}`,
        // Окно входа и диалоги сайта: одна рамка вместо двух вложенных
        '.modal .dialog,.modal__modal .dialog{background:transparent!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;box-shadow:none!important}',
        'html.scm-reduce .scw-menu,html.scm-reduce .scw-toast,html.scm-reduce #sc-wave .scw-swap>*{animation:none!important}',
        '@media (prefers-reduced-motion:reduce){.scw-menu,.scw-toast,#sc-wave .scw-swap>*{animation:none!important}}',
    );
    if (a.hoverMotion) {
        rows.push(
            '.badgeList__item,.sound__coverArt,.playableTile,.scw-card{transition:transform .2s cubic-bezier(.2,0,0,1),filter .2s ease}',
            '.badgeList__item:hover,.playableTile:hover,.scw-card:hover{transform:translateY(-4px)}',
            '.badgeList__item:hover .sc-artwork,.playableTile:hover .sc-artwork{filter:brightness(1.08) saturate(1.1)}',
            '.sc-button,.playControls__control,.sc-button-play{transition:transform .12s cubic-bezier(.2,0,0,1),background-color .12s ease}',
            '.sc-button:active,.playControls__control:active{transform:scale(.94)}',
            '.playControls__play:hover{transform:scale(1.04)}',
            'html.scm-reduce .badgeList__item,html.scm-reduce .playableTile,html.scm-reduce .scw-card,html.scm-reduce .scw-tile,html.scm-reduce .sc-button{transition:none!important;transform:none!important}',
            '@media (prefers-reduced-motion:reduce){.badgeList__item,.playableTile,.scw-card,.scw-tile,.sc-button{transition:none!important;transform:none!important}}',
        );
    }
    // Полировка «Сцена» (2.14) последней: перебивает прежние правила той же силы
    rows.push(polishCss({ hoverMotion: a.hoverMotion }));
    return rows.join('\n');
}

interface AuroraConfig {
    appearance: Appearance;
    colors: [string, string, string];
    shaders: Record<string, string>;
    vertex: string;
    /** Режим эффектов из настроек (full, light, solid, off): им ведётся меню кнопки эффектов в баре */
    mode?: string;
}

/** Скрипт страницы: ставит холст или обновляет уже стоящий. Повторный вызов с новыми настройками применяет их плавно */
export function auroraPage(config: AuroraConfig): void {
    interface AuroraApi { update(next: AuroraConfig): void; dispose(): void }
    const host = window as unknown as Window & {
        __scAurora?: AuroraApi;
        __scAuroraPalette?: (colors: string[]) => void;
        __scAudioTap?: () => { context: AudioContext; gain: GainNode } | null;
        __scEnvelope?: () => { id: number; raw: number[] | null; position: number; duration: number; playing: boolean } | null;
    };
    if (host.__scAurora) {
        host.__scAurora.update(config);
        return;
    }
    let cfg = config;
    let canvas: HTMLCanvasElement | null = null;
    let gl: WebGLRenderingContext | null = null;
    let program: WebGLProgram | null = null;
    let programEffect = '';
    let frame = 0;
    let last = 0;
    let time = Math.random() * 1000;
    let speedNow = 1;
    let lost = false;
    let glWatched: HTMLCanvasElement | null = null;
    const seed = Math.random() * 10;
    const hexRgb = (hex: string): [number, number, number] => {
        const n = parseInt(hex.slice(1), 16);
        return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    };
    // Цвета перетекают за ~1.2 с
    let colorsNow = cfg.colors.map(hexRgb);
    let colorsWant = colorsNow.map((c) => c.slice() as [number, number, number]);
    let coverColors: string[] | null = null;
    // Под бит: анализатор на регуляторе звука сайта; если он слышит тишину при игре (зашифрованный поток), огибающая
    // по форме волны трека из волны
    const beat = beatInit();
    let analyser: AnalyserNode | null = null;
    let tappedGain: GainNode | null = null;
    let tapCheck = 0;
    let freq: Uint8Array<ArrayBuffer> | null = null;
    let silentSince = 0;
    let useEnvelope = false;
    let heard = 0;
    const envMax = new Map<number, number>();
    let cssPulse = -1;
    // Полосы спектра для линии прогресса: 32 логарифмические от 40 Гц до 8 кГц, 0..1
    const spectrum = new Float32Array(32);
    function fillSpectrum(data: Uint8Array, hz: number): void {
        for (let b = 0; b < spectrum.length; b++) {
            const lo = 40 * Math.pow(200, b / spectrum.length);
            const hi = 40 * Math.pow(200, (b + 1) / spectrum.length);
            let sum = 0;
            let n = 0;
            for (let i = Math.max(1, Math.floor(lo / hz)); i <= Math.min(data.length - 1, Math.ceil(hi / hz)); i++) {
                sum += data[i];
                n++;
            }
            spectrum[b] = n ? sum / n / 255 : 0;
        }
    }
    function envelopeSpectrum(raw: number[], at: number, max: number): void {
        // Без анализатора: соседние отсчёты формы волны вокруг позиции, чем дальше от центра, тем дальше по треку
        for (let b = 0; b < spectrum.length; b++) {
            const i = Math.max(0, Math.min(raw.length - 1, Math.round(at + (b - spectrum.length / 2) * 0.6)));
            spectrum[b] = (raw[i] / max) * (0.75 + 0.25 * Math.sin(b * 1.7 + at));
        }
    }
    // Метроном по форме волны: период из envelopeTempo (раз на трек), фаза пересчитывается каждые 0,7 с по последним 6 с
    // формы волны: берётся сдвиг, при котором отсчёты на сетке ударов в среднем самые громкие. Возвращает 0..1 сразу после
    // удара сетки и спад к нулю до следующего, -1 если ритма нет
    let tempo: { id: number; period: number } | null = null;
    let tempoPhase = 0;
    let tempoAt = 0;
    function envelopeKick(env: { id: number; raw: number[] | null; position: number; duration: number }, max: number): number {
        const rawList = env.raw;
        if (!rawList || env.duration <= 0) return -1;
        if (!tempo || tempo.id !== env.id) {
            const found = envelopeTempo(rawList, env.duration);
            tempo = { id: env.id, period: found ? found.period : 0 };
            tempoAt = 0;
        }
        const period = tempo.period;
        if (!period) return -1;
        const stepMs = env.duration / rawList.length;
        const stamp = performance.now();
        if (stamp - tempoAt > 700) {
            tempoAt = stamp;
            const from = env.position - 6000;
            let bestScore = -1;
            let bestPhase = 0;
            const grain = Math.max(8, stepMs / 4);
            for (let phase = 0; phase < period; phase += grain) {
                let sum = 0;
                let count = 0;
                for (let t = from + phase; t < env.position; t += period) {
                    const i = Math.round(t / stepMs);
                    if (i < 0 || i >= rawList.length) continue;
                    sum += rawList[i] / max;
                    count++;
                }
                const mean = count ? sum / count : 0;
                if (mean > bestScore) {
                    bestScore = mean;
                    bestPhase = phase;
                }
            }
            tempoPhase = from + bestPhase;
        }
        const since = (((env.position - tempoPhase) % period) + period) % period;
        return Math.exp(-since / (period * 0.22));
    }
    // kick: бас в энергии (куб уровня), а не в децибелах анализатора: в них бочка поднимает полосу на считаные проценты
    function readAudio(now: number): { bass: number; kick: number; level: number; playing: boolean } {
        const env = host.__scEnvelope?.() ?? null;
        const playing = env ? env.playing : musicPlaying();
        if (now - tapCheck > 1000) {
            tapCheck = now;
            const tap = host.__scAudioTap?.() ?? null;
            if (tap && tap.gain !== tappedGain) {
                try {
                    if (tappedGain && analyser) tappedGain.disconnect(analyser);
                } catch {
                    // регулятор прошлого трека уже снят
                }
                if (!analyser || analyser.context !== tap.context) {
                    analyser = tap.context.createAnalyser();
                    analyser.fftSize = 2048;
                    // Слабое сглаживание: сильное размазывало удар на несколько кадров, и вспышка опаздывала
                    analyser.smoothingTimeConstant = 0.15;
                    freq = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
                }
                tap.gain.connect(analyser);
                tappedGain = tap.gain;
                useEnvelope = false;
                silentSince = 0;
            }
        }
        if (!playing) return { bass: 0, kick: 0, level: 0, playing };
        if (analyser && freq) {
            // Анализатор читается и в режиме формы волны: услышал звук, значит поток всё-таки отдаёт его, и бит снова по звуку
            analyser.getByteFrequencyData(freq);
            const hz = analyser.context.sampleRate / analyser.fftSize;
            let bass = 0;
            let kick = 0;
            let bassN = 0;
            let level = 0;
            const top = Math.min(freq.length, Math.round(4000 / hz));
            for (let i = 1; i < top; i++) {
                const f = i * hz;
                if (f >= 35 && f <= 160) {
                    bass += freq[i];
                    kick += Math.pow(freq[i] / 255, 3);
                    bassN++;
                }
                level += freq[i];
            }
            bass = bassN ? bass / bassN / 255 : 0;
            kick = bassN ? kick / bassN : 0;
            level = level / Math.max(1, top - 1) / 255;
            if (level > 0.01) {
                silentSince = 0;
                // Раньше после первых 1,5 с тишины (начало трека, буферизация) режим формы волны оставался до конца трека,
                // и бит пропадал: звук есть, а детектор его не читает. Теперь возврат после 6 слышимых кадров подряд
                if (useEnvelope && ++heard > 6) {
                    useEnvelope = false;
                    heard = 0;
                }
            } else {
                heard = 0;
                if (!silentSince) silentSince = now;
                else if (now - silentSince > 1500) useEnvelope = true;
            }
            if (!useEnvelope) {
                fillSpectrum(freq, hz);
                return { bass, kick, level, playing };
            }
        }
        if (env?.raw?.length && env.duration > 0) {
            let max = envMax.get(env.id);
            if (max === undefined) {
                max = Math.max(1, ...env.raw);
                if (envMax.size > 50) envMax.clear();
                envMax.set(env.id, max);
            }
            const at = (env.position / env.duration) * (env.raw.length - 1);
            const i = Math.max(0, Math.min(env.raw.length - 2, Math.floor(at)));
            const value = (env.raw[i] + (env.raw[i + 1] - env.raw[i]) * (at - i)) / max;
            envelopeSpectrum(env.raw, at, max);
            // Форма волны плавная и ударов не содержит: пока нашёлся темп, удар это метроном по этому темпу, привязанный
            // к громким местам формы волны, а его сила идёт от громкости. Иначе одиночные рывки только на дропах
            const tick = envelopeKick(env, max);
            if (tick >= 0) return { bass: Math.max(value, tick * value), kick: tick * (0.35 + 0.65 * value), level: value * 0.8, playing };
            return { bass: value, kick: value * value, level: value * 0.8, playing };
        }
        return { bass: 0, kick: 0, level: 0.3, playing };
    }
    let coverUrl = '';
    const mouse = [0, 0];
    const mouseWant = [0, 0];
    const uniforms: Record<string, WebGLUniformLocation | null> = {};

    const setCssColors = (colors: string[]): void => {
        colors.slice(0, 3).forEach((color, i) => document.documentElement.style.setProperty('--sca-c' + (i + 1), color));
    };
    const targetColors = (): string[] => (cfg.appearance.palette === 'cover' && coverColors && coverColors.length ? [coverColors[0], coverColors[1] ?? coverColors[0], coverColors[2] ?? coverColors[1] ?? coverColors[0]] : cfg.colors);
    const retarget = (): void => {
        const colors = targetColors();
        colorsWant = colors.map(hexRgb);
        setCssColors(colors);
    };

    function compile(type: number, source: string): WebGLShader | null {
        if (!gl) return null;
        const shader = gl.createShader(type);
        if (!shader) return null;
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.warn('Переливы: шейдер не собрался', gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }
        return shader;
    }
    function useEffect(effect: string): boolean {
        if (!gl || (program && programEffect === effect)) return !!program;
        const vs = compile(gl.VERTEX_SHADER, cfg.vertex);
        const fs = compile(gl.FRAGMENT_SHADER, cfg.shaders[effect] ?? '');
        if (!vs || !fs) return false;
        const next = gl.createProgram();
        if (!next) return false;
        gl.attachShader(next, vs);
        gl.attachShader(next, fs);
        gl.bindAttribLocation(next, 0, 'a_pos');
        gl.linkProgram(next);
        gl.deleteShader(vs);
        gl.deleteShader(fs);
        if (!gl.getProgramParameter(next, gl.LINK_STATUS)) {
            console.warn('Переливы: программа не собралась', gl.getProgramInfoLog(next));
            return false;
        }
        if (program) gl.deleteProgram(program);
        program = next;
        programEffect = effect;
        gl.useProgram(program);
        for (const name of ['u_res', 'u_time', 'u_c1', 'u_c2', 'u_c3', 'u_intensity', 'u_grain', 'u_mouse', 'u_seed', 'u_pulse', 'u_energy']) uniforms[name] = gl.getUniformLocation(program, name);
        return true;
    }
    function setup(): boolean {
        canvas = document.getElementById('sca-bg') as HTMLCanvasElement | null;
        if (!canvas) {
            canvas = document.createElement('canvas');
            canvas.id = 'sca-bg';
            canvas.setAttribute('aria-hidden', 'true');
            document.documentElement.prepend(canvas);
        }
        gl = canvas.getContext('webgl', { antialias: false, alpha: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'low-power' });
        if (!gl) {
            console.warn('Переливы: WebGL недоступен');
            return false;
        }
        // Слушатели потери контекста вешаются на холст один раз: setup() зовётся снова при восстановлении,
        // и без этой проверки каждая потеря удваивала бы слушатели и повторные setup()
        if (glWatched !== canvas) {
            glWatched = canvas;
            canvas.addEventListener('webglcontextlost', (event) => {
                event.preventDefault();
                lost = true;
                program = null;
                programEffect = '';
            });
            canvas.addEventListener('webglcontextrestored', () => {
                lost = false;
                setup();
            });
        }
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        return true;
    }
    const scale = (): number => ({ eco: 0.35, balanced: 0.5, high: 0.8 })[cfg.appearance.quality] ?? 0.5;
    const fpsCap = (): number => ({ eco: 24, balanced: 40, high: 60 })[cfg.appearance.quality] ?? 40;
    // Слабый ПК (2.10.1): если фон стабильно рисуется заметно медленнее своего предела (в среднем за 4 с), разрешение
    // уменьшается ступенями до 55 %. Назад не растёт до перезагрузки страницы: прыгать туда-обратно хуже, чем оставаться мягче
    let thin = 1;
    let perfAt = 0;
    let perfSum = 0;
    let perfN = 0;
    function resize(): void {
        if (!canvas || !gl) return;
        const s = scale() * (cfg.appearance.quality === 'eco' ? 1 : thin) * Math.min(2, window.devicePixelRatio || 1);
        // Потолок числа пикселей шейдера: на 4K и высоком DPI холст был в миллионы точек, и фон грузил видеокарту
        // (а при GPU в главном процессе её перегрузка роняет весь клиент). Холст растягивается CSS, фон мягкий и без потери
        const budget = cfg.appearance.quality === 'high' ? 1_600_000 : 900_000;
        const fit = Math.min(1, Math.sqrt(budget / Math.max(1, window.innerWidth * window.innerHeight * s * s)));
        const w = Math.max(64, Math.round(window.innerWidth * s * fit));
        const h = Math.max(64, Math.round(window.innerHeight * s * fit));
        if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
            gl.viewport(0, 0, w, h);
        }
    }
    // Играет ли музыка: кнопка плеера сайта получает класс playing
    const musicPlaying = (): boolean => !!document.querySelector('.playControls__play.playing, .playControl.playing');
    // Обложка нижнего плеера: адрес из фона, палитра по уменьшенной копии через glowPalette
    let coverShown = '';
    function sampleCover(): void {
        const span = document.querySelector<HTMLElement>('.playbackSoundBadge .sc-artwork span, .playbackSoundBadge__avatar span');
        const match = /url\("?([^")]+)"?\)/.exec(span?.style.backgroundImage ?? '');
        // Обложка играющего трека крупно: размытый фон карточки «сейчас играет» (--sca-cover)
        const big = match ? match[1].replace(/-t\d+x\d+\./, '-t500x500.') : '';
        if (big !== coverShown && /^https:\/\//.test(big)) {
            coverShown = big;
            document.documentElement.style.setProperty('--sca-cover', 'url("' + big.replace(/["\\]/g, '') + '")');
        }
        if (cfg.appearance.palette !== 'cover') return;
        const url = match ? match[1].replace(/-t\d+x\d+\./, '-t200x200.') : '';
        if (!url || url === coverUrl) return;
        coverUrl = url;
        if (!/^https:\/\/i\d+\.sndcdn\.com\//.test(url)) return;
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.onload = () => {
            if (coverUrl !== url) return;
            try {
                const c = document.createElement('canvas');
                c.width = c.height = 24;
                const pen = c.getContext('2d', { willReadFrequently: true });
                if (!pen) return;
                pen.drawImage(image, 0, 0, 24, 24);
                const palette = glowPalette(pen.getImageData(0, 0, 24, 24).data);
                if (palette.length) {
                    coverColors = palette;
                    retarget();
                }
            } catch (error) {
                console.warn('Переливы: обложка не прочитана', error);
            }
        };
        image.src = url;
    }
    // Линия прогресса бара (2.14): рисует CSS по родным элементам сайта (polish.ts), холст с точками спектра снят:
    // он перерисовывался каждые 30 мс и выглядел пунктиром
    let playingShown: boolean | null = null;
    // Клуб за стеной (2.7.0): удар баса, огибающая и темп уходят в CSS (--sca-kick, --sca-bass, --sca-energy, --sca-sweep).
    // По ним светится «щель под дверью» внизу, ходят лучи и чуть вздрагивают края окна. Пишется только заметная разница
    const clubShown: Record<string, number> = {};
    let bassNow = 0;
    let shakeBeat = 0;
    let shakeAngle = 0;
    function clubVar(name: string, value: number, step: number): void {
        if (Math.abs((clubShown[name] ?? -1) - value) < step) return;
        clubShown[name] = value;
        document.documentElement.style.setProperty(name, value.toFixed(3));
    }
    function clubVars(sound: { bass: number; playing: boolean }, amount: number, calm: boolean): void {
        ensureClub();
        ensureFxButton();
        const scale = FX_SCALE[fx];
        const on = sound.playing && !calm && amount > 0 && scale > 0;
        bassNow += ((on ? sound.bass : 0) - bassNow) * 0.25;
        const kick = on ? Math.min(1, beat.pulse * amount * 1.3 * fxFlash()) : 0;
        clubVar('--sca-kick', kick, 0.03);
        // Тряска на ударе (2.8.1): на каждом ударе выбирается новое направление, и дальше сдвиг идёт вместе с вспышкой.
        // Раньше трясло только затемнение краёв, и тряска была заметна одним рывком
        if (beat.last !== shakeBeat) {
            shakeBeat = beat.last;
            shakeAngle = Math.random() * Math.PI * 2;
        }
        clubVar('--sca-sx', Math.cos(shakeAngle) * kick, 0.03);
        clubVar('--sca-sy', Math.sin(shakeAngle) * kick, 0.03);
        clubVar('--sca-bass', Math.min(1, bassNow * amount * 1.4 * scale), 0.03);
        clubVar('--sca-energy', on ? Math.min(1, (beat.level * 0.7 + beat.drop * 0.6) * amount * 1.4 * scale) : 0, 0.03);
        const sweep = beat.bpm ? (60 / beat.bpm) * 16 : 10;
        if (Math.abs((clubShown.sweep ?? 0) - sweep) > 0.5) {
            clubShown.sweep = sweep;
            document.documentElement.style.setProperty('--sca-sweep', sweep.toFixed(1) + 's');
        }
    }
    // Эффекты (2.7.1, меню с 2.12.4), кнопка справа в баре. Режим один и тот же, что у палитры в шапке и в F1: «Полные эффекты»,
    // «Облегчённо», «Супер лайт», «Без эффектов». Клик по кнопке открывает меню над ней (радио-пункты и ползунок «Интенсивность бита»),
    // а не крутит режимы по кругу. Для клуба, вспышек и анимаций лайка режим сводится к трём уровням: полный, мягкий (без вспышек и
    // толчков, лучи и свет тише) и выключенный. Менять режим может только main: страница шлёт выбор через soundcloudAPI.setEffectsMode
    type FxLevel = 'full' | 'soft' | 'off';
    type FxMode = 'full' | 'light' | 'solid' | 'off';
    const FX_SCALE: Record<FxLevel, number> = { full: 1, soft: 0.45, off: 0 };
    const FX_MODES: FxMode[] = ['full', 'light', 'solid', 'off'];
    const FX_LEVEL: Record<FxMode, FxLevel> = { full: 'full', light: 'soft', solid: 'off', off: 'off' };
    // Язык клиента, как в волне (__scSiteTranslation): lang страницы SoundCloud английский и при русском клиенте,
    // из-за него подсказки бара были «Track actions», «Effects: Full effects»
    const siteLanguage = (window as unknown as { __scSiteTranslation?: { language?: string } }).__scSiteTranslation?.language;
    const ruFx = siteLanguage ? siteLanguage === 'ru' : /^ru/i.test(document.documentElement.lang || navigator.language || '');
    const FX_NAME: Record<FxMode, string> = ruFx
        ? { full: 'Полные эффекты', light: 'Облегчённо', solid: 'Супер лайт', off: 'Без эффектов' }
        : { full: 'Full effects', light: 'Light', solid: 'Super light', off: 'No effects' };
    const FX_TITLE = ruFx ? 'Эффекты' : 'Effects';
    const FX_BEAT = ruFx ? 'Интенсивность бита' : 'Beat intensity';
    const FX_BEAT_HINT = ruFx ? 'Работает в режиме «Полные эффекты»' : 'Works in full effects mode';
    let fxMode: FxMode = FX_MODES.includes(config.mode as FxMode) ? (config.mode as FxMode) : 'full';
    let fx: FxLevel = FX_LEVEL[fxMode];
    // Вспышки и толчки на ударе только в полном режиме
    const fxFlash = (): number => (fx === 'full' ? 1 : 0);
    const FX_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M6.5 1 7.6 4.4 11 5.5 7.6 6.6 6.5 10 5.4 6.6 2 5.5 5.4 4.4zM12 8.5l.7 1.8 1.8.7-1.8.7L12 13.5l-.7-1.8-1.8-.7 1.8-.7zM3.5 11l.5 1.2 1.2.5-1.2.5-.5 1.3-.5-1.3-1.2-.5 1.2-.5z"/></svg>';
    let fxButton: HTMLButtonElement | null = null;
    let fxPop: HTMLElement | null = null;
    let fxSep: HTMLElement | null = null;
    let beatSendTimer: ReturnType<typeof setTimeout> | undefined;
    function applyFx(): void {
        const root = document.documentElement;
        root.classList.toggle('sca-fx-soft', fx === 'soft');
        root.classList.toggle('sca-fx-off', fx === 'off');
        if (fxButton) {
            const name = FX_TITLE + ': ' + FX_NAME[fxMode];
            fxButton.dataset.level = fx;
            fxButton.dataset.mode = fxMode;
            fxButton.title = name;
            fxButton.setAttribute('aria-label', name);
        }
        syncFxMenu();
    }
    function chooseFxMode(mode: FxMode): void {
        closeFxMenu();
        if (mode === fxMode) return;
        fxMode = mode;
        fx = FX_LEVEL[mode];
        applyFx();
        try {
            (window as unknown as { soundcloudAPI?: { setEffectsMode?: (value: string) => void } }).soundcloudAPI?.setEffectsMode?.(mode);
        } catch {
            // канала нет: режим живёт до перезагрузки страницы
        }
    }
    function ensureFxButton(): void {
        if (fxButton?.isConnected) return;
        const host = document.querySelector('.playControls .playControls__elements');
        if (!host) return;
        if (!fxButton) {
            fxButton = document.createElement('button');
            fxButton.type = 'button';
            fxButton.className = 'sca-fx';
            fxButton.innerHTML = FX_ICON;
            fxButton.setAttribute('aria-haspopup', 'menu');
            fxButton.setAttribute('aria-expanded', 'false');
            // Одно действие: клик открывает или закрывает меню. Ни наведения, ни правой кнопки, ни цикла по режимам
            fxButton.addEventListener('click', (event) => {
                event.stopPropagation();
                if (fxPop?.classList.contains('on')) closeFxMenu();
                else openFxMenu();
            });
        }
        // Тонкий разделитель: слева действия над текущим треком, справа то, что к нему не относится
        if (!fxSep?.isConnected) {
            fxSep ??= Object.assign(document.createElement('span'), { className: 'sca-bar-sep' });
            fxSep.setAttribute('aria-hidden', 'true');
            host.append(fxSep);
        }
        host.append(fxButton);
        applyFx();
        onFitResize();
    }
    function buildFxMenu(): HTMLElement {
        const pop = Object.assign(document.createElement('div'), { className: 'sca-fx-pop' });
        pop.setAttribute('role', 'menu');
        pop.setAttribute('aria-label', FX_TITLE);
        for (const mode of FX_MODES) {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'sca-fx-item';
            item.dataset.mode = mode;
            item.setAttribute('role', 'menuitemradio');
            const dot = document.createElement('i');
            dot.setAttribute('aria-hidden', 'true');
            const text = document.createElement('span');
            text.textContent = FX_NAME[mode];
            item.append(dot, text);
            item.addEventListener('click', (event) => {
                event.stopPropagation();
                chooseFxMode(mode);
                fxButton?.focus();
            });
            pop.append(item);
        }
        const sep = document.createElement('div');
        sep.className = 'sca-fx-hr';
        sep.setAttribute('role', 'separator');
        const group = document.createElement('div');
        group.className = 'sca-fx-beat';
        group.title = FX_BEAT_HINT;
        const row = document.createElement('div');
        row.className = 'row';
        const name = document.createElement('span');
        name.textContent = FX_BEAT;
        const out = document.createElement('output');
        row.append(name, out);
        const range = document.createElement('input');
        range.type = 'range';
        range.min = '0';
        range.max = '100';
        range.setAttribute('aria-label', FX_BEAT);
        range.addEventListener('input', () => {
            const value = Number(range.value);
            out.textContent = value + '%';
            cfg = { ...cfg, appearance: { ...cfg.appearance, beat: value } };
            // Сохраняется через main (тот же appearance, что в F1), не чаще раза в 90 мс
            clearTimeout(beatSendTimer);
            beatSendTimer = setTimeout(() => {
                try {
                    (window as unknown as { soundcloudAPI?: { setBeat?: (value: number) => void } }).soundcloudAPI?.setBeat?.(value);
                } catch {
                    // канала нет: изменение живёт до перезагрузки страницы
                }
            }, 90);
        });
        group.append(row, range);
        pop.append(sep, group);
        pop.addEventListener('keydown', (event) => {
            if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
            const stops = [...pop.querySelectorAll<HTMLElement>('.sca-fx-item, input:not(:disabled)')];
            const at = stops.indexOf(document.activeElement as HTMLElement);
            const next = stops[(at + (event.key === 'ArrowDown' ? 1 : -1) + stops.length) % stops.length];
            if (event.target instanceof HTMLInputElement && event.target.type === 'range') return;
            event.preventDefault();
            next?.focus();
        });
        return pop;
    }
    /** Радио-пункты и ползунок показывают текущее: режим из main и силу бита из настроек */
    function syncFxMenu(): void {
        if (!fxPop) return;
        for (const item of fxPop.querySelectorAll<HTMLElement>('.sca-fx-item')) {
            const checked = item.dataset.mode === fxMode;
            item.classList.toggle('on', checked);
            item.setAttribute('aria-checked', String(checked));
        }
        const range = fxPop.querySelector('input') as HTMLInputElement;
        const out = fxPop.querySelector('output') as HTMLOutputElement;
        // Под рукой ползунок не трогаем: ответ main отстаёт на долю секунды и дёргал бы его назад
        if (document.activeElement !== range) {
            range.value = String(cfg.appearance.beat);
            out.textContent = cfg.appearance.beat + '%';
        }
        // Вне полного режима сила бита всё равно ноль: ползунок не обещает того, чего не будет
        range.disabled = fxMode !== 'full';
        fxPop.querySelector('.sca-fx-beat')?.classList.toggle('off', fxMode !== 'full');
    }
    function openFxMenu(): void {
        if (!fxButton) return;
        fxPop ??= buildFxMenu();
        syncFxMenu();
        if (!fxPop.isConnected) document.body.append(fxPop);
        const box = fxButton.getBoundingClientRect();
        fxPop.style.left = Math.max(125, Math.min(window.innerWidth - 125, box.left + box.width / 2)) + 'px';
        fxPop.style.top = box.top - 8 + 'px';
        fxPop.classList.add('on');
        fxButton.setAttribute('aria-expanded', 'true');
        fxPop.querySelector<HTMLElement>('.sca-fx-item.on')?.focus();
    }
    function closeFxMenu(): void {
        fxPop?.classList.remove('on');
        fxButton?.setAttribute('aria-expanded', 'false');
    }
    const onFxAway = (event: Event): void => {
        if (!fxPop?.classList.contains('on')) return;
        if (event.target instanceof Node && (fxPop.contains(event.target) || fxButton?.contains(event.target))) return;
        closeFxMenu();
    };
    const onFxKey = (event: KeyboardEvent): void => {
        if (event.key === 'Escape' && fxPop?.classList.contains('on')) {
            closeFxMenu();
            fxButton?.focus();
        }
    };
    document.addEventListener('pointerdown', onFxAway, true);
    document.addEventListener('keydown', onFxKey, true);
    window.addEventListener('resize', closeFxMenu);
    applyFx();
    // Ряд кнопок справа (2.12.2): когда он не помещается, второстепенные кнопки уходят в меню «…», а не обрезаются и не
    // наползают на название. Лайк, «Не нравится» (2.15.7: оценка трека, её не находили в «…»), кнопка эффектов и сама «…»
    // остаются всегда. Порядок ухода: «К дропу», «Больше такого», «Волна от трека», «Следующим», подписка, очередь.
    // Скрытая кнопка живая: пункт меню нажимает её
    const OVF_ORDER = ['drop', 'more', 'wave', 'next', 'follow', 'queue'];
    const OVF_SELECTOR: Record<string, string> = {
        drop: '[data-act="drop"]',
        more: '[data-act="more"]',
        wave: '[data-act="wave"]',
        next: '[data-act="next"]',
        follow: '.sc-button-follow',
        queue: '[class*="showQueue"]',
    };
    const OVF_LABEL: Record<string, string> = ruFx
        ? { drop: 'К дропу', more: 'Больше такого', wave: 'Волна по треку', next: 'Слушать следующим', follow: 'Подписаться', dislike: 'Не нравится', queue: 'Очередь' }
        : { drop: 'Jump to the drop', more: 'More like this', wave: 'Wave from track', next: 'Play next', follow: 'Follow', dislike: 'Dislike', queue: 'Queue' };
    let moreButton: HTMLButtonElement | null = null;
    let morePop: HTMLElement | null = null;
    let fitBusy = false;
    let fitKey = '';
    const OVF_DOTS = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="3" cy="8" r="1.4" fill="currentColor"/><circle cx="8" cy="8" r="1.4" fill="currentColor"/><circle cx="13" cy="8" r="1.4" fill="currentColor"/></svg>';
    function ovfItems(actions: Element): Array<{ key: string; node: HTMLElement }> {
        const list: Array<{ key: string; node: HTMLElement }> = [];
        for (const key of OVF_ORDER) {
            const node = actions.querySelector<HTMLElement>(OVF_SELECTOR[key]);
            if (node) list.push({ key, node });
        }
        return list;
    }
    function closeMore(): void {
        morePop?.classList.remove('on');
        moreButton?.setAttribute('aria-expanded', 'false');
    }
    function openMore(): void {
        const actions = moreButton?.parentElement;
        if (!moreButton || !actions) return;
        const hiddenItems = ovfItems(actions).filter((item) => item.node.classList.contains('sca-ovf'));
        if (!hiddenItems.length) return;
        morePop ??= Object.assign(document.createElement('div'), { className: 'sca-more-pop' });
        morePop.setAttribute('role', 'menu');
        morePop.textContent = '';
        for (const item of hiddenItems) {
            const row = document.createElement('button');
            row.type = 'button';
            row.className = 'sca-more-item';
            row.setAttribute('role', 'menuitem');
            const icon = item.node.querySelector('svg');
            if (icon) row.append(icon.cloneNode(true));
            const text = document.createElement('span');
            text.textContent = item.node.getAttribute('aria-label') || item.node.getAttribute('title') || OVF_LABEL[item.key];
            row.append(text);
            row.addEventListener('click', (event) => {
                event.stopPropagation();
                closeMore();
                item.node.click();
            });
            morePop.append(row);
        }
        if (!morePop.isConnected) document.body.append(morePop);
        const box = moreButton.getBoundingClientRect();
        morePop.style.right = Math.max(8, window.innerWidth - box.right) + 'px';
        morePop.style.bottom = window.innerHeight - box.top + 8 + 'px';
        morePop.classList.add('on');
        moreButton.setAttribute('aria-expanded', 'true');
        morePop.querySelector<HTMLElement>('button')?.focus();
    }
    type TrackMenu = (request: { anchor: HTMLElement; byKeyboard: boolean; extras: Array<{ id: string; label: string; icon?: string; run(): void }> }) => boolean;
    const trackMenu = (): TrackMenu | undefined => (host as { __scTrackMenu?: TrackMenu }).__scTrackMenu;
    // Пункты места: скрытые кнопки бара, которых нет в общем наборе меню трека
    const OVF_EXTRA = ['follow', 'queue'];
    function openTrackMenu(byKeyboard: boolean): boolean {
        const open = trackMenu();
        const actions = moreButton?.parentElement;
        if (!open || !moreButton || !actions) return false;
        closeMore();
        const extras = ovfItems(actions)
            .filter((item) => OVF_EXTRA.includes(item.key) && item.node.classList.contains('sca-ovf'))
            .map((item) => ({
                id: item.key,
                label: item.node.getAttribute('aria-label') || item.node.getAttribute('title') || OVF_LABEL[item.key],
                icon: item.node.querySelector('svg')?.outerHTML,
                run: () => item.node.click(),
            }));
        return open({ anchor: moreButton, byKeyboard, extras });
    }
    function ensureMoreButton(actions: HTMLElement): HTMLButtonElement {
        if (!moreButton) {
            moreButton = document.createElement('button');
            moreButton.type = 'button';
            moreButton.className = 'sca-more';
            moreButton.innerHTML = OVF_DOTS;
            moreButton.title = ruFx ? 'Действия с треком' : 'Track actions';
            moreButton.setAttribute('aria-label', moreButton.title);
            moreButton.setAttribute('aria-haspopup', 'menu');
            moreButton.setAttribute('aria-expanded', 'false');
            // 2.13.6: «⋯» открывает то же меню трека, что правый клик (wave/menu.ts): полный набор действий играющего трека
            // плюс ушедшие в «⋯» кнопки бара, которым в нём места нет (подписка, очередь). Без раздела волны — прежний список
            moreButton.dataset.trackMenu = 'bar';
            moreButton.addEventListener('click', (event) => {
                event.stopPropagation();
                if (openTrackMenu(event.detail === 0)) return;
                if (morePop?.classList.contains('on')) closeMore();
                else openMore();
            });
            // Стрелка вниз на кнопке открывает меню и встаёт на первый пункт
            moreButton.addEventListener('keydown', (event) => {
                if (event.key !== 'ArrowDown' || moreButton?.getAttribute('aria-expanded') === 'true') return;
                if (openTrackMenu(true)) event.preventDefault();
            });
        }
        if (moreButton.parentElement !== actions) actions.append(moreButton);
        return moreButton;
    }
    // Не помещается: название трека сжато меньше ~110 px или хвост ряда вылез за край окна
    function barTight(elements: HTMLElement, actions: HTMLElement): boolean {
        const edge = Math.min(document.documentElement.clientWidth, elements.getBoundingClientRect().right) - 8;
        const tail = fxButton?.isConnected ? fxButton : actions;
        if (tail.getBoundingClientRect().right > edge + 0.5) return true;
        const badge = actions.closest<HTMLElement>('.playbackSoundBadge');
        if (!badge) return false;
        const avatar = badge.querySelector<HTMLElement>('.playbackSoundBadge__avatar');
        const free = badge.getBoundingClientRect().width - actions.getBoundingClientRect().width - (avatar?.getBoundingClientRect().width ?? 40) - 16;
        return free < 110;
    }
    function fitBar(): void {
        if (fitBusy) return;
        const elements = document.querySelector<HTMLElement>('.playControls .playControls__elements');
        const actions = elements?.querySelector<HTMLElement>('.playbackSoundBadge__actions');
        if (!elements || !actions) return;
        fitBusy = true;
        try {
            const more = ensureMoreButton(actions);
            const items = ovfItems(actions);
            for (const item of items) item.node.classList.remove('sca-ovf');
            // С меню трека «⋯» видна всегда: в нём полный набор действий, а не только ушедшие кнопки
            more.classList.toggle('on', !!trackMenu());
            if (barTight(elements, actions)) {
                more.classList.add('on');
                for (const item of items) {
                    item.node.classList.add('sca-ovf');
                    if (!barTight(elements, actions)) break;
                }
            }
            if (!more.classList.contains('on') || !actions.querySelector('.sca-ovf')) closeMore();
        } finally {
            fitBusy = false;
        }
    }
    // Пересчёт по изменению размера и по составу ряда (сайт и док перерисовывают кнопки сами)
    function fitSignature(): string {
        const actions = document.querySelector('.playControls .playbackSoundBadge__actions');
        const chip = document.querySelector('.playControls .scj-chip');
        return [window.innerWidth, actions?.querySelectorAll('button,a').length ?? 0, chip?.textContent ?? '', fxButton?.isConnected ? 1 : 0].join('|');
    }
    // Подсказка и подпись для скринридера у кнопки повтора: выкл / очередь / трек
    function syncRepeat(): void {
        const button = document.querySelector<HTMLElement>('.playControls .repeatControl');
        if (!button) return;
        const label = repeatLabel(repeatMode(button.className), ruFx);
        if (button.title !== label) button.title = label;
        if (button.getAttribute('aria-label') !== label) button.setAttribute('aria-label', label);
    }
    document.addEventListener('click', (event) => {
        if ((event.target as Element | null)?.closest?.('.repeatControl')) setTimeout(syncRepeat, 80);
    }, true);
    function fitTick(force = false): void {
        syncRepeat();
        const key = fitSignature();
        if (!force && key === fitKey) return;
        fitKey = key;
        fitBar();
    }
    let fitFrame = 0;
    // Изменение размера окна: на время тяжёлые эффекты (стекло, анимации, пересоздание холста) отключаются, иначе страница
    // перестраивается на каждый кадр и рывками отстаёт от рамки окна
    let resizing = false;
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    const onFitResize = (): void => {
        if (!resizing) {
            resizing = true;
            document.documentElement.classList.add('scm-resizing');
        }
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            resizing = false;
            document.documentElement.classList.remove('scm-resizing');
            resize();
        }, 180);
        cancelAnimationFrame(fitFrame);
        fitFrame = requestAnimationFrame(() => fitTick(true));
    };
    window.addEventListener('resize', onFitResize);
    const onMoreAway = (event: Event): void => {
        if (!morePop?.classList.contains('on')) return;
        if (event.target instanceof Node && (morePop.contains(event.target) || moreButton?.contains(event.target))) return;
        closeMore();
    };
    const onMoreKey = (event: KeyboardEvent): void => {
        if (event.key === 'Escape' && morePop?.classList.contains('on')) {
            closeMore();
            moreButton?.focus();
        }
    };
    document.addEventListener('pointerdown', onMoreAway, true);
    document.addEventListener('keydown', onMoreKey, true);
    let club: HTMLElement | null = null;
    let thump: HTMLElement | null = null;
    function ensureClub(): void {
        if (club?.isConnected && thump?.isConnected) return;
        if (!document.body) return;
        if (!club) {
            club = document.createElement('div');
            club.id = 'sca-club';
            club.setAttribute('aria-hidden', 'true');
            for (const name of ['door', 'beam l', 'beam r']) {
                const layer = document.createElement('i');
                layer.className = name;
                club.append(layer);
            }
        }
        if (!thump) {
            thump = document.createElement('div');
            thump.id = 'sca-thump';
            thump.setAttribute('aria-hidden', 'true');
        }
        if (!club.isConnected) document.body.prepend(club);
        if (!thump.isConnected) document.body.append(thump);
    }
    const reduceQuery = matchMedia('(prefers-reduced-motion: reduce)');
    const motionCalm = (): boolean => reduceQuery.matches || document.documentElement.classList.contains('scm-reduce');
    let lastAudio = 0;
    let idleShown = false;
    let idleAt = 0;
    function draw(now: number): void {
        frame = requestAnimationFrame(draw);
        if (document.hidden) {
            perfAt = 0;
            return;
        }
        // Без фокуса (пользователь в игре или другом окне): не больше ~8 кадров в секунду на всё, лучи на паузе.
        // Звук не затрагивается: анализатор только читает
        const idle = shouldThrottleIdle((host as { __scAppIdle?: boolean }).__scAppIdle === true, cfg.appearance.keepFramesUnfocused, (host as { __scClipRec?: boolean }).__scClipRec === true);
        if (idle !== idleShown) {
            idleShown = idle;
            document.documentElement.classList.toggle('sca-idle', idle);
            last = 0;
        }
        if (idle) {
            if (now - idleAt < 120) return;
            idleAt = now;
            perfAt = 0;
        }
        // Звук и детектор бита идут каждый кадр, а не с частотой фона (2.8.0): на «Балансе» фон рисуется 30 раз в секунду,
        // и удар опаздывал до 33 мс и дрожал. Вспышки интерфейса тоже пишутся сразу
        const a = cfg.appearance;
        const amount = beatAmount(a.beat);
        const audioDt = lastAudio ? Math.min(100, now - lastAudio) : 16;
        lastAudio = now;
        const sound = amount > 0 ? readAudio(now) : { bass: 0, kick: 0, level: 0, playing: musicPlaying() };
        if (amount > 0) beatStep(beat, sound.kick, sound.level, now, audioDt);
        else beat.pulse = beat.level = 0;
        // Просьба системы или клиента о меньшем движении: фон течёт спокойно, как на паузе, без разгона под бит
        const paused = a.calmOnPause && !sound.playing;
        const calm = paused || motionCalm();
        markPlaying(sound.playing);
        clubVars(sound, amount, calm);
        if (cfg.appearance.effect === 'off' || !gl || lost) {
            // Без фона класс игры всё равно живёт: ему нужен только анализатор
            return;
        }
        if (!gl || !canvas || lost) return;
        const step = 1000 / fpsCap();
        if (now - last < step - 1) return;
        const dt = last ? Math.min(100, now - last) : 16;
        last = now;
        if (!perfAt) {
            perfAt = now;
            perfSum = perfN = 0;
        } else {
            perfSum += dt;
            perfN++;
            if (now - perfAt > 4000) {
                if (sound.playing && perfN > 24 && perfSum / perfN > step * 1.7 && thin > 0.56) thin = Math.max(0.55, thin - 0.15);
                perfAt = now;
                perfSum = perfN = 0;
            }
        }
        if (!useEffect(cfg.appearance.effect)) return;
        // Пока тянут край окна, холст не пересоздаётся каждый кадр: он растянут CSS, размер применится после остановки
        if (!resizing) resize();
        // Темп трека ведёт скорость: 120 ударов в минуту это обычная скорость, громкость ещё прибавляет
        const tempo = beat.bpm ? Math.min(1.5, Math.max(0.7, beat.bpm / 120)) : 1;
        // Темп и громкость двигают скорость мягко, дроп разгоняет фон почти вдвое; никаких вспышек на ударах
        // Ритм ведёт скорость: громкость относительно своей средней по треку и плотность ударов за 4 с (3 удара в секунду
        // это много). Быстрее и плотнее стало, фон ускоряется за ~0,6 с; дроп добавляет сверху; назад за ~1,5 с
        const rel = Math.min(1.8, Math.max(0.4, beat.short / (beat.long + 0.02)));
        const density = Math.min(1, beat.beats.filter((at) => now - at < 4000).length / 12);
        // 2.7.1: под бит вода растекается заметно быстрее: коэффициенты в полтора раза больше, потолок 3.6, разгон за 0,35 с
        const drive = 1 + amount * ((tempo - 1) * 0.8 + (rel - 1) * 1.4 + (density - 0.3) * 1.5 + beat.drop * 1.3 + beat.level * 0.6);
        const speedWant = calm ? 0.18 : Math.min(3.6, Math.max(0.6, drive));
        speedNow += (speedWant - speedNow) * Math.min(1, dt / (speedWant > speedNow ? 350 : 1200));
        // Каждый удар даёт короткий толчок скорости (затухает за ~0,2 с): фон попадает в ритм, а не только ускоряется в среднем.
        // Это движение, а не вспышка: яркость не меняется
        const kick = calm ? 0 : beat.pulse * amount * 0.9;
        time += (dt / 1000) * (0.15 + (a.speed / 100) * 2.2) * (speedNow + kick);
        // Дроп виден и интерфейсу (--sca-drop): свечение бара чуть сильнее. Меняется плавно, без миганий
        const drop = calm ? 0 : beat.drop * amount;
        if (Math.abs(drop - cssPulse) > 0.05) {
            cssPulse = drop;
            document.documentElement.style.setProperty('--sca-drop', drop.toFixed(2));
        }
        const k = Math.min(1, dt / 400);
        colorsNow = colorsNow.map((c, i) => c.map((v, j) => v + (colorsWant[i][j] - v) * k) as [number, number, number]);
        mouse[0] += (mouseWant[0] - mouse[0]) * Math.min(1, dt / 600);
        mouse[1] += (mouseWant[1] - mouse[1]) * Math.min(1, dt / 600);
        gl.uniform2f(uniforms.u_res, canvas.width, canvas.height);
        gl.uniform1f(uniforms.u_time, time);
        gl.uniform3fv(uniforms.u_c1, colorsNow[0]);
        gl.uniform3fv(uniforms.u_c2, colorsNow[1]);
        gl.uniform3fv(uniforms.u_c3, colorsNow[2]);
        gl.uniform1f(uniforms.u_intensity, (0.25 + (a.intensity / 100) * 0.85) * (paused ? 0.82 : 1));
        gl.uniform1f(uniforms.u_grain, a.grain / 100);
        gl.uniform2f(uniforms.u_mouse, mouse[0], mouse[1]);
        gl.uniform1f(uniforms.u_seed, seed);
        gl.uniform1f(uniforms.u_pulse, kick * 0.55 * fxFlash());
        gl.uniform1f(uniforms.u_energy, calm ? 0 : (beat.level * 0.4 + beat.drop * 0.6) * amount);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        canvas.classList.add('on');
    }
    // Лайк: сердечко пружинит, из кнопки вылетают сердечки в цветах обложки, плашка трека коротко «вибрирует», как
    // тактильный отклик; звук мягкий колокольчик. Только на «поставить»
    const LIKE = '.sc-button-like, .playbackSoundBadge__like, #sc-wave .scw-like[data-act="like"], .queueItemView__like';
    // Плашка, которая вибрирует на лайке
    const PLATE = '.playControls__inner, .soundList__item, .trackList__item, .compactTrackList__item, .systemPlaylistTrackList__item, .queueItemView, .listenEngagement, .sound';
    // Звуки лайка и дизлайка (2.13.6): мягкий колокольчик и тихая деревянная нота, модуль uiSound. Молчат, когда звук сайта выключен
    const uiSound = createUiSound({ muted: () => !!document.querySelector('.playControls .volume.muted') });
    const HEART_PATH = 'M8 14.2 6.9 13.2C3 9.7.5 7.4.5 4.6.5 2.3 2.3.5 4.6.5c1.3 0 2.5.6 3.4 1.6C8.9 1.1 10.1.5 11.4.5c2.3 0 4.1 1.8 4.1 4.1 0 2.8-2.5 5.1-6.4 8.6z';
    const reduced = (): boolean => fx === 'off' || document.documentElement.classList.contains('scm-reduce') || matchMedia('(prefers-reduced-motion: reduce)').matches;
    function vibrate(plate: Element | null): void {
        (plate as HTMLElement | null)?.animate?.(
            [
                { transform: 'translate3d(0,0,0) scale(1)' },
                { transform: 'translate3d(-2px,0,0) scale(1.006)' },
                { transform: 'translate3d(2px,0,0) scale(1.006)' },
                { transform: 'translate3d(-1.5px,0,0) scale(1.004)' },
                { transform: 'translate3d(1px,0,0) scale(1.002)' },
                { transform: 'translate3d(0,0,0) scale(1)' },
            ],
            { duration: 280, easing: 'linear' },
        );
    }
    function heartNode(size: number, color: string, glow: string): HTMLElement {
        const node = document.createElement('i');
        node.style.cssText = `position:absolute;left:${-size / 2}px;top:${-size / 2}px;width:${size}px;height:${size}px;filter:drop-shadow(0 0 6px ${glow})`;
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 16 16');
        svg.setAttribute('width', '100%');
        svg.setAttribute('height', '100%');
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', HEART_PATH);
        path.setAttribute('fill', color);
        svg.append(path);
        node.append(svg);
        return node;
    }
    function burst(button: Element): void {
        const box = button.getBoundingClientRect();
        const cx = box.left + box.width / 2;
        const cy = box.top + box.height / 2;
        const layer = document.createElement('div');
        layer.style.cssText = `position:fixed;left:${cx}px;top:${cy}px;width:0;height:0;z-index:2147483600;pointer-events:none`;
        const colors = targetColors();
        // Мягкая вспышка цвета под кнопкой
        const glow = document.createElement('i');
        glow.style.cssText = `position:absolute;left:-26px;top:-26px;width:52px;height:52px;border-radius:50%;background:radial-gradient(circle,${colors[0]}88,transparent 70%)`;
        layer.append(glow);
        glow.animate([{ transform: 'scale(.3)', opacity: 1 }, { transform: 'scale(1.6)', opacity: 0 }], { duration: 520, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' });
        // Сердечки взлетают веером и покачиваются
        for (let i = 0; i < 7; i++) {
            const heart = heartNode(10 + Math.random() * 8, i % 3 === 0 ? '#ffffff' : colors[i % 3] ?? colors[0], colors[0] + 'aa');
            layer.append(heart);
            const spread = (i - 3) * 13 + (Math.random() - 0.5) * 8;
            const rise = 46 + Math.random() * 34;
            const tilt = (Math.random() - 0.5) * 50;
            heart.animate(
                [
                    { transform: 'translate(0,0) scale(.2) rotate(0deg)', opacity: 0 },
                    { transform: `translate(${spread * 0.4}px,${-rise * 0.35}px) scale(1.1) rotate(${tilt * 0.3}deg)`, opacity: 1, offset: 0.25 },
                    { transform: `translate(${spread * 0.8 + 6}px,${-rise * 0.75}px) scale(1) rotate(${-tilt * 0.4}deg)`, opacity: 0.9, offset: 0.65 },
                    { transform: `translate(${spread}px,${-rise}px) scale(.7) rotate(${tilt}deg)`, opacity: 0 },
                ],
                { duration: 760 + Math.random() * 260, delay: i * 25, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'both' },
            );
        }
        document.body.append(layer);
        setTimeout(() => layer.remove(), 1300);
        (button as HTMLElement).animate?.(
            [{ transform: 'scale(1)' }, { transform: 'scale(.78)', offset: 0.25 }, { transform: 'scale(1.28)', offset: 0.6 }, { transform: 'scale(.96)', offset: 0.82 }, { transform: 'scale(1)' }],
            { duration: 460, easing: 'ease-out' },
        );
    }
    // Дизлайк: кнопка коротко качает «нет», а плашка трека уезжает влево, и следующий трек въезжает справа
    const DISLIKE = '.scd-dock button[data-act="dislike"], #sc-wave .scw-like[data-act="dislike"], .scw-menu [data-menu="dislike"]';
    function swipe(button: Element): void {
        (button as HTMLElement).animate?.(
            [{ transform: 'rotate(0)' }, { transform: 'rotate(-14deg) translateY(1px)' }, { transform: 'rotate(10deg)' }, { transform: 'rotate(-4deg)' }, { transform: 'rotate(0)' }],
            { duration: 360, easing: 'ease-out' },
        );
        const plates = [document.querySelector('#sc-wave .scw-body'), document.querySelector('.playControls .playbackSoundBadge')];
        for (const plate of plates) {
            if (!(plate instanceof HTMLElement)) continue;
            const parts = plate.matches('#sc-wave .scw-body') ? [...plate.children].filter((node): node is HTMLElement => node instanceof HTMLElement) : [plate];
            parts.forEach((part, i) => {
                const out = part.animate(
                    [
                        { transform: 'translateX(0) rotate(0)', opacity: 1, filter: 'blur(0)' },
                        { transform: 'translateX(-70px) rotate(-1.5deg)', opacity: 0, filter: 'blur(6px)' },
                    ],
                    { duration: 260, delay: i * 30, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' },
                );
                out.finished
                    .then(() => {
                        out.cancel();
                        if (!part.isConnected) return;
                        part.animate(
                            [
                                { transform: 'translateX(70px) rotate(1.5deg)', opacity: 0, filter: 'blur(6px)' },
                                { transform: 'translateX(0) rotate(0)', opacity: 1, filter: 'blur(0)' },
                            ],
                            { duration: 420, delay: 140 + i * 40, easing: 'cubic-bezier(.2,.9,.25,1)', fill: 'backwards' },
                        );
                    })
                    .catch(() => undefined);
            });
        }
    }
    const onLikeClick = (event: MouseEvent): void => {
        const disliked = event.target instanceof Element ? event.target.closest(DISLIKE) : null;
        if (disliked && disliked.getAttribute('aria-pressed') !== 'true') {
            if (!reduced()) swipe(disliked);
            if (cfg.appearance.likeSound) uiSound.play('dislike');
            return;
        }
        const button = event.target instanceof Element ? event.target.closest(LIKE) : null;
        if (!button) return;
        const was = button.classList.contains('sc-button-selected') || button.getAttribute('aria-pressed') === 'true';
        if (was) return;
        if (!reduced()) {
            burst(button);
            vibrate(button.closest(PLATE));
        }
        if (cfg.appearance.likeSound) uiSound.play('like');
    };
    document.addEventListener('click', onLikeClick, true);
    // html.sca-playing: интерфейс раскрывается, когда играет музыка (обложки в полный рост, свечение бара)
    function markPlaying(playing: boolean): void {
        if (playing === playingShown) return;
        playingShown = playing;
        document.documentElement.classList.toggle('sca-playing', playing);
    }
    // Подсветка за курсором: у карточки под мышью класс sc2-spot и координаты --mx, --my, раз в кадр
    const SPOT = '.scw-card, .scw-tile, .scv-card, .sidebarModule, .scw-lib, .scw-mix';
    let spotFrame = 0;
    let spotEvent: PointerEvent | null = null;
    // Стекло карточки волны: координаты курсора в --gx, --gy и наклон в --tx, --ty, раз в кадр вместе с подсветкой
    let tilted: HTMLElement | null = null;
    const reducedGlass = (): boolean => fx === 'off' || document.documentElement.classList.contains('scm-reduce') || matchMedia('(prefers-reduced-motion: reduce)').matches;
    function glassTilt(event: PointerEvent | null): void {
        const card = event?.target instanceof Element ? event.target.closest<HTMLElement>('#sc-wave .scw-body') : null;
        if (tilted && tilted !== card) {
            tilted.style.removeProperty('--tx');
            tilted.style.removeProperty('--ty');
            tilted.classList.remove('sc2-glass-on');
            tilted = null;
        }
        if (!card || !event || reducedGlass()) return;
        const box = card.getBoundingClientRect();
        const x = Math.max(0, Math.min(1, (event.clientX - box.left) / Math.max(1, box.width)));
        const y = Math.max(0, Math.min(1, (event.clientY - box.top) / Math.max(1, box.height)));
        card.style.setProperty('--tx', ((x - 0.5) * 3).toFixed(2) + 'deg');
        card.style.setProperty('--ty', ((0.5 - y) * 2.4).toFixed(2) + 'deg');
        card.style.setProperty('--gx', (x * 100).toFixed(1) + '%');
        card.style.setProperty('--gy', (y * 100).toFixed(1) + '%');
        card.classList.add('sc2-glass-on');
        tilted = card;
    }
    const onSpotLeave = (event: PointerEvent): void => {
        if (!event.relatedTarget) glassTilt(null);
    };
    document.addEventListener('pointerout', onSpotLeave, { passive: true });
    // Пустая полоса справа: модуль, у которого всё содержимое спрятано (display:none от блокировщика или сайта),
    // CSS по :has не ловит, потому что спрятанные заголовки и ссылки в нём остаются. Видимое содержимое меряется раз в 1,5 с
    function hideVoidModules(): void {
        for (const module of document.querySelectorAll<HTMLElement>('.sidebarModule')) {
            let visible = false;
            for (const child of module.children) {
                const rect = child.getBoundingClientRect();
                if (rect.height > 2 && rect.width > 2) {
                    visible = true;
                    break;
                }
            }
            if (module.classList.contains('sc2-void') === visible) module.classList.toggle('sc2-void', !visible);
        }
    }
    const onSpot = (event: PointerEvent): void => {
        spotEvent = event;
        if (spotFrame) return;
        spotFrame = requestAnimationFrame(() => {
            spotFrame = 0;
            glassTilt(spotEvent);
            const target = spotEvent?.target instanceof Element ? spotEvent.target.closest<HTMLElement>(SPOT) : null;
            if (!target || !spotEvent) return;
            if (!target.classList.contains('sc2-spot')) target.classList.add('sc2-spot');
            const box = target.getBoundingClientRect();
            target.style.setProperty('--mx', spotEvent.clientX - box.left + 'px');
            target.style.setProperty('--my', spotEvent.clientY - box.top + 'px');
        });
    };
    document.addEventListener('pointermove', onSpot, { passive: true });
    const onMove = (event: PointerEvent): void => {
        if (!cfg.appearance.parallax) {
            mouseWant[0] = mouseWant[1] = 0;
            return;
        }
        mouseWant[0] = (event.clientX / window.innerWidth - 0.5) * 2;
        mouseWant[1] = -(event.clientY / window.innerHeight - 0.5) * 2;
    };

    function apply(next: AuroraConfig): void {
        const effectChanged = next.appearance.effect !== cfg.appearance.effect;
        cfg = next;
        // Режим эффектов сменили в шапке или в F1: кнопка и меню в баре показывают то же
        if (next.mode && next.mode !== fxMode && FX_MODES.includes(next.mode as FxMode)) {
            fxMode = next.mode as FxMode;
            fx = FX_LEVEL[fxMode];
            applyFx();
        } else if (fxPop?.classList.contains('on')) syncFxMenu();
        if (cfg.appearance.palette !== 'cover') coverUrl = '';
        retarget();
        sampleCover();
        if (canvas) {
            canvas.style.display = cfg.appearance.effect === 'off' ? 'none' : 'block';
            if (effectChanged && cfg.appearance.effect !== 'off') {
                // Смена эффекта: холст гаснет и проявляется заново
                canvas.classList.remove('on');
            }
        }
        last = 0;
    }

    if (!setup()) {
        // Без WebGL фона нет, линия прогресса и класс игры всё равно работают
        cfg = { ...cfg, appearance: { ...cfg.appearance, effect: 'off' } };
    }
    apply(cfg);
    frame = requestAnimationFrame(draw);
    window.addEventListener('pointermove', onMove, { passive: true });
    const coverTimer = setInterval(() => {
        if (document.hidden) return;
        sampleCover();
        hideVoidModules();
        fitTick();
    }, 1500);
    host.__scAuroraPalette = (colors: string[]) => {
        if (!Array.isArray(colors) || !colors.length) return;
        coverColors = colors.slice(0, 3);
        retarget();
    };
    host.__scAurora = {
        update: apply,
        dispose() {
            cancelAnimationFrame(frame);
            cancelAnimationFrame(fitFrame);
            clearTimeout(resizeTimer);
            document.documentElement.classList.remove('scm-resizing');
            clearInterval(coverTimer);
            window.removeEventListener('resize', onFitResize);
            document.removeEventListener('pointerdown', onMoreAway, true);
            document.removeEventListener('keydown', onMoreKey, true);
            for (const node of document.querySelectorAll('.playControls .sca-ovf')) node.classList.remove('sca-ovf');
            moreButton?.remove();
            morePop?.remove();
            window.removeEventListener('pointermove', onMove);
            canvas?.remove();
            // Холст линии прогресса прошлых версий, если остался на странице
            document.getElementById('sca-line')?.remove();
            club?.remove();
            thump?.remove();
            fxButton?.remove();
            fxSep?.remove();
            fxPop?.remove();
            clearTimeout(beatSendTimer);
            window.removeEventListener('resize', closeFxMenu);
            document.removeEventListener('pointerdown', onFxAway, true);
            document.removeEventListener('keydown', onFxKey, true);
            document.removeEventListener('click', onLikeClick, true);
            uiSound.dispose();
            document.removeEventListener('pointermove', onSpot);
            document.removeEventListener('pointerout', onSpotLeave);
            document.documentElement.classList.remove('sca-line', 'sca-playing', 'sca-idle');
            try {
                if (tappedGain && analyser) tappedGain.disconnect(analyser);
            } catch {
                // уже снят
            }
            delete host.__scAurora;
            delete host.__scAuroraPalette;
        },
    };
    window.addEventListener('pagehide', () => host.__scAurora?.dispose(), { once: true });
}

const VERTEX = 'attribute vec2 a_pos; void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }';

/** Скрипт для страницы сайта с текущими настройками оформления */
export function auroraScript(input: unknown, mode?: string): string {
    const appearance = normalizeAppearance(input);
    const shaders = Object.fromEntries((Object.keys(SHADERS) as Array<keyof typeof SHADERS>).map((effect) => [effect, fragmentSource(effect)]));
    const config: AuroraConfig = { appearance, colors: paletteColors(appearance), shaders, vertex: VERTEX, mode };
    return '(function(){\n' + glowPalette.toString() + '\n' + createUiSound.toString() + '\n' + beatAmount.toString() + '\n' + shouldThrottleIdle.toString() + '\n' + repeatMode.toString() + '\n' + repeatLabel.toString() + '\n' + beatInit.toString() + '\n' + beatStep.toString() + '\n' + envelopeTempo.toString() + '\n(' + auroraPage.toString() + ')(' + JSON.stringify(config) + ');\n})();';
}
