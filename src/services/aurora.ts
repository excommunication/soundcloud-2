// Оформление: переливы WebGL за сайтом и стеклянные панели поверх них. Эффект, палитра, скорость, яркость, зерно,
// стекло и скругления настраиваются в F1 → Оформление и применяются без перезагрузки.
// Фон это один <canvas> на весь экран под содержимым сайта: полноэкранный треугольник и фрагментный шейдер выбранного
// эффекта. Палитра «Из обложки» берётся у трека в нижнем плеере (тот же разбор цвета, что у света волны, glowPalette).
// Рисуется с пониженным разрешением и ограничением кадров, на скрытом окне не рисуется вовсе, на паузе музыки замедляется.
// auroraPage уходит на страницу текстом: ссылается только на glowPalette, которая идёт объявлением рядом
import * as glowModule from './wave/glow';

const { glowPalette } = glowModule;

export const AURORA_EFFECTS = ['off', 'liquid', 'aurora', 'mesh', 'silk', 'nebula', 'contour'] as const;
export const AURORA_PALETTES = ['cover', 'vice', 'ocean', 'aurum', 'sunset', 'emerald', 'violet', 'ember', 'sakura', 'mono', 'custom'] as const;
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
}

export const APPEARANCE_DEFAULTS: Appearance = {
    effect: 'liquid',
    palette: 'vice',
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
    beat: 65,
    likeSound: true,
};

/** Готовые палитры: три цвета, первый главный */
export const PALETTES: Record<Exclude<AuroraPaletteName, 'cover' | 'custom'>, [string, string, string]> = {
    vice: ['#ff4fa3', '#2b1fb8', '#ffb35c'],
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
    const bool = (key: 'calmOnPause' | 'parallax' | 'hoverMotion' | 'likeSound'): boolean => (typeof value[key] === 'boolean' ? (value[key] as boolean) : APPEARANCE_DEFAULTS[key]);
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
}
export function beatInit(): BeatState {
    return { fast: 0, slow: 0, level: 0, pulse: 0, last: -1e9, beats: [], bpm: 0, short: 0, long: 0, drop: 0 };
}
/** Шаг детектора: bass и level 0..1 в момент now (мс), dt с прошлого шага. Удар это всплеск быстрой огибающей баса над
 *  медленной не чаще раза в 280 мс. Темп по медиане промежутков последних ударов, сведённый в 80..170 ударов в минуту.
 *  Возвращает true на ударе */
export function beatStep(state: BeatState, bass: number, level: number, now: number, dt: number): boolean {
    const ema = (value: number, target: number, tau: number): number => value + (target - value) * (1 - Math.exp(-dt / tau));
    // Первый отсчёт после тишины ставит обе огибающие сразу: иначе разгон медленной даёт ложные удары
    if (state.fast === 0 && state.slow === 0) state.fast = state.slow = bass;
    state.fast = ema(state.fast, bass, 45);
    state.slow = ema(state.slow, bass, 900);
    state.level = ema(state.level, level, 600);
    state.short = ema(state.short, level, 400);
    state.long = ema(state.long, level, 8000);
    // Дроп: громкость за последние полсекунды на треть выше средней за 8 с. Входит за ~1 с, выходит за ~2,5 с
    const dropping = state.short > state.long * 1.35 + 0.02 && state.short > 0.2 ? 1 : 0;
    state.drop = ema(state.drop, dropping, dropping > state.drop ? 900 : 2500);
    state.pulse *= Math.exp(-dt / 180);
    let hit = false;
    if (state.fast > state.slow * 1.22 + 0.04 && now - state.last > 280) {
        hit = true;
        state.last = now;
        state.pulse = Math.min(1, 0.55 + (state.fast - state.slow) * 3);
        state.beats.push(now);
        if (state.beats.length > 16) state.beats.shift();
    }
    const recent = state.beats.filter((at) => now - at < 8000);
    if (recent.length >= 5) {
        const gaps = recent.slice(1).map((at, i) => at - recent[i]).sort((a, b) => a - b);
        let bpm = 60000 / gaps[gaps.length >> 1];
        while (bpm < 80) bpm *= 2;
        while (bpm > 170) bpm /= 2;
        state.bpm = state.bpm ? state.bpm + (bpm - state.bpm) * 0.15 : bpm;
    } else if (now - state.last > 4000) state.bpm = 0;
    return hit;
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
            `.header,.header__inner,.header__background{background:${panel}!important;backdrop-filter:${blur};-webkit-backdrop-filter:${blur};border-bottom:1px solid rgba(255,255,255,.06)!important;box-shadow:none!important}`,
            `.playControls__bg,.playControls__inner,.playControls__wrapper{background:${panel}!important;backdrop-filter:${blur};-webkit-backdrop-filter:${blur};border-top:1px solid rgba(255,255,255,.07)!important}`,
            // Боковые колонки, модули и всплывающее: мягкие стеклянные карточки
            `.sidebarModule,.l-sidebar-right .sidebarModule,.dropdownMenu,.moreActions,.dropbar,.queue,.modal__modal,.dialog{background:${panel}!important;backdrop-filter:${blur};-webkit-backdrop-filter:${blur}}`,
            `.sidebarModule{border-radius:${r}px;padding:4px 12px!important;margin-bottom:16px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.06)}`,
            `.l-listen-hero,.fullHero,.profileHeader,.fullListenHero{border-radius:${r}px;overflow:hidden;margin-top:8px}`,
            `.headerSearch__input{background:rgba(255,255,255,.07)!important;border:1px solid rgba(255,255,255,.08)!important}`,
            // Строки списков: лёгкая подложка на наведении
            `.soundList__item:hover,.trackList__item:hover,.compactTrackList__item:hover,.systemPlaylistTrackList__item:hover{background:rgba(255,255,255,.04)!important;border-radius:${Math.max(4, r - 4)}px}`,
            // Блок волны и строка по описанию: стекло вокруг
        );
    }
    // Нижний бар: живая линия прогресса вместо полосы сайта (клики идут сайту, холст их пропускает), свечение и дыхание
    // обложки, пока играет музыка; на паузе обложки чуть уменьшаются и тускнеют
    rows.push(
        '.playbackTimeline__progressWrapper{position:relative}',
        '#sca-line{position:absolute;left:0;top:50%;width:100%;height:26px;transform:translateY(-50%);pointer-events:none;z-index:2}',
        'html.sca-line .playbackTimeline__progressBackground,html.sca-line .playbackTimeline__progressBar,html.sca-line .playbackTimeline__progressHandle{opacity:0!important}',
        'html:not(.sca-line) .playbackTimeline__progressBar{background:linear-gradient(90deg,var(--sca-c1,#ff5500),var(--sca-c3,#ff9a52))!important}',
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
        'html.scm-reduce #sca-line{display:none}',
        '@media (prefers-reduced-motion:reduce){.playbackSoundBadge__avatar,#sc-wave .scw-cover{transition:none!important;transform:none!important}}',
    );
    // Дизайн-система SoundCloud 2 «Vice»: фирменный градиент Vice City (кобальт → маджента → розовый → оранжевый → золото)
    // на главных кнопках, со стеклом вокруг. Карточки большие, с обложкой на всю площадь, подсветкой за курсором (--mx, --my
    // ставит переливам pointermove) и бегущей рамкой у играющего. Цвет обложки в фоне карточки волны (--sca-cover)
    const panelAlpha = (0.38 + (a.glass / 100) * 0.4).toFixed(3);
    rows.push(
        `:root{--sc2-surface-1:rgba(255,255,255,.05);--sc2-surface-2:rgba(255,255,255,.085);--sc2-surface-3:rgba(255,255,255,.14);--sc2-line:rgba(255,255,255,.1);` +
            `--sc2-text:#fff;--sc2-text-2:rgba(255,255,255,.72);--sc2-text-3:rgba(255,255,255,.48);` +
            `--sc2-vice:linear-gradient(100deg,#7b5cff 0%,#ff4fa3 38%,#ff7a59 70%,#ffc35c 100%);--sc2-vice-soft:linear-gradient(100deg,rgba(123,92,255,.35),rgba(255,79,163,.35),rgba(255,122,89,.35));` +
            `--sc2-ink:#1b0a1f;--sc2-accent:#ff6fae;--sc2-panel:rgba(14,12,26,${panelAlpha});--sc2-blur:blur(${a.blur}px) saturate(1.5);` +
            `--sc2-r1:${Math.max(6, Math.round(r * 0.6))}px;--sc2-r2:${Math.max(8, Math.round(r * 0.9))}px;--sc2-r3:${Math.round(r * 1.15)}px;--sc2-r4:${Math.round(r * 1.7)}px;` +
            `--sc2-fast:140ms;--sc2-mid:240ms;--sc2-ease:cubic-bezier(.2,.8,.2,1);--sc2-shadow:0 24px 60px -24px rgba(0,0,0,.85)}`,
        '@property --sc2-angle{syntax:"<angle>";inherits:false;initial-value:0deg}',
        '@keyframes sc2-spin{to{--sc2-angle:360deg}}',
        '@keyframes sc2-sheen{from{transform:translateX(-120%) skewX(-20deg)}to{transform:translateX(220%) skewX(-20deg)}}',
        // Фирменная кнопка: градиент Vice, тёмный текст, блик пробегает на наведении, нажатие проседает
        `.sc2-cta{position:relative;overflow:hidden;background:var(--sc2-vice)!important;color:var(--sc2-ink)!important;font-weight:800!important;letter-spacing:.01em;box-shadow:0 10px 28px -10px rgba(255,79,163,.75),inset 0 1px 0 rgba(255,255,255,.45)!important;transition:transform var(--sc2-fast) var(--sc2-ease),box-shadow var(--sc2-mid)!important}`,
        `.sc2-cta::after{content:"";position:absolute;top:0;bottom:0;left:0;width:40%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.65),transparent);transform:translateX(-120%) skewX(-20deg);pointer-events:none}`,
        `.sc2-cta:hover::after{animation:sc2-sheen .7s var(--sc2-ease)}`,
        `.sc2-cta:hover{box-shadow:0 14px 34px -10px rgba(255,79,163,.95),inset 0 1px 0 rgba(255,255,255,.5)!important}`,
        `.sc2-cta:active{transform:scale(.96)}`,
        // Меню по правому клику, подсказки и тосты волны
        `.scw-menu{background:var(--sc2-panel)!important;backdrop-filter:var(--sc2-blur);-webkit-backdrop-filter:var(--sc2-blur);border:0!important;border-radius:var(--sc2-r3)!important;padding:6px!important;box-shadow:var(--sc2-shadow),inset 0 0 0 1px var(--sc2-line)!important;min-width:240px}`,
        `.scw-menu .scw-mi{height:36px!important;padding:0 12px!important;border-radius:var(--sc2-r1)!important;border:0!important;background:none!important;color:var(--sc2-text-2)!important;font-weight:600!important;transition:background var(--sc2-fast),color var(--sc2-fast)}`,
        `.scw-menu .scw-mi:hover,.scw-menu .scw-mi:focus-visible{background:var(--sc2-vice-soft)!important;color:#fff!important;outline:none!important}`,
        `.scw-toast{background:var(--sc2-panel)!important;backdrop-filter:var(--sc2-blur);-webkit-backdrop-filter:var(--sc2-blur);border-radius:999px!important;padding:11px 20px!important;box-shadow:var(--sc2-shadow),inset 0 0 0 1px var(--sc2-line)!important;color:#fff!important;font-weight:600}`,
        `.scw-toast .scw-undo{background:var(--sc2-vice)!important;-webkit-background-clip:text!important;background-clip:text!important;color:transparent!important}`,
        `.scw-tip{background:var(--sc2-panel)!important;backdrop-filter:var(--sc2-blur);border-radius:var(--sc2-r1)!important;box-shadow:inset 0 0 0 1px var(--sc2-line)!important}`,
        `.sc-button-small,.sc-button-medium{border-radius:999px!important}`,
        `.sc-button-selected,.playbackSoundBadge__like.sc-button-selected,.sc-button-like.sc-button-selected{color:var(--sc2-accent)!important}`,
        // Подсветка за курсором у всех карточек: мягкое пятно цвета там, где мышь
        `.sc2-spot{position:relative;isolation:isolate}`,
        `.sc2-spot::before{content:"";position:absolute;inset:0;z-index:-1;border-radius:inherit;pointer-events:none;opacity:0;transition:opacity var(--sc2-mid);background:radial-gradient(260px circle at var(--mx,50%) var(--my,50%),rgba(255,111,174,.18),rgba(123,92,255,.10) 40%,transparent 70%)}`,
        `.sc2-spot:hover::before{opacity:1}`,
        // Боковые колонки сайта: карточки-стекло, обложки скруглены, строки подсвечиваются
        `.sidebarModule{border-radius:var(--sc2-r4)!important;padding:8px 14px 4px!important;background:var(--sc2-panel)!important;backdrop-filter:var(--sc2-blur);-webkit-backdrop-filter:var(--sc2-blur);box-shadow:inset 0 0 0 1px var(--sc2-line)!important}`,
        `.sidebarModule .soundBadge .sc-artwork,.sidebarModule .sc-artwork{border-radius:var(--sc2-r1)!important;overflow:hidden}`,
        `.sidebarHeader__title,.sidebarModule h3{letter-spacing:.08em;font-weight:800!important}`,
    );
    // Блок «Моей волны»: большая карточка «сейчас играет» с размытой обложкой в фоне, плитки «Далее» как карточки-обложки,
    // чипы и кнопки как у фирменного стиля. html body в начале перебивает правила волны (#sc-wave …) без !important
    const w = 'html body #sc-wave';
    rows.push(
        `${w}{--scw-surface:var(--sc2-surface-2);--scw-film:var(--sc2-surface-1);--scw-film-strong:var(--sc2-surface-2);--scw-tile:var(--sc2-surface-2);--scw-muted:var(--sc2-text-2);--scw-faint:var(--sc2-text-3);--scw-btn:#fff;--scw-btn-ink:var(--sc2-ink)}`,
        `${w} .scw-title{font-size:34px;line-height:40px;font-weight:900;letter-spacing:-.8px;color:#fff;text-transform:none}`,
        `${w} .scw-head .scw-hint{display:none}`,
        `${w} .scw-seg{padding:4px;border-radius:999px;background:var(--sc2-panel);backdrop-filter:var(--sc2-blur);box-shadow:inset 0 0 0 1px var(--sc2-line)}`,
        `${w} .scw-seg button{border-radius:999px;font-weight:700;transition:background var(--sc2-mid),color var(--sc2-mid)}`,
        `${w} .scw-seg button[aria-checked="true"]{background:var(--sc2-vice);color:var(--sc2-ink);box-shadow:0 6px 18px -8px rgba(255,79,163,.9)}`,
        `${w} .scw-genre,${w} .scw-icon{border-radius:999px;background:var(--sc2-panel);backdrop-filter:var(--sc2-blur);box-shadow:inset 0 0 0 1px var(--sc2-line);transition:background var(--sc2-fast),transform var(--sc2-fast)}`,
        `${w} .scw-icon:hover,${w} .scw-genre:hover{background:var(--sc2-surface-3);transform:translateY(-1px)}`,
        `${w} .scw-genre.set{background:var(--sc2-vice);color:var(--sc2-ink)}`,
        `${w} .scw-pop{border-radius:var(--sc2-r3);background:var(--sc2-panel);backdrop-filter:var(--sc2-blur);box-shadow:var(--sc2-shadow),inset 0 0 0 1px var(--sc2-line)}`,
        // Карточка «сейчас играет»: под стеклом размытая обложка играющего трека и бегущая рамка Vice, пока играет
        `${w} .scw-body{margin:0;padding:24px;gap:28px;border-radius:var(--sc2-r4);overflow:hidden;background:rgba(14,12,26,.35);backdrop-filter:var(--sc2-blur);-webkit-backdrop-filter:var(--sc2-blur);box-shadow:var(--sc2-shadow),inset 0 0 0 1px var(--sc2-line)}`,
        `${w} .scw-body::before{content:"";position:absolute;inset:-40px;z-index:-2;background:var(--sca-cover,none) center/cover;filter:blur(48px) saturate(1.7) brightness(.55);opacity:.85;transition:opacity .6s}`,
        `${w} .scw-body::after{content:"";position:absolute;inset:0;z-index:3;border-radius:inherit;padding:1.5px;pointer-events:none;background:conic-gradient(from var(--sc2-angle),transparent 0 55%,#ff4fa3 70%,#ffc35c 80%,transparent 90%);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;opacity:0;transition:opacity .6s}`,
        `html.sca-playing ${w} .scw-body::after{opacity:1;animation:sc2-spin 6s linear infinite}`,
        `${w} .scw-body.lit{background:rgba(14,12,26,.3)}`,
        `${w} .scw-cover{width:236px;height:236px;border-radius:var(--sc2-r3);overflow:hidden;box-shadow:0 30px 60px -22px rgba(0,0,0,.9),0 0 0 1px rgba(255,255,255,.08)}`,
        `${w} .scw-play{width:64px;height:64px;background:var(--sc2-vice);box-shadow:0 12px 30px -10px rgba(255,79,163,.9),inset 0 1px 0 rgba(255,255,255,.45);transition:transform var(--sc2-fast) var(--sc2-ease)}`,
        `${w} .scw-play svg{fill:var(--sc2-ink)}`,
        `${w} .scw-play:not(:disabled):hover{transform:scale(1.06);filter:none}`,
        `${w} .scw-play:not(:disabled):active{transform:scale(.94)}`,
        `${w} .scw-track{font-size:28px;line-height:34px;font-weight:900;letter-spacing:-.5px}`,
        `${w} .scw-artist{color:var(--sc2-text-2);font-weight:600}`,
        `${w} .scw-why{color:var(--sc2-text-2)}`,
        `${w} .scw-like{border-radius:999px;transition:background var(--sc2-fast),transform var(--sc2-fast) var(--sc2-ease)}`,
        `${w} .scw-like:hover{background:var(--sc2-surface-3);transform:translateY(-1px)}`,
        `${w} .scw-like[aria-pressed="true"] svg{fill:var(--sc2-accent)}`,
        `${w} .scw-btn{border-radius:999px;padding:0 18px;background:var(--sc2-surface-2);font-weight:700}`,
        `${w} .scw-up-h{font-size:13px;font-weight:800;color:#fff;letter-spacing:.06em;text-transform:uppercase;margin:28px 0 12px}`,
        // «Далее»: карточки-обложки в полный рост, название под ними, подъём и увеличение обложки на наведении
        `${w} .scw-tiles:not(.scw-shelf){gap:16px}`,
        `${w} .scw-tile{display:flex;flex-direction:column;gap:2px;padding:10px;margin:0;border-radius:var(--sc2-r3);background:var(--sc2-panel);backdrop-filter:var(--sc2-blur);box-shadow:inset 0 0 0 1px var(--sc2-line);transition:transform var(--sc2-mid) var(--sc2-ease),box-shadow var(--sc2-mid)}`,
        `${w} .scw-tile:hover{transform:translateY(-4px);box-shadow:0 22px 40px -22px rgba(0,0,0,.9),inset 0 0 0 1px rgba(255,255,255,.16)}`,
        `${w} .scw-tile>.scw-art{width:100%;margin:0 0 8px;border-radius:var(--sc2-r2);overflow:hidden}`,
        `${w} .scw-tile>.scw-art .scw-img{transition:transform .5s var(--sc2-ease),opacity .2s}`,
        `${w} .scw-tile:hover>.scw-art .scw-img{transform:scale(1.06)}`,
        `${w} .scw-t1{font-weight:800}`,
        `${w} .scw-t2,${w} .scw-t3{color:var(--sc2-text-2)}`,
        `${w} .scw-t3{font-size:11px;color:var(--sc2-text-3)}`,
        `${w} .scw-chip{height:32px;padding:0 14px;border-radius:999px;background:var(--sc2-panel);backdrop-filter:var(--sc2-blur);box-shadow:inset 0 0 0 1px var(--sc2-line);color:var(--sc2-text-2);font-weight:700;transition:background var(--sc2-fast),color var(--sc2-fast),transform var(--sc2-fast)}`,
        `${w} .scw-chip:hover{background:var(--sc2-surface-3);color:#fff;transform:translateY(-1px)}`,
        `${w} .scw-moods .scw-chip[aria-checked="true"],${w} .scw-chip[aria-pressed="true"]{background:var(--sc2-vice);color:var(--sc2-ink);box-shadow:0 8px 20px -10px rgba(255,79,163,.9)}`,
        `${w} .scw-pin{height:32px;border-radius:999px;background:var(--sc2-panel);box-shadow:inset 0 0 0 1px var(--sc2-line)}`,
        `${w} .scw-shelf-h{font-size:26px;line-height:32px;font-weight:900;letter-spacing:-.5px}`,
        // Подборки на полке: обложка-карточка с затемнением снизу, увеличение картинки и подсветка
        `${w} .scw-card .scw-art{border-radius:var(--sc2-r3);overflow:hidden;box-shadow:0 18px 40px -20px rgba(0,0,0,.9)}`,
        `${w} .scw-card .scw-art .scw-img{transition:transform .5s var(--sc2-ease),opacity .2s}`,
        `${w} .scw-card:hover .scw-art .scw-img{transform:scale(1.07)}`,
        `${w} .scw-card .scw-art::after{background:var(--sc2-vice);height:4px}`,
        `${w} .scw-card .scw-card-play{background:var(--sc2-vice)}`,
        `${w} .scw-card .scw-card-play svg{fill:var(--sc2-ink)}`,
        `${w} .scw-card .scw-card-play:hover{background:var(--sc2-vice);transform:translateY(0) scale(1.08)}`,
        `${w} .scw-mix,${w} .scw-lib{border-radius:var(--sc2-r4);padding:18px 18px 10px;background:var(--sc2-panel);backdrop-filter:var(--sc2-blur);box-shadow:inset 0 0 0 1px var(--sc2-line)}`,
        `${w} .scw-mix-play{background:var(--sc2-vice)}`,
        `${w} .scw-mix-play svg{fill:var(--sc2-ink)}`,
        `${w} .scw-row{border-radius:var(--sc2-r2)}`,
        `${w} .scw-row[aria-current="true"] .scw-row-t b,${w} .scw-lib-here{color:var(--sc2-accent)}`,
        `${w} .scw-lib-opt{border-radius:var(--sc2-r2)}`,
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
    return rows.join('\n');
}

interface AuroraConfig {
    appearance: Appearance;
    colors: [string, string, string];
    shaders: Record<string, string>;
    vertex: string;
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
    function readAudio(now: number): { bass: number; level: number; playing: boolean } {
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
                    analyser.fftSize = 1024;
                    analyser.smoothingTimeConstant = 0.45;
                    freq = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
                }
                tap.gain.connect(analyser);
                tappedGain = tap.gain;
                useEnvelope = false;
                silentSince = 0;
            }
        }
        if (!playing) return { bass: 0, level: 0, playing };
        if (analyser && freq && !useEnvelope) {
            analyser.getByteFrequencyData(freq);
            const hz = analyser.context.sampleRate / analyser.fftSize;
            let bass = 0;
            let bassN = 0;
            let level = 0;
            const top = Math.min(freq.length, Math.round(4000 / hz));
            for (let i = 1; i < top; i++) {
                const f = i * hz;
                if (f >= 40 && f <= 160) {
                    bass += freq[i];
                    bassN++;
                }
                level += freq[i];
            }
            bass = bassN ? bass / bassN / 255 : 0;
            fillSpectrum(freq, hz);
            level = level / Math.max(1, top - 1) / 255;
            if (level > 0.01) silentSince = 0;
            else if (!silentSince) silentSince = now;
            else if (now - silentSince > 1500) useEnvelope = true;
            if (!useEnvelope) return { bass, level, playing };
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
            return { bass: value, level: value * 0.8, playing };
        }
        return { bass: 0, level: 0.3, playing };
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
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        return true;
    }
    const scale = (): number => ({ eco: 0.35, balanced: 0.5, high: 0.8 })[cfg.appearance.quality] ?? 0.5;
    const fpsCap = (): number => ({ eco: 24, balanced: 40, high: 60 })[cfg.appearance.quality] ?? 40;
    function resize(): void {
        if (!canvas || !gl) return;
        const s = scale() * Math.min(2, window.devicePixelRatio || 1);
        const w = Math.max(64, Math.round(window.innerWidth * s));
        const h = Math.max(64, Math.round(window.innerHeight * s));
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
    // Живая линия прогресса: поверх полосы плеера сайта, бас в середине, сыгранное в цветах палитры, под бит дышит
    let line: HTMLCanvasElement | null = null;
    const bars = new Float32Array(160);
    let lineAt = 0;
    let playingShown: boolean | null = null;
    function drawLine(now: number, playing: boolean, amount: number): void {
        const wrap = document.querySelector<HTMLElement>('.playControls .playbackTimeline__progressWrapper');
        const on = !!wrap && amount > 0 && !document.documentElement.classList.contains('scm-reduce');
        document.documentElement.classList.toggle('sca-line', on);
        if (!on || !wrap) {
            line?.remove();
            return;
        }
        if (!line) {
            line = document.createElement('canvas');
            line.id = 'sca-line';
            line.setAttribute('aria-hidden', 'true');
        }
        if (line.parentElement !== wrap) wrap.append(line);
        if (now - lineAt < 30) return;
        lineAt = now;
        const ratio = Math.min(2, window.devicePixelRatio || 1);
        const width = wrap.clientWidth;
        const height = 26;
        if (!width) return;
        if (line.width !== Math.round(width * ratio)) line.width = Math.round(width * ratio);
        if (line.height !== Math.round(height * ratio)) line.height = Math.round(height * ratio);
        const pen = line.getContext('2d');
        if (!pen) return;
        pen.setTransform(ratio, 0, 0, ratio, 0, 0);
        pen.clearRect(0, 0, width, height);
        const env = host.__scEnvelope?.() ?? null;
        const progressBar = document.querySelector<HTMLElement>('.playControls .playbackTimeline__progressBar');
        const fromSite = progressBar ? parseFloat(progressBar.style.width) / 100 : NaN;
        const done = env && env.duration > 0 ? env.position / env.duration : Number.isFinite(fromSite) ? fromSite : 0;
        const step = 4;
        const n = Math.min(bars.length, Math.floor(width / step));
        const colors = targetColors();
        const grad = pen.createLinearGradient(0, 0, width, 0);
        grad.addColorStop(0, colors[0]);
        grad.addColorStop(1, colors[2] ?? colors[0]);
        const mid = height / 2;
        for (let i = 0; i < n; i++) {
            const fromCenter = Math.abs(i - n / 2) / (n / 2);
            const band = Math.min(spectrum.length - 1, Math.floor(fromCenter * spectrum.length));
            const want = playing ? spectrum[band] * amount * 0.85 : 0;
            bars[i] += (want - bars[i]) * (want > bars[i] ? 0.3 : 0.1);
            const h = 1.5 + bars[i] * (mid - 2) * 1.25;
            const x = i * step;
            pen.fillStyle = x / width <= done ? grad : 'rgba(255,255,255,.26)';
            pen.beginPath();
            pen.roundRect(x, mid - h, 2.5, h * 2, 1.25);
            pen.fill();
        }
        // Точка позиции со свечением цвета палитры
        const dot = Math.max(3, Math.min(width - 3, done * width));
        pen.shadowColor = colors[0];
        pen.shadowBlur = 8;
        pen.fillStyle = '#fff';
        pen.beginPath();
        pen.arc(dot, mid, 3.5, 0, Math.PI * 2);
        pen.fill();
        pen.shadowBlur = 0;
    }
    function draw(now: number): void {
        frame = requestAnimationFrame(draw);
        if (document.hidden) return;
        if (cfg.appearance.effect === 'off' || !gl || lost) {
            // Без фона линия и класс игры всё равно живут: им нужен только анализатор
            const amount = cfg.appearance.beat / 100;
            const sound = amount > 0 ? readAudio(now) : { bass: 0, level: 0, playing: musicPlaying() };
            if (amount > 0) beatStep(beat, sound.bass, sound.level, now, last ? Math.min(100, now - last) : 16);
            last = now;
            markPlaying(sound.playing);
            drawLine(now, sound.playing, amount);
            return;
        }
        if (!gl || !canvas || lost) return;
        const step = 1000 / fpsCap();
        if (now - last < step - 1) return;
        const dt = last ? Math.min(100, now - last) : 16;
        last = now;
        if (!useEffect(cfg.appearance.effect)) return;
        resize();
        const a = cfg.appearance;
        const amount = a.beat / 100;
        const sound = amount > 0 ? readAudio(now) : { bass: 0, level: 0, playing: musicPlaying() };
        if (amount > 0) beatStep(beat, sound.bass, sound.level, now, dt);
        else beat.pulse = beat.level = 0;
        const calm = a.calmOnPause && !sound.playing;
        markPlaying(sound.playing);
        drawLine(now, sound.playing, amount);
        // Темп трека ведёт скорость: 120 ударов в минуту это обычная скорость, громкость ещё прибавляет
        const tempo = beat.bpm ? Math.min(1.5, Math.max(0.7, beat.bpm / 120)) : 1;
        // Темп и громкость двигают скорость мягко, дроп разгоняет фон почти вдвое; никаких вспышек на ударах
        // Ритм ведёт скорость: громкость относительно своей средней по треку и плотность ударов за 4 с (3 удара в секунду
        // это много). Быстрее и плотнее стало, фон ускоряется за ~0,6 с; дроп добавляет сверху; назад за ~1,5 с
        const rel = Math.min(1.8, Math.max(0.4, beat.short / (beat.long + 0.02)));
        const density = Math.min(1, beat.beats.filter((at) => now - at < 4000).length / 12);
        const drive = 1 + amount * ((tempo - 1) * 0.5 + (rel - 1) * 0.9 + (density - 0.35) * 0.9 + beat.drop * 0.8);
        const speedWant = calm ? 0.18 : Math.min(2.4, Math.max(0.5, drive));
        speedNow += (speedWant - speedNow) * Math.min(1, dt / (speedWant > speedNow ? 600 : 1500));
        time += (dt / 1000) * (0.15 + (a.speed / 100) * 2.2) * speedNow;
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
        gl.uniform1f(uniforms.u_intensity, (0.25 + (a.intensity / 100) * 0.85) * (calm ? 0.82 : 1));
        gl.uniform1f(uniforms.u_grain, a.grain / 100);
        gl.uniform2f(uniforms.u_mouse, mouse[0], mouse[1]);
        gl.uniform1f(uniforms.u_seed, seed);
        gl.uniform1f(uniforms.u_pulse, 0);
        gl.uniform1f(uniforms.u_energy, calm ? 0 : (beat.level * 0.4 + beat.drop * 0.6) * amount);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        canvas.classList.add('on');
    }
    // Лайк: разлёт сердечек в цветах палитры из кнопки, кнопка подпрыгивает, короткий звук из двух нот. Только на «поставить»,
    // снятие лайка без салюта. Кнопки лайка сайта, бара и блока волны
    const LIKE = '.sc-button-like, .playbackSoundBadge__like, #sc-wave .scw-like[data-act="like"]';
    let chime: AudioContext | null = null;
    // Лайк: две ноты вверх; дизлайк: две ноты вниз, ниже и тише
    function playChime(notes: number[] = [880, 1318.5], type: OscillatorType = 'sine', volume = 0.05): void {
        try {
            chime ??= new AudioContext();
            const at = chime.currentTime + 0.01;
            notes.forEach((freq, i) => {
                const osc = chime!.createOscillator();
                const amp = chime!.createGain();
                osc.type = type;
                osc.frequency.value = freq;
                amp.gain.setValueAtTime(0, at + i * 0.07);
                amp.gain.linearRampToValueAtTime(volume, at + i * 0.07 + 0.008);
                amp.gain.exponentialRampToValueAtTime(0.0001, at + i * 0.07 + 0.16);
                osc.connect(amp);
                amp.connect(chime!.destination);
                osc.start(at + i * 0.07);
                osc.stop(at + i * 0.07 + 0.18);
            });
        } catch {
            // без звука
        }
    }
    function burst(button: Element): void {
        const box = button.getBoundingClientRect();
        const cx = box.left + box.width / 2;
        const cy = box.top + box.height / 2;
        const layer = document.createElement('div');
        layer.style.cssText = `position:fixed;left:${cx}px;top:${cy}px;width:0;height:0;z-index:2147483600;pointer-events:none`;
        const colors = targetColors();
        const ring = document.createElement('i');
        ring.style.cssText = `position:absolute;left:-14px;top:-14px;width:28px;height:28px;border-radius:50%;border:2px solid ${colors[0]}`;
        layer.append(ring);
        ring.animate([{ transform: 'scale(.4)', opacity: 0.9 }, { transform: 'scale(1.9)', opacity: 0 }], { duration: 420, easing: 'cubic-bezier(.2,0,0,1)' });
        for (let i = 0; i < 9; i++) {
            const angle = (i / 9) * Math.PI * 2 + Math.random() * 0.5;
            const distance = 22 + Math.random() * 16;
            const dot = document.createElement('i');
            const size = 5 + Math.random() * 4;
            dot.style.cssText = `position:absolute;left:${-size / 2}px;top:${-size / 2}px;width:${size}px;height:${size}px;border-radius:50%;background:${colors[i % 3] ?? colors[0]}`;
            layer.append(dot);
            dot.animate(
                [{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${Math.cos(angle) * distance}px,${Math.sin(angle) * distance}px) scale(.3)`, opacity: 0 }],
                { duration: 480 + Math.random() * 120, easing: 'cubic-bezier(.2,0,0,1)' },
            );
        }
        document.body.append(layer);
        setTimeout(() => layer.remove(), 700);
        (button as HTMLElement).animate?.([{ transform: 'scale(1)' }, { transform: 'scale(1.22)' }, { transform: 'scale(1)' }], { duration: 260, easing: 'cubic-bezier(.2,0,0,1)' });
    }
    // Дизлайк: кнопка коротко «мотает головой», вниз осыпаются серые точки
    const DISLIKE = '.scd-dock button[data-act="dislike"], #sc-wave .scw-like[data-act="dislike"], .scw-menu [data-menu="dislike"]';
    function shake(button: Element): void {
        (button as HTMLElement).animate?.(
            [{ transform: 'translateX(0)' }, { transform: 'translateX(-4px) rotate(-6deg)' }, { transform: 'translateX(4px) rotate(6deg)' }, { transform: 'translateX(-2px)' }, { transform: 'translateX(0)' }],
            { duration: 320, easing: 'ease-out' },
        );
        const box = button.getBoundingClientRect();
        const layer = document.createElement('div');
        layer.style.cssText = `position:fixed;left:${box.left + box.width / 2}px;top:${box.top + box.height / 2}px;width:0;height:0;z-index:2147483600;pointer-events:none`;
        for (let i = 0; i < 6; i++) {
            const dot = document.createElement('i');
            const size = 3 + Math.random() * 3;
            dot.style.cssText = `position:absolute;left:${-size / 2}px;top:${-size / 2}px;width:${size}px;height:${size}px;border-radius:50%;background:rgba(245,246,248,.55)`;
            layer.append(dot);
            const x = (Math.random() - 0.5) * 28;
            dot.animate([{ transform: 'translate(0,0)', opacity: 0.9 }, { transform: `translate(${x}px,${22 + Math.random() * 16}px)`, opacity: 0 }], { duration: 420 + Math.random() * 120, easing: 'cubic-bezier(.5,0,.8,.4)' });
        }
        document.body.append(layer);
        setTimeout(() => layer.remove(), 650);
    }
    const onLikeClick = (event: MouseEvent): void => {
        const disliked = event.target instanceof Element ? event.target.closest(DISLIKE) : null;
        if (disliked && disliked.getAttribute('aria-pressed') !== 'true') {
            if (!document.documentElement.classList.contains('scm-reduce')) shake(disliked);
            if (cfg.appearance.likeSound) playChime([392, 293.7], 'triangle', 0.04);
            return;
        }
        const button = event.target instanceof Element ? event.target.closest(LIKE) : null;
        if (!button) return;
        const was = button.classList.contains('sc-button-selected') || button.getAttribute('aria-pressed') === 'true';
        if (was) return;
        if (!document.documentElement.classList.contains('scm-reduce')) burst(button);
        if (cfg.appearance.likeSound) playChime();
    };
    document.addEventListener('click', onLikeClick, true);
    // html.sca-playing: интерфейс раскрывается, когда играет музыка (обложки в полный рост, свечение бара)
    function markPlaying(playing: boolean): void {
        if (playing === playingShown) return;
        playingShown = playing;
        document.documentElement.classList.toggle('sca-playing', playing);
    }
    // Подсветка за курсором: у карточки под мышью класс sc2-spot и координаты --mx, --my, раз в кадр
    const SPOT = '.scw-card, .scw-tile, .scw-body, .scv-card, .sidebarModule, .scw-lib, .scw-mix';
    let spotFrame = 0;
    let spotEvent: PointerEvent | null = null;
    const onSpot = (event: PointerEvent): void => {
        spotEvent = event;
        if (spotFrame) return;
        spotFrame = requestAnimationFrame(() => {
            spotFrame = 0;
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
    const coverTimer = setInterval(sampleCover, 1500);
    host.__scAuroraPalette = (colors: string[]) => {
        if (!Array.isArray(colors) || !colors.length) return;
        coverColors = colors.slice(0, 3);
        retarget();
    };
    host.__scAurora = {
        update: apply,
        dispose() {
            cancelAnimationFrame(frame);
            clearInterval(coverTimer);
            window.removeEventListener('pointermove', onMove);
            canvas?.remove();
            line?.remove();
            document.removeEventListener('click', onLikeClick, true);
            document.removeEventListener('pointermove', onSpot);
            document.documentElement.classList.remove('sca-line', 'sca-playing');
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
export function auroraScript(input: unknown): string {
    const appearance = normalizeAppearance(input);
    const shaders = Object.fromEntries((Object.keys(SHADERS) as Array<keyof typeof SHADERS>).map((effect) => [effect, fragmentSource(effect)]));
    const config: AuroraConfig = { appearance, colors: paletteColors(appearance), shaders, vertex: VERTEX };
    return '(function(){\n' + glowPalette.toString() + '\n' + beatInit.toString() + '\n' + beatStep.toString() + '\n(' + auroraPage.toString() + ')(' + JSON.stringify(config) + ');\n})();';
}
