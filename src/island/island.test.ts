import { describe, expect, it } from 'vitest';
import { ISLAND_DEFAULTS, ISLAND_WINDOW, isIslandSettings, islandBounds, normalizeIsland } from './islandSettings';
import { coversIsland, type ForegroundInfo } from './fullscreenWatch';
import { validateSettingChange } from '../settings/validateSetting';

const area = { x: 0, y: 0, width: 1920, height: 1040 };

describe('настройки острова', () => {
    it('по умолчанию включён, по центру, прячется в играх и в самом клиенте', () => {
        expect(normalizeIsland(undefined)).toEqual(ISLAND_DEFAULTS);
        expect(isIslandSettings({ ...ISLAND_DEFAULTS })).toBe(true);
    });
    it('битое и недостающее берётся по умолчанию, верное сохраняется', () => {
        expect(normalizeIsland({ position: 'right', offset: 99, size: 'huge', enabled: 'yes', hideInApp: false })).toEqual({ ...ISLAND_DEFAULTS, position: 'right', hideInApp: false });
        expect(normalizeIsland('мусор')).toEqual(ISLAND_DEFAULTS);
    });
    it('F1 присылает объект целиком: лишнее, недостающее и чужие значения отклоняются', () => {
        expect(isIslandSettings({ ...ISLAND_DEFAULTS, extra: 1 })).toBe(false);
        const missing: Record<string, unknown> = { ...ISLAND_DEFAULTS };
        delete missing.offset;
        expect(isIslandSettings(missing)).toBe(false);
        expect(isIslandSettings({ ...ISLAND_DEFAULTS, offset: 2.5 })).toBe(false);
        expect(isIslandSettings({ ...ISLAND_DEFAULTS, display: 'all' })).toBe(false);
        expect(validateSettingChange({ key: 'island', value: { ...ISLAND_DEFAULTS, size: 'large' } })).toBe(true);
        expect(validateSettingChange({ key: 'island', value: true })).toBe(false);
    });
    it('окно сверху рабочей области: по центру, у краёв, с отступом и масштабом', () => {
        expect(islandBounds(area, ISLAND_DEFAULTS)).toEqual({ x: (1920 - ISLAND_WINDOW.width) / 2, y: 8, width: ISLAND_WINDOW.width, height: ISLAND_WINDOW.height });
        expect(islandBounds(area, { ...ISLAND_DEFAULTS, position: 'left', offset: 0 }).x).toBe(12);
        const right = islandBounds(area, { ...ISLAND_DEFAULTS, position: 'right' });
        expect(right.x + right.width).toBe(1920 - 12);
        // Панель задач сверху и второй монитор левее основного
        expect(islandBounds({ x: -1280, y: 40, width: 1280, height: 984 }, ISLAND_DEFAULTS).y).toBe(48);
        expect(islandBounds(area, { ...ISLAND_DEFAULTS, size: 'large' }).width).toBeGreaterThan(ISLAND_WINDOW.width);
    });
});

const monitor = { left: 0, top: 0, right: 1920, bottom: 1080 };
const window = (patch: Partial<ForegroundInfo> = {}): ForegroundInfo => ({
    none: false, className: 'UnityWndClass', rect: { ...monitor }, monitor: 1, monitorRect: monitor, zoomed: false, notificationState: 5, ...patch,
});

describe('полноэкранное окно впереди', () => {
    it('игра или видео без рамки во весь экран острова прячут его', () => {
        expect(coversIsland(window(), 1)).toBe(true);
        expect(coversIsland(window({ className: 'Chrome_WidgetWin_1', rect: { left: -1, top: -1, right: 1921, bottom: 1081 } }), 1)).toBe(true);
    });
    it('обычное, развёрнутое окно, рабочий стол и другой монитор не мешают', () => {
        expect(coversIsland(window({ rect: { left: 100, top: 100, right: 900, bottom: 700 } }), 1)).toBe(false);
        expect(coversIsland(window({ zoomed: true }), 1)).toBe(false);
        expect(coversIsland(window({ className: 'WorkerW' }), 1)).toBe(false);
        expect(coversIsland(window({ monitor: 2 }), 1)).toBe(false);
        expect(coversIsland(window({ none: true }), 1)).toBe(false);
    });
    it('эксклюзивный полный экран DirectX и презентация прячут всегда', () => {
        expect(coversIsland(window({ none: true, notificationState: 3 }), 1)).toBe(true);
        expect(coversIsland(window({ rect: { left: 0, top: 0, right: 10, bottom: 10 }, notificationState: 4 }), 1)).toBe(true);
    });
});
