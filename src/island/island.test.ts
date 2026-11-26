import { describe, expect, it } from 'vitest';
import { ISLAND_DEFAULTS, ISLAND_WINDOW, dropPlace, isIslandSettings, islandBounds, normalizeIsland, largeArtwork, placedBounds, roundedShape } from './islandSettings';
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
        expect(isIslandSettings({ ...ISLAND_DEFAULTS, opacity: 0.5 })).toBe(true);
        expect(isIslandSettings({ ...ISLAND_DEFAULTS, opacity: 0.1 })).toBe(false);
        expect(isIslandSettings({ ...ISLAND_DEFAULTS, opacity: 1.2 })).toBe(false);
        expect(isIslandSettings({ ...ISLAND_DEFAULTS, opacity: '1' })).toBe(false);
        expect(normalizeIsland({ opacity: 0.456 }).opacity).toBe(0.46);
        expect(normalizeIsland({ opacity: 5 }).opacity).toBe(1);
        expect(normalizeIsland({}).opacity).toBe(1);
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
    it('свёрнутое окно, рабочий стол и трей впереди не прячут остров даже при состоянии игры', () => {
        expect(coversIsland(window({ iconic: true, rect: { left: -32000, top: -32000, right: -31840, bottom: -31972 } }), 1)).toBe(false);
        expect(coversIsland(window({ iconic: true, notificationState: 3 }), 1)).toBe(false);
        expect(coversIsland(window({ className: 'Shell_TrayWnd', notificationState: 3 }), 1)).toBe(false);
        expect(coversIsland(window({ className: 'Progman', notificationState: 4 }), 1)).toBe(false);
        expect(coversIsland(window({ rect: { left: 0, top: 0, right: 0, bottom: 0 } }), 1)).toBe(false);
    });
    it('состояние 7 без полноэкранной геометрии (обычное окно Store) не прячет остров', () => {
        expect(coversIsland(window({ rect: { left: 100, top: 100, right: 900, bottom: 700 }, notificationState: 7 }), 1)).toBe(false);
        expect(coversIsland(window({ notificationState: 7 }), 1)).toBe(true);
    });
    it('эксклюзивный полный экран DirectX и презентация прячут всегда', () => {
        expect(coversIsland(window({ none: true, notificationState: 3 }), 1)).toBe(true);
        expect(coversIsland(window({ rect: { left: 0, top: 0, right: 10, bottom: 10 }, notificationState: 4 }), 1)).toBe(true);
    });
});

describe('перетаскивание и несколько мониторов', () => {
    const primary = { id: 1, workArea: { x: 0, y: 0, width: 1920, height: 1040 } };
    const left = { id: 2, workArea: { x: -1280, y: 0, width: 1280, height: 984 } };
    it('место после перетаскивания хранится от угла своего экрана и переживает F1', () => {
        const place = { display: 2, x: 300, y: 500 };
        expect(normalizeIsland({ place }).place).toEqual(place);
        expect(isIslandSettings({ ...ISLAND_DEFAULTS, place })).toBe(true);
        expect(isIslandSettings({ ...ISLAND_DEFAULTS, place: { display: 2, x: 1e9, y: 0 } })).toBe(false);
        expect(normalizeIsland({ place: { display: 'two', x: 1, y: 1 } }).place).toBeNull();
    });
    it('на своём экране окно встаёт на своё место; пропавший экран возвращает на место по умолчанию', () => {
        const settings = { ...ISLAND_DEFAULTS, place: { display: 2, x: 300, y: 500 } };
        expect(placedBounds([primary, left], primary, settings)).toEqual({ display: 2, bounds: { x: -980, y: 500, width: ISLAND_WINDOW.width, height: ISLAND_WINDOW.height } });
        expect(placedBounds([primary], primary, settings)).toEqual({ display: 1, bounds: islandBounds(primary.workArea, settings) });
        // Экран стал меньше: окно поджимается внутрь, а не уезжает за край
        const small = { id: 2, workArea: { x: -1280, y: 0, width: 1280, height: 600 } };
        const fitted = placedBounds([primary, small], primary, settings).bounds;
        expect(fitted.y + fitted.height).toBeLessThanOrEqual(600);
    });
    it('отпущенное рядом с обычным местом прилипает к нему, на другом экране — своё место', () => {
        const usual = islandBounds(primary.workArea, ISLAND_DEFAULTS);
        expect(dropPlace(primary, { ...usual, x: usual.x + 10, y: usual.y + 12 }, primary, ISLAND_DEFAULTS)).toBeNull();
        expect(dropPlace(primary, { ...usual, x: usual.x + 300 }, primary, ISLAND_DEFAULTS)).toEqual({ display: 1, x: usual.x + 300, y: usual.y });
        expect(dropPlace(left, { ...usual, x: -900, y: 40 }, primary, ISLAND_DEFAULTS)).toEqual({ display: 2, x: 380, y: 40 });
    });
});

describe('форма окна без прозрачности', () => {
    it('скруглённая плашка: полосы на скруглениях уже середины, вместе покрывают ровно её высоту', () => {
        const rects = roundedShape({ x: 80, y: 0, width: 280, height: 34 }, 17);
        const rows = new Set<number>();
        for (const rect of rects) for (let y = rect.y; y < rect.y + rect.height; y++) rows.add(y);
        expect(rows.size).toBe(34);
        const top = rects.find((rect) => rect.y === 0)!;
        expect(top.x).toBeGreaterThan(80);
        expect(top.x + top.width).toBeLessThan(360);
        expect(rects.every((rect) => rect.x >= 80 && rect.x + rect.width <= 360)).toBe(true);
    });
    it('радиус больше половины плашки срезается, без радиуса один прямоугольник', () => {
        expect(roundedShape({ x: 0, y: 0, width: 40, height: 20 }, 0)).toEqual([{ x: 0, y: 0, width: 40, height: 20 }]);
        expect(roundedShape({ x: 0, y: 0, width: 40, height: 20 }, 99).length).toBe(20);
    });
});

describe('крупная обложка острова', () => {
    it('меняет размер из суффикса на 500x500 и не трогает прочее', () => {
        expect(largeArtwork('https://i1.sndcdn.com/artworks-abc-t50x50.jpg')).toBe('https://i1.sndcdn.com/artworks-abc-t500x500.jpg');
        expect(largeArtwork('https://i1.sndcdn.com/artworks-abc-large.png?x=1')).toBe('https://i1.sndcdn.com/artworks-abc-t500x500.png?x=1');
        expect(largeArtwork('https://i1.sndcdn.com/artworks-abc-original.jpg')).toBe('https://i1.sndcdn.com/artworks-abc-original.jpg');
    });
});
