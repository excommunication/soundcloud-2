// Оформление: переливы WebGL за сайтом и стеклянные панели поверх них. Эффект, палитра, скорость, яркость, зерно,
// стекло и скругления настраиваются в F1 → Оформление и применяются без перезагрузки.
// Фон это один <canvas> на весь экран под содержимым сайта: полноэкранный треугольник и фрагментный шейдер выбранного
// эффекта. Палитра «Из обложки» берётся у трека в нижнем плеере (тот же разбор цвета, что у света волны, glowPalette).
// Рисуется с пониженным разрешением и ограничением кадров, на скрытом окне не рисуется вовсе, на паузе музыки замедляется.
// auroraPage уходит на страницу текстом: ссылается только на glowPalette, которая идёт объявлением рядом
import * as glowModule from './wave/glow';

const { glowPalette } = glowModule;

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
    beat: 65,
    likeSound: true,
};

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
        `.sidebarHeader__title,.sidebarModule h3{letter-spacing:.08em;font-weight:800!important}`,
    );
    // Блок «Моей волны»: большая карточка «сейчас играет» с размытой обложкой в фоне, плитки «Далее» как карточки-обложки,
    // чипы и кнопки как у фирменного стиля. html body в начале перебивает правила волны (#sc-wave …) без !important
    const w = 'html body #sc-wave';
    rows.push(
        `${w}{--scw-surface:var(--sc2-surface-2);--scw-film:var(--sc2-surface-1);--scw-film-strong:var(--sc2-surface-2);--scw-tile:var(--sc2-surface-2);--scw-muted:var(--sc2-text-2);--scw-faint:var(--sc2-text-3);--scw-btn:#fff;--scw-btn-ink:var(--sc2-ink)}`,
        `${w} .scw-title{font-size:30px;line-height:36px;font-weight:800;letter-spacing:-.6px;color:#fff}`,
        `${w} .scw-head .scw-hint{display:none}`,
        `${w} .scw-seg{padding:4px;border-radius:999px;background:var(--sc2-panel);backdrop-filter:var(--sc2-blur);box-shadow:inset 0 0 0 1px var(--sc2-line)}`,
        `${w} .scw-seg button{border-radius:999px;font-weight:700;transition:background var(--sc2-mid),color var(--sc2-mid)}`,
        `${w} .scw-seg button[aria-checked="true"]{background:var(--sc2-vice);color:var(--sc2-ink);box-shadow:0 6px 18px -8px rgba(0,0,0,.55)}`,
        `${w} .scw-genre,${w} .scw-icon{border-radius:999px;background:var(--sc2-panel);backdrop-filter:var(--sc2-blur);box-shadow:inset 0 0 0 1px var(--sc2-line);transition:background var(--sc2-fast),transform var(--sc2-fast)}`,
        `${w} .scw-icon:hover,${w} .scw-genre:hover{background:var(--sc2-surface-3);transform:translateY(-1px)}`,
        `${w} .scw-genre.set{background:var(--sc2-vice);color:var(--sc2-ink)}`,
        `${w} .scw-pop{border-radius:var(--sc2-r3);background:var(--sc2-panel);backdrop-filter:var(--sc2-blur);box-shadow:var(--sc2-shadow),inset 0 0 0 1px var(--sc2-line)}`,
        // Карточка «сейчас играет»: под стеклом размытая обложка играющего трека и бегущая рамка Vice, пока играет
        `${w} .scw-body{margin:0;padding:24px;gap:28px;border-radius:var(--sc2-r4);overflow:hidden;background:rgba(14,12,26,.35);backdrop-filter:var(--sc2-blur);-webkit-backdrop-filter:var(--sc2-blur);box-shadow:var(--sc2-shadow),inset 0 0 0 1px var(--sc2-line)}`,
        `${w} .scw-body::before{content:"";position:absolute;inset:-40px;z-index:-2;background:var(--sca-cover,none) center/cover;filter:blur(48px) saturate(1.7) brightness(.55);opacity:.85;transition:opacity .6s}`,
        `${w} .scw-body.lit{background:rgba(14,12,26,.3)}`,
        `${w} .scw-cover{width:236px;height:236px;border-radius:var(--sc2-r3);overflow:hidden;box-shadow:0 30px 60px -22px rgba(0,0,0,.9),0 0 0 1px rgba(255,255,255,.08)}`,
        `${w} .scw-play{width:64px;height:64px;background:#fff;box-shadow:0 12px 30px -12px rgba(0,0,0,.9);transition:transform var(--sc2-fast) var(--sc2-ease)}`,
        `${w} .scw-play svg{fill:var(--sc2-ink)}`,
        `${w} .scw-play:not(:disabled):hover{transform:scale(1.06);filter:none}`,
        `${w} .scw-play:not(:disabled):active{transform:scale(.94)}`,
        `${w} .scw-track{font-size:26px;line-height:32px;font-weight:800;letter-spacing:-.4px}`,
        `${w} .scw-artist{color:var(--sc2-text-2);font-weight:600}`,
        `${w} .scw-why{color:var(--sc2-text-2)}`,
        `${w} .scw-like{border-radius:999px;transition:background var(--sc2-fast),transform var(--sc2-fast) var(--sc2-ease)}`,
        `${w} .scw-like:hover{background:var(--sc2-surface-3);transform:translateY(-1px)}`,
        `${w} .scw-like[aria-pressed="true"] svg{fill:var(--sc2-accent)}`,
        `${w} .scw-btn{border-radius:999px;padding:0 18px;background:var(--sc2-surface-2);font-weight:700}`,
        `${w} .scw-up-h{font-size:13px;font-weight:700;color:var(--sc2-text-2);margin:26px 0 10px}`,
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
        `${w} .scw-mix,${w} .scw-lib{border-radius:var(--sc2-r4);padding:18px 18px 10px;background:var(--sc2-panel);backdrop-filter:var(--sc2-blur);box-shadow:inset 0 0 0 1px var(--sc2-line)}`,
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
        '#sca-club .beam.l{left:16%;--from:-26deg;--to:16deg;background:linear-gradient(to top,color-mix(in srgb,var(--sca-c3,#6f8bff) 80%,transparent),transparent 75%)}',
        '#sca-club .beam.r{right:16%;--from:24deg;--to:-14deg;animation-delay:calc(var(--sca-sweep,10s) * -.5);background:linear-gradient(to top,color-mix(in srgb,var(--sca-c1,#3a6bff) 80%,transparent),transparent 75%)}',
        '@keyframes sca-sweep{from{transform:rotate(var(--from))}to{transform:rotate(var(--to))}}',
        '#sca-thump{position:fixed;inset:0;z-index:2147482000;pointer-events:none;opacity:0;transition:opacity 1s ease;' +
            'box-shadow:inset 0 0 calc(70px + var(--sca-kick,0) * 90px) calc(var(--sca-kick,0) * 10px) rgba(0,0,0,calc(.18 + var(--sca-kick,0) * .3))}',
        'html.sca-playing #sca-thump{opacity:1}',
        // Обложка в карточке волны вздрагивает на ударе
        'html.sca-playing #sc-wave .scw-cover{transform:scale(calc(1 + var(--sca-kick,0) * .018))!important;transition:transform 90ms ease-out,filter .4s ease!important}',
        'html.scm-reduce #sca-club,html.scm-reduce #sca-thump{display:none}',
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
            `color:rgba(255,255,255,.9)!important;min-width:0!important;transition:transform .16s cubic-bezier(.2,.8,.2,1),background-color .16s ease,color .16s ease,opacity .16s ease!important}`,
        `${transport.split(',').map((item) => item + ' > div').join(',')}{display:grid;place-items:center;width:100%;height:100%}`,
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
        `${bar} .scd-dock{margin-left:6px;padding:0;gap:6px;background:none;box-shadow:none}`,
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
    // Клуб за стеной (2.7.0): удар баса, огибающая и темп уходят в CSS (--sca-kick, --sca-bass, --sca-energy, --sca-sweep).
    // По ним светится «щель под дверью» внизу, ходят лучи и чуть вздрагивают края окна. Пишется только заметная разница
    const clubShown: Record<string, number> = {};
    let bassNow = 0;
    function clubVar(name: string, value: number, step: number): void {
        if (Math.abs((clubShown[name] ?? -1) - value) < step) return;
        clubShown[name] = value;
        document.documentElement.style.setProperty(name, value.toFixed(3));
    }
    function clubVars(sound: { bass: number; playing: boolean }, amount: number, calm: boolean): void {
        ensureClub();
        const on = sound.playing && !calm && amount > 0;
        bassNow += ((on ? sound.bass : 0) - bassNow) * 0.25;
        clubVar('--sca-kick', on ? Math.min(1, beat.pulse * amount * 1.3) : 0, 0.03);
        clubVar('--sca-bass', Math.min(1, bassNow * amount * 1.4), 0.03);
        clubVar('--sca-energy', on ? Math.min(1, (beat.level * 0.7 + beat.drop * 0.6) * amount * 1.4) : 0, 0.03);
        const sweep = beat.bpm ? (60 / beat.bpm) * 16 : 10;
        if (Math.abs((clubShown.sweep ?? 0) - sweep) > 0.5) {
            clubShown.sweep = sweep;
            document.documentElement.style.setProperty('--sca-sweep', sweep.toFixed(1) + 's');
        }
    }
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
            clubVars(sound, amount, false);
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
        // Каждый удар даёт короткий толчок скорости (затухает за ~0,2 с): фон попадает в ритм, а не только ускоряется в среднем.
        // Это движение, а не вспышка: яркость не меняется
        const kick = calm ? 0 : beat.pulse * amount * 0.5;
        time += (dt / 1000) * (0.15 + (a.speed / 100) * 2.2) * (speedNow + kick);
        clubVars(sound, amount, calm);
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
        gl.uniform1f(uniforms.u_pulse, kick);
        gl.uniform1f(uniforms.u_energy, calm ? 0 : (beat.level * 0.4 + beat.drop * 0.6) * amount);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        canvas.classList.add('on');
    }
    // Лайк: сердечко пружинит, из кнопки вылетают сердечки в цветах обложки, плашка трека коротко «вибрирует», как
    // тактильный отклик; звук мягкий: щелчок-пузырь и колокольчик мажорного аккорда. Только на «поставить»
    const LIKE = '.sc-button-like, .playbackSoundBadge__like, #sc-wave .scw-like[data-act="like"], .queueItemView__like';
    // Плашка, которая вибрирует на лайке
    const PLATE = '#sc-wave .scw-body, .playControls__inner, .soundList__item, .trackList__item, .compactTrackList__item, .systemPlaylistTrackList__item, .queueItemView, .listenEngagement, .sound';
    let chime: AudioContext | null = null;
    function audio(): AudioContext | null {
        try {
            chime ??= new AudioContext();
            if (chime.state === 'suspended') void chime.resume();
            return chime;
        } catch {
            return null;
        }
    }
    // Общая шина: мягкий срез верхов и короткое эхо, чтобы звук не звенел в ушах
    function bus(ctx: AudioContext, volume: number): GainNode {
        const out = ctx.createGain();
        out.gain.value = volume;
        const tone = ctx.createBiquadFilter();
        tone.type = 'lowpass';
        tone.frequency.value = 5200;
        const echo = ctx.createDelay(0.5);
        echo.delayTime.value = 0.11;
        const feedback = ctx.createGain();
        feedback.gain.value = 0.22;
        out.connect(tone);
        tone.connect(ctx.destination);
        tone.connect(echo);
        echo.connect(feedback);
        feedback.connect(echo);
        echo.connect(ctx.destination);
        setTimeout(() => {
            try {
                out.disconnect();
                echo.disconnect();
                feedback.disconnect();
                tone.disconnect();
            } catch {
                // уже снято
            }
        }, 1500);
        return out;
    }
    function playLike(): void {
        const ctx = audio();
        if (!ctx) return;
        const at = ctx.currentTime + 0.01;
        const out = bus(ctx, 0.9);
        // Пузырь: синус с быстрым спуском высоты
        const pop = ctx.createOscillator();
        const popGain = ctx.createGain();
        pop.type = 'sine';
        pop.frequency.setValueAtTime(1100, at);
        pop.frequency.exponentialRampToValueAtTime(380, at + 0.07);
        popGain.gain.setValueAtTime(0.0001, at);
        popGain.gain.exponentialRampToValueAtTime(0.05, at + 0.006);
        popGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);
        pop.connect(popGain);
        popGain.connect(out);
        pop.start(at);
        pop.stop(at + 0.1);
        // Колокольчик: до-ми-соль шестой октавы с лёгкой раскладкой, у каждой ноты тихий обертон
        [1046.5, 1318.5, 1568].forEach((freq, i) => {
            const t = at + 0.05 + i * 0.035;
            for (const [mult, level] of [[1, 0.028], [2.01, 0.008]] as const) {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.value = freq * mult;
                gain.gain.setValueAtTime(0.0001, t);
                gain.gain.exponentialRampToValueAtTime(level, t + 0.012);
                gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
                osc.connect(gain);
                gain.connect(out);
                osc.start(t);
                osc.stop(t + 0.6);
            }
        });
    }
    // Дизлайк: мягкий «свайп», шум в полосе, которая уходит вниз, как будто карточку смахнули
    function playSwipe(): void {
        const ctx = audio();
        if (!ctx) return;
        const at = ctx.currentTime + 0.01;
        const length = 0.32;
        const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * length), ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        const band = ctx.createBiquadFilter();
        band.type = 'bandpass';
        band.Q.value = 1.4;
        band.frequency.setValueAtTime(2400, at);
        band.frequency.exponentialRampToValueAtTime(380, at + length);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(0.09, at + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
        noise.connect(band);
        band.connect(gain);
        gain.connect(bus(ctx, 0.8));
        noise.start(at);
        noise.stop(at + length);
    }
    const HEART_PATH = 'M8 14.2 6.9 13.2C3 9.7.5 7.4.5 4.6.5 2.3 2.3.5 4.6.5c1.3 0 2.5.6 3.4 1.6C8.9 1.1 10.1.5 11.4.5c2.3 0 4.1 1.8 4.1 4.1 0 2.8-2.5 5.1-6.4 8.6z';
    const reduced = (): boolean => document.documentElement.classList.contains('scm-reduce') || matchMedia('(prefers-reduced-motion: reduce)').matches;
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
            if (cfg.appearance.likeSound) playSwipe();
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
        if (cfg.appearance.likeSound) playLike();
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
            club?.remove();
            thump?.remove();
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
