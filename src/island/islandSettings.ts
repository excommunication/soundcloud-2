// Настройки «Острова»: плашки сейчас играющего сверху экрана, как Dynamic Island у iPhone. Хранятся одним объектом
// под ключом island; F1 шлёт его целиком, main проверяет и дополняет недостающее значениями по умолчанию
import type { Rectangle } from 'electron';

export const ISLAND_KEY = 'island';

export type IslandPosition = 'left' | 'center' | 'right';
export type IslandDisplay = 'primary' | 'app';
export type IslandSize = 'small' | 'normal' | 'large';
/** Место после перетаскивания: экран (id дисплея Electron) и левый верхний угол окна от угла его рабочей области, DIP */
export interface IslandPlace {
    display: number;
    x: number;
    y: number;
}

export interface IslandSettings {
    enabled: boolean;
    position: IslandPosition;
    /** primary: основной экран; app: экран, где окно клиента */
    display: IslandDisplay;
    size: IslandSize;
    /** Отступ от верха рабочей области, DIP */
    offset: number;
    /** Раскрываться при наведении */
    expandOnHover: boolean;
    /** Раскрываться на пару секунд при смене трека */
    announceTrack: boolean;
    /** Название трека в свёрнутой плашке */
    showTitle: boolean;
    /** Прятаться, пока на этом экране игра или видео во весь экран */
    hideFullscreen: boolean;
    /** Прятаться, пока окно клиента впереди: там и так видно, что играет */
    hideInApp: boolean;
    /** Прятаться через PAUSE_HIDE_MS паузы */
    hideWhenPaused: boolean;
    /** Перетащен мышью: своё место вместо положения и экрана из настроек; null — место по умолчанию */
    place: IslandPlace | null;
}

export const ISLAND_DEFAULTS: Readonly<IslandSettings> = {
    enabled: true,
    position: 'center',
    display: 'primary',
    size: 'normal',
    offset: 8,
    expandOnHover: true,
    announceTrack: true,
    showTitle: true,
    hideFullscreen: true,
    hideInApp: true,
    hideWhenPaused: true,
    place: null,
};

export const ISLAND_OFFSET_MAX = 48;
/** Пауза, после которой плашка уходит, если включено hideWhenPaused */
export const PAUSE_HIDE_MS = 20_000;

const BOOLEAN_FIELDS = ['enabled', 'expandOnHover', 'announceTrack', 'showTitle', 'hideFullscreen', 'hideInApp', 'hideWhenPaused'] as const;
const POSITIONS: readonly string[] = ['left', 'center', 'right'];
const DISPLAYS: readonly string[] = ['primary', 'app'];
const SIZES: readonly string[] = ['small', 'normal', 'large'];

/** Смещение места: в пределах самого большого разумного экрана, чтобы битое значение не унесло окно в бесконечность */
const PLACE_LIMIT = 20000;
export function isIslandPlace(value: unknown): value is IslandPlace {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    return Object.keys(record).length === 3 && Number.isSafeInteger(record.display) &&
        [record.x, record.y].every((n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= PLACE_LIMIT);
}

function isOffset(value: unknown): value is number {
    return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= ISLAND_OFFSET_MAX;
}

/** Строгая проверка того, что прислал F1: все поля на месте и в своих пределах, лишних нет */
export function isIslandSettings(value: unknown): value is IslandSettings {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record);
    if (keys.length !== Object.keys(ISLAND_DEFAULTS).length || keys.some((key) => !Object.prototype.hasOwnProperty.call(ISLAND_DEFAULTS, key))) return false;
    return BOOLEAN_FIELDS.every((key) => typeof record[key] === 'boolean') &&
        POSITIONS.includes(record.position as string) && DISPLAYS.includes(record.display as string) && SIZES.includes(record.size as string) &&
        isOffset(record.offset) && (record.place === null || isIslandPlace(record.place));
}

/** Сохранённое значение любой давности: битое и недостающее берётся по умолчанию */
export function normalizeIsland(value: unknown): IslandSettings {
    const record = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
    const result: IslandSettings = { ...ISLAND_DEFAULTS };
    for (const key of BOOLEAN_FIELDS) if (typeof record[key] === 'boolean') result[key] = record[key];
    if (POSITIONS.includes(record.position as string)) result.position = record.position as IslandPosition;
    if (DISPLAYS.includes(record.display as string)) result.display = record.display as IslandDisplay;
    if (SIZES.includes(record.size as string)) result.size = record.size as IslandSize;
    if (isOffset(record.offset)) result.offset = record.offset;
    if (isIslandPlace(record.place)) result.place = { display: record.place.display, x: Math.round(record.place.x), y: Math.round(record.place.y) };
    return result;
}

export const ISLAND_SCALE: Record<IslandSize, number> = { small: 0.86, normal: 1, large: 1.18 };
/** Окно острова: под раскрытую плашку с тенью, DIP при масштабе 1. Пустое место окна пропускает мышь насквозь */
export const ISLAND_WINDOW = { width: 440, height: 220 } as const;
/** Поле от края экрана для положения слева и справа */
const EDGE = 12;

/** Размер окна острова при этом масштабе, но не шире экрана */
function windowSize(area: Rectangle, size: IslandSize): { width: number; height: number } {
    const scale = ISLAND_SCALE[size];
    return { width: Math.min(area.width, Math.round(ISLAND_WINDOW.width * scale)), height: Math.min(area.height, Math.round(ISLAND_WINDOW.height * scale)) };
}

/** Где окно острова на экране: сверху рабочей области (панель задач сверху тоже учтена) */
export function islandBounds(area: Rectangle, settings: Pick<IslandSettings, 'position' | 'size' | 'offset'>): Rectangle {
    const { width, height } = windowSize(area, settings.size);
    const x = settings.position === 'left' ? area.x + EDGE : settings.position === 'right' ? area.x + area.width - width - EDGE : area.x + Math.round((area.width - width) / 2);
    return { x: Math.round(x), y: area.y + settings.offset, width, height };
}

export interface IslandScreen {
    id: number;
    workArea: Rectangle;
}

/** Окно целиком внутри рабочей области: экран сменил разрешение или масштаб, а место осталось от старого */
function clampInto(area: Rectangle, x: number, y: number, width: number, height: number): Rectangle {
    return {
        x: Math.round(Math.max(area.x, Math.min(x, area.x + area.width - width))),
        y: Math.round(Math.max(area.y, Math.min(y, area.y + area.height - height))),
        width,
        height,
    };
}

/** Где окно: перетащенное на свой экран, а если того экрана больше нет или места нет — по умолчанию на fallback */
export function placedBounds(screens: readonly IslandScreen[], fallback: IslandScreen, settings: Pick<IslandSettings, 'position' | 'size' | 'offset' | 'place'>): { bounds: Rectangle; display: number } {
    const place = settings.place;
    const target = place ? screens.find((item) => item.id === place.display) : undefined;
    if (!place || !target) return { bounds: islandBounds(fallback.workArea, settings), display: fallback.id };
    const { width, height } = windowSize(target.workArea, settings.size);
    return { bounds: clampInto(target.workArea, target.workArea.x + place.x, target.workArea.y + place.y, width, height), display: target.id };
}

/** Отпущенное ближе этого к месту по умолчанию на том же экране возвращается на него */
export const SNAP_DISTANCE = 28;

/** Куда положить окно, отпущенное в bounds на экране drop: своё место или null (прилипло к месту по умолчанию) */
export function dropPlace(drop: IslandScreen, bounds: Rectangle, home: IslandScreen, settings: Pick<IslandSettings, 'position' | 'size' | 'offset'>): IslandPlace | null {
    if (drop.id === home.id) {
        const usual = islandBounds(home.workArea, settings);
        if (Math.hypot(bounds.x - usual.x, bounds.y - usual.y) <= SNAP_DISTANCE) return null;
    }
    const fitted = clampInto(drop.workArea, bounds.x, bounds.y, bounds.width, bounds.height);
    return { display: drop.id, x: fitted.x - drop.workArea.x, y: fitted.y - drop.workArea.y };
}

/**
 * Форма окна в режиме совместимости NVIDIA: там нет прозрачных окон, поэтому окно непрозрачное и обрезано по плашке.
 * Скруглённый прямоугольник из полос по строке на скруглениях и одного прямоугольника посередине
 */
export function roundedShape(rect: Rectangle, radius: number): Rectangle[] {
    const x = Math.round(rect.x);
    const y = Math.round(rect.y);
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const r = Math.max(0, Math.min(Math.round(radius), Math.floor(width / 2), Math.floor(height / 2)));
    const rects: Rectangle[] = [];
    for (let row = 0; row < r; row++) {
        const dy = r - row - 0.5;
        const inset = Math.round(r - Math.sqrt(r * r - dy * dy));
        const strip = { x: x + inset, width: width - inset * 2, height: 1 };
        rects.push({ ...strip, y: y + row }, { ...strip, y: y + height - 1 - row });
    }
    if (height - r * 2 > 0) rects.push({ x, y: y + r, width, height: height - r * 2 });
    return rects;
}
