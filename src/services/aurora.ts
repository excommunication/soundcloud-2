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
}

export const APPEARANCE_DEFAULTS: Appearance = {
    effect: 'liquid',
    palette: 'cover',
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
    const bool = (key: 'calmOnPause' | 'parallax' | 'hoverMotion'): boolean => (typeof value[key] === 'boolean' ? (value[key] as boolean) : APPEARANCE_DEFAULTS[key]);
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
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }
float fbm(vec2 p){ float v = 0.0; float a = 0.5; mat2 r = mat2(0.8, -0.6, 0.6, 0.8); for (int i = 0; i < 5; i++) { v += a * noise(p); p = r * p * 2.02 + 3.1; a *= 0.5; } return v; }
vec3 base(){ return mix(vec3(0.012, 0.016, 0.035), u_c2 * 0.08, 0.6); }
vec3 finish(vec3 col, vec2 uv){
  vec2 q = uv - 0.5; col *= 1.0 - dot(q, q) * 0.9;
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
        '::selection{background:color-mix(in srgb,var(--sca-c1,#3a6bff) 55%,transparent)}',
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
            `#sc-wave .scw-body{background:rgba(10,12,22,${(0.15 + (a.glass / 100) * 0.35).toFixed(3)});backdrop-filter:${blur};-webkit-backdrop-filter:${blur};border-radius:${r + 6}px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.06)}`,
            `#sc-vibe .scv-bar{backdrop-filter:${blur};-webkit-backdrop-filter:${blur}}`,
        );
    }
    if (a.hoverMotion) {
        rows.push(
            '.badgeList__item,.sound__coverArt,.playableTile,.scw-card,.scw-tile{transition:transform .35s cubic-bezier(.2,.8,.2,1),filter .35s ease}',
            '.badgeList__item:hover,.playableTile:hover,.scw-card:hover,.scw-tile:hover{transform:translateY(-3px)}',
            '.badgeList__item:hover .sc-artwork,.playableTile:hover .sc-artwork{filter:brightness(1.08) saturate(1.1)}',
            '.sc-button,.playControls__control,.sc-button-play{transition:transform .2s cubic-bezier(.2,.8,.2,1.4),background-color .2s ease}',
            '.sc-button:active,.playControls__control:active{transform:scale(.94)}',
            '.playControls__play:hover{transform:scale(1.08)}',
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
    const host = window as unknown as Window & { __scAurora?: AuroraApi; __scAuroraPalette?: (colors: string[]) => void };
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
        for (const name of ['u_res', 'u_time', 'u_c1', 'u_c2', 'u_c3', 'u_intensity', 'u_grain', 'u_mouse', 'u_seed']) uniforms[name] = gl.getUniformLocation(program, name);
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
    function sampleCover(): void {
        if (cfg.appearance.palette !== 'cover') return;
        const span = document.querySelector<HTMLElement>('.playbackSoundBadge .sc-artwork span, .playbackSoundBadge__avatar span');
        const match = /url\("?([^")]+)"?\)/.exec(span?.style.backgroundImage ?? '');
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
    function draw(now: number): void {
        frame = requestAnimationFrame(draw);
        if (!gl || !canvas || lost || document.hidden || cfg.appearance.effect === 'off') return;
        const step = 1000 / fpsCap();
        if (now - last < step - 1) return;
        const dt = last ? Math.min(100, now - last) : 16;
        last = now;
        if (!useEffect(cfg.appearance.effect)) return;
        resize();
        const a = cfg.appearance;
        const calm = a.calmOnPause && !musicPlaying();
        const speedWant = calm ? 0.18 : 1;
        speedNow += (speedWant - speedNow) * Math.min(1, dt / 900);
        time += (dt / 1000) * (0.15 + (a.speed / 100) * 2.2) * speedNow;
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
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        canvas.classList.add('on');
    }
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
        if (cfg.appearance.palette === 'cover') sampleCover();
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
        setCssColors(cfg.colors);
        return;
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
    return '(function(){\n' + glowPalette.toString() + '\n(' + auroraPage.toString() + ')(' + JSON.stringify(config) + ');\n})();';
}
