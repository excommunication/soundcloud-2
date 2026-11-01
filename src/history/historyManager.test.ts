import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('electron', () => ({
    ipcMain: { handle: vi.fn(), on: vi.fn(), removeHandler: vi.fn(), removeListener: vi.fn() },
    WebContentsView: vi.fn(), BrowserWindow: vi.fn(), app: {}, clipboard: {}, dialog: {}, nativeImage: {},
}));
import type { BrowserWindow } from 'electron';
import type { LibraryService } from '../services/libraryService';
import { HistoryManager, type HistoryHost } from './historyManager';

let heard = 0;
const request = vi.fn(async (method: string): Promise<unknown> => method === 'overview' ? { heard } : undefined);
const onRecap = vi.fn();
let manager: HistoryManager;
beforeEach(() => {
    vi.useFakeTimers();
    heard = 0;
    request.mockClear(); onRecap.mockClear();
    const window = { on: vi.fn(), once: vi.fn(), removeListener: vi.fn(), isDestroyed: () => false } as unknown as BrowserWindow;
    const host = { site: () => null, fallbackUser: () => 77, recapSeen: () => '', setRecapSeen: vi.fn(), onRecap } as unknown as HistoryHost;
    manager = new HistoryManager(window, { request, close: vi.fn(async () => undefined) } as unknown as LibraryService, host);
});
afterEach(() => {
    manager.dispose();
    vi.useRealTimers();
});
const overviews = (): number => request.mock.calls.filter(([method]) => method === 'overview').length;

it('сводку закрытой недели считает один раз, а в первые сутки после конца недели пересчитывает', async () => {
    // Понедельник полдень: сигналы прошлой недели ещё могут дописываться
    vi.setSystemTime(new Date(2026, 10, 2, 12, 0));
    await manager.checkRecap();
    await manager.checkRecap();
    expect(overviews()).toBe(2);

    vi.setSystemTime(new Date(2026, 10, 4, 12, 0));
    await manager.checkRecap();
    await manager.checkRecap();
    await manager.checkRecap();
    expect(overviews()).toBe(3);
    expect(onRecap).not.toHaveBeenCalled();
    // Через 6 часов ответ проверяется снова: туда могли попасть прослушивания из восстановленной копии
    vi.setSystemTime(new Date(2026, 10, 4, 18, 30));
    await manager.checkRecap();
    expect(overviews()).toBe(4);
});

it('пустой ответ индекса не запоминается', async () => {
    vi.setSystemTime(new Date(2026, 10, 4, 12, 0));
    request.mockImplementationOnce(async () => undefined).mockImplementationOnce(async () => null);
    await manager.checkRecap();
    await manager.checkRecap();
    expect(overviews()).toBe(2);
});

it('найденная сводка не теряется, когда ответ взят из запомненного', async () => {
    heard = 5;
    vi.setSystemTime(new Date(2026, 10, 4, 12, 0));
    await manager.checkRecap();
    await manager.checkRecap();
    expect(overviews()).toBe(1);
    expect(onRecap).toHaveBeenCalledExactlyOnceWith(true);
    // Следующая неделя считается заново
    vi.setSystemTime(new Date(2026, 10, 11, 12, 0));
    heard = 0;
    await manager.checkRecap();
    expect(overviews()).toBe(2);
    expect(onRecap).toHaveBeenLastCalledWith(false);
});
