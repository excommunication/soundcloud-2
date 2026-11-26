// Настройки «Острова»: плашки сейчас играющего сверху экрана, как Dynamic Island у iPhone. Хранятся одним объектом
// под ключом island; F1 шлёт его целиком, main проверяет и дополняет недостающее значениями по умолчанию
import type { Rectangle } from 'electron';

export const ISLAND_KEY = 'island';

export type IslandPosition = 'left' | 'center' | 'right';
export type IslandDisplay = 'primary' | 'app';
export type IslandSize = 'small' | 'normal' | 'large';

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
};

export const ISLAND_OFFSET_MAX = 48;
/** Пауза, после которой плашка уходит, если включено hideWhenPaused */
export const PAUSE_HIDE_MS = 20_000;

const BOOLEAN_FIELDS = ['enabled', 'expandOnHover', 'announceTrack', 'showTitle', 'hideFullscreen', 'hideInApp', 'hideWhenPaused'] as const;
const POSITIONS: readonly string[] = ['left', 'center', 'right'];
const DISPLAYS: readonly string[] = ['primary', 'app'];
const SIZES: readonly string[] = ['small', 'normal', 'large'];

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
        isOffset(record.offset);
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
    return result;
}

export const ISLAND_SCALE: Record<IslandSize, number> = { small: 0.86, normal: 1, large: 1.18 };
/** Окно острова: под раскрытую плашку с тенью, DIP при масштабе 1. Пустое место окна пропускает мышь насквозь */
export const ISLAND_WINDOW = { width: 440, height: 220 } as const;
/** Поле от края экрана для положения слева и справа */
const EDGE = 12;

/** Где окно острова на экране: сверху рабочей области (панель задач сверху тоже учтена) */
export function islandBounds(area: Rectangle, settings: Pick<IslandSettings, 'position' | 'size' | 'offset'>): Rectangle {
    const scale = ISLAND_SCALE[settings.size];
    const width = Math.min(area.width, Math.round(ISLAND_WINDOW.width * scale));
    const height = Math.round(ISLAND_WINDOW.height * scale);
    const x = settings.position === 'left' ? area.x + EDGE : settings.position === 'right' ? area.x + area.width - width - EDGE : area.x + Math.round((area.width - width) / 2);
    return { x: Math.round(x), y: area.y + settings.offset, width, height };
}
