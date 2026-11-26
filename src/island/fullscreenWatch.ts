// Игра или видео во весь экран: остров уходит, чтобы не висеть поверх. В Electron этого не узнать, поэтому
// user32 и shell32 вызываются через koffi (как превью панели задач). Без koffi или при отказе считается, что
// полноэкранного окна нет: остров просто остаётся на месте

export interface ScreenRect {
    left: number;
    top: number;
    right: number;
    bottom: number;
}

/** Что видно об окне впереди; координаты физические, как их отдаёт Windows */
export interface ForegroundInfo {
    /** Окна впереди нет (рабочий стол меняется, экран блокировки) */
    none: boolean;
    className: string;
    rect: ScreenRect;
    /** Монитор окна впереди */
    monitor: number;
    monitorRect: ScreenRect;
    /** Окно развёрнуто кнопкой «Развернуть»: это не полный экран, даже если панель задач скрыта */
    zoomed: boolean;
    /** Окно свёрнуто (IsIconic): его прямоугольник за экраном, закрывать остров оно не может */
    iconic?: boolean;
    /** Состояние уведомлений Windows: 3 игра DirectX во весь экран, 4 режим презентации, 7 приложение Store во весь экран */
    notificationState: number;
}

export interface FullscreenBridge {
    foreground(): ForegroundInfo;
    /** Монитор, на котором окно с этим HWND */
    monitorOf(hwnd: number): number;
}

/** Окна оболочки Windows: рабочий стол и панель задач во весь экран, но это не игра */
const SHELL_CLASSES = new Set(['Progman', 'WorkerW', 'Shell_TrayWnd', 'Shell_SecondaryTrayWnd', 'Windows.UI.Core.CoreWindow', 'XamlExplorerHostIslandWindow']);
const QUNS_RUNNING_D3D_FULL_SCREEN = 3;
const QUNS_PRESENTATION_MODE = 4;

/** Мешает ли окно впереди острову на мониторе islandMonitor */
export function coversIsland(info: ForegroundInfo, islandMonitor: number): boolean {
    // Свёрнутое окно и оболочка (рабочий стол, трей) впереди: так бывает при сворачивании браузера, остров остаётся
    if (info.iconic) return false;
    const shell = SHELL_CLASSES.has(info.className);
    // Эксклюзивный полный экран DirectX: окно может и не совпадать с монитором, но поверх острова всё равно рисует игра.
    // Состояние 7 Windows ставит и обычным окнам Store/UWP, поэтому ему верят только вместе с геометрией
    if ((info.notificationState === QUNS_RUNNING_D3D_FULL_SCREEN || info.notificationState === QUNS_PRESENTATION_MODE) && !shell) return true;
    if (info.none || info.zoomed || shell) return false;
    if (islandMonitor && info.monitor && info.monitor !== islandMonitor) return false;
    const { rect, monitorRect } = info;
    return rect.right > rect.left && rect.bottom > rect.top
        && rect.left <= monitorRect.left && rect.top <= monitorRect.top && rect.right >= monitorRect.right && rect.bottom >= monitorRect.bottom;
}

type Call<A extends unknown[]> = (...args: A) => unknown;
let loading: Promise<FullscreenBridge> | null = null;

/** Мост к user32/shell32; структуры koffi регистрируются один раз на процесс, поэтому и мост один */
export function loadFullscreenBridge(): Promise<FullscreenBridge> {
    loading ??= (async () => {
        const { default: koffi } = await import('koffi');
        const user32 = koffi.load('user32.dll');
        const shell32 = koffi.load('shell32.dll');
        koffi.struct('SCI_RECT', { left: 'int32_t', top: 'int32_t', right: 'int32_t', bottom: 'int32_t' });
        koffi.struct('SCI_MONITORINFO', { cbSize: 'uint32_t', rcMonitor: 'SCI_RECT', rcWork: 'SCI_RECT', dwFlags: 'uint32_t' });
        const getForeground = user32.func('intptr_t __stdcall GetForegroundWindow()') as Call<[]>;
        const getRect = user32.func('int __stdcall GetWindowRect(intptr_t hwnd, _Out_ SCI_RECT *rect)') as Call<[number, Record<string, number>]>;
        const monitorFromWindow = user32.func('intptr_t __stdcall MonitorFromWindow(intptr_t hwnd, uint32_t flags)') as Call<[number, number]>;
        const getMonitorInfo = user32.func('int __stdcall GetMonitorInfoW(intptr_t monitor, _Inout_ SCI_MONITORINFO *info)') as Call<[number, Record<string, unknown>]>;
        const getClassName = user32.func('int __stdcall GetClassNameW(intptr_t hwnd, void *name, int max)') as Call<[number, Buffer, number]>;
        const isZoomed = user32.func('int __stdcall IsZoomed(intptr_t hwnd)') as Call<[number]>;
        const isIconic = user32.func('int __stdcall IsIconic(intptr_t hwnd)') as Call<[number]>;
        const queryState = shell32.func('long __stdcall SHQueryUserNotificationState(_Out_ int *state)') as Call<[number[]]>;
        const MONITOR_DEFAULTTONEAREST = 2;
        const num = (value: unknown): number => (typeof value === 'number' ? value : typeof value === 'bigint' ? Number(value) : 0);
        const empty = (): ScreenRect => ({ left: 0, top: 0, right: 0, bottom: 0 });
        return {
            monitorOf: (hwnd) => num(monitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST)),
            foreground() {
                const state = [0];
                const notificationState = num(queryState(state)) >= 0 ? state[0] : 0;
                const hwnd = num(getForeground());
                if (!hwnd) return { none: true, className: '', rect: empty(), monitor: 0, monitorRect: empty(), zoomed: false, notificationState };
                const rect = empty() as unknown as Record<string, number>;
                getRect(hwnd, rect);
                const monitor = num(monitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST));
                const info: Record<string, unknown> = { cbSize: 40, rcMonitor: empty(), rcWork: empty(), dwFlags: 0 };
                getMonitorInfo(monitor, info);
                const name = Buffer.alloc(512);
                const length = num(getClassName(hwnd, name, 256));
                return {
                    none: false,
                    className: name.toString('utf16le', 0, Math.max(0, length) * 2),
                    rect: rect as unknown as ScreenRect,
                    monitor,
                    monitorRect: info.rcMonitor as ScreenRect,
                    zoomed: num(isZoomed(hwnd)) !== 0,
                    iconic: num(isIconic(hwnd)) !== 0,
                    notificationState,
                };
            },
        };
    })();
    loading.catch(() => {
        loading = null;
    });
    return loading;
}
