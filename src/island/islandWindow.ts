// «Остров»: чёрная плашка сейчас играющего сверху экрана, как Dynamic Island у iPhone. Отдельное прозрачное окно поверх
// остальных, без фокуса и без значка на панели задач. Пустое место окна пропускает мышь насквозь, ловит её только сама
// плашка. Окно прячется, пока ничего не играет, пока впереди клиент, игра или видео во весь экран, и после долгой паузы.
// Плашку можно перетащить мышью на любое место любого экрана; рядом с местом по умолчанию она прилипает обратно.
// В режиме совместимости NVIDIA (GPU в главном процессе без DirectComposition) прозрачных окон нет: там окно
// непрозрачное и обрезано по форме плашки (shaped), что вне плашки — не окно, клики туда проходят сами
import { BrowserWindow, clipboard, ipcMain, screen, type Display, type Rectangle } from 'electron';
import { join } from 'path';
import { trustLocalFile } from '../trustedViews';
import type { TrackInfo } from '../types';
import { coversIsland, loadFullscreenBridge, type FullscreenBridge } from './fullscreenWatch';
import { ISLAND_SCALE, PAUSE_HIDE_MS, dropPlace, placedBounds, roundedShape, type IslandScreen, type IslandSettings } from './islandSettings';

export interface DynamicIslandDeps {
    track(): TrackInfo;
    language(): 'ru' | 'en';
    /** Новогодняя тема сейчас: в острове идёт снег */
    winter(): boolean;
    reduceMotion(): boolean;
    command(name: 'toggle' | 'next' | 'previous' | 'like'): void;
    /** Громкость страницы: число 0..1 ставит, 'mute' переключает звук, без значения просто читает; -1, если не вышло */
    volume(value?: number | 'mute'): Promise<number>;
    /** Перемотать играющий трек на долю 0..1 */
    seek(fraction: number): void;
    /** Показать клиент; section: открыть F1 на этом разделе */
    open(section?: 'island'): void;
    /** Окно клиента: для экрана «где клиент» и для «прятать, пока клиент впереди» */
    mainWindow(): BrowserWindow | null;
    /** Записать настройки, поменянные самим островом (выключение, новое место), и показать их в F1 */
    save(settings: IslandSettings): void;
    /** Окно без прозрачности, обрезанное по плашке: режим совместимости NVIDIA */
    shaped: boolean;
}

type MenuEntry = { id: string; label: string; icon?: string; danger?: boolean; checked?: boolean; disabled?: boolean } | { separator: true };
/** Размеры меню в px окна: должны совпадать с islandMenu.css */
const MENU_WIDTH = 272;
const MENU_ROW = 36;
const MENU_SEPARATOR = 13;
const MENU_INSET = 6;
const MENU_RADIUS = 14;
/** Поле под тень вокруг меню, пока окно прозрачное */
const MENU_PAD = 14;

/** Как часто смотреть, нет ли впереди полноэкранного окна */
const FULLSCREEN_POLL_MS = 1500;
/** Через сколько повторить проверку, прежде чем спрятать остров: переходные кадры при сворачивании окон не считаются */
const FULLSCREEN_CONFIRM_MS = 350;
/** Шаг перетаскивания: окно идёт за курсором с частотой кадров */
const DRAG_STEP_MS = 16;
/** Отпускание потерялось (кнопку отпустили вне окна, пока оно не успело догнать): перетаскивание кончается само */
const DRAG_LIMIT_MS = 60_000;
/** Сквозной режим: прозрачность бледной плашки, сколько держать курсор, чтобы она ожила, и шаг проверки */
const GHOST_OPACITY = 0.3;
const GHOST_WAKE_MS = 380;
const GHOST_STEP_MS = 40;

export class DynamicIsland {
    private window: BrowserWindow | null = null;
    private settings: IslandSettings;
    private trackKey = '';
    private pausedSince = 0;
    private pauseTimer: ReturnType<typeof setTimeout> | null = null;
    private poll: ReturnType<typeof setInterval> | null = null;
    private bridge: FullscreenBridge | null = null;
    private bridgeBroken = process.platform !== 'win32';
    private fullscreen = false;
    /** «Скрыть до следующего трека» из меню плашки */
    private snoozedFor = '';
    private appFocused = false;
    private ready = false;
    private disposed = false;
    private readonly onDisplays = (): void => this.place();
    private readonly onMainMoved = (): void => {
        if (this.settings.display === 'app') this.place();
    };
    private readonly onMainFocus = (): void => {
        this.appFocused = true;
        this.refresh();
    };
    private readonly onMainBlur = (): void => {
        this.appFocused = false;
        this.refresh();
    };
    private menuWindow: BrowserWindow | null = null;
    private menuOpenedAt = 0;
    /** Плашка внутри окна (DIP): для «сквозного» режима и проверки курсора */
    private shapeRect: { x: number; y: number; width: number; height: number } | null = null;
    /** Нажатие на плашке: main сам следит за кнопкой мыши и начинает или кончает перетаскивание */
    private pressPoll: ReturnType<typeof setInterval> | null = null;
    /** Курсор над свёрнутой плашкой, но ещё не остановился: окно полупрозрачное и пропускает клики насквозь */
    private ghost: ReturnType<typeof setInterval> | null = null;
    private watched: BrowserWindow | null = null;
    private drag: { timer: ReturnType<typeof setInterval>; until: number; cursor: Electron.Point; from: Rectangle } | null = null;

    constructor(private readonly deps: DynamicIslandDeps, settings: IslandSettings) {
        this.settings = settings;
        ipcMain.removeHandler('island:state');
        ipcMain.removeAllListeners('island:act');
        ipcMain.removeAllListeners('island:hover');
        ipcMain.removeAllListeners('island:drag');
        ipcMain.removeAllListeners('island:shape');
        ipcMain.removeHandler('island:volume');
        ipcMain.removeAllListeners('island:seek');
        ipcMain.on('island:seek', (event, fraction: unknown) => {
            if (this.owns(event.sender) && typeof fraction === 'number' && Number.isFinite(fraction)) this.deps.seek(Math.max(0, Math.min(1, fraction)));
        });
        ipcMain.on('island:drag', (event, phase: unknown) => {
            if (!this.owns(event.sender)) return;
            if (phase === 'press') this.press();
            else if (phase === 'start') this.startDrag();
            else if (phase === 'end') this.endDrag();
        });
        // Плашка поменяла размер: в режиме совместимости окно обрезается по ней, в CSS-пикселях до масштаба
        ipcMain.on('island:shape', (event, rect: unknown) => {
            if (!this.owns(event.sender) || !rect || typeof rect !== 'object') return;
            const { x, y, width, height, radius } = rect as Record<string, unknown>;
            if (![x, y, width, height, radius].every((n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 5000)) return;
            const zoom = ISLAND_SCALE[this.settings.size];
            const scaled = { x: (x as number) * zoom, y: (y as number) * zoom, width: (width as number) * zoom, height: (height as number) * zoom };
            this.shapeRect = scaled;
            if (this.deps.shaped) this.window!.setShape(roundedShape(scaled, (radius as number) * zoom));
        });
        ipcMain.handle('island:volume', (event, value: unknown) => {
            if (!this.owns(event.sender)) return -1;
            const next = value === 'mute' ? 'mute' : typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : undefined;
            return this.deps.volume(next);
        });
        ipcMain.handle('island:state', (event) => (this.owns(event.sender) ? this.state() : null));
        ipcMain.on('island:hover', (event, inside: unknown) => {
            if (!this.owns(event.sender)) return;
            if (inside === 'ghost') return this.startGhost();
            if (this.deps.shaped) {
                if (inside !== true) this.raise();
                return;
            }
            // Над плашкой окно ловит мышь, вне её пропускает насквозь, но продолжает слышать движение
            if (inside === true) this.window!.setIgnoreMouseEvents(false);
            else {
                this.window!.setIgnoreMouseEvents(true, { forward: true });
                this.raise();
            }
        });
        ipcMain.on('island:act', (event, act: unknown) => {
            if (!this.owns(event.sender) || typeof act !== 'string') return;
            switch (act) {
                case 'toggle': case 'next': case 'previous': case 'like':
                    this.deps.command(act);
                    return;
                case 'open': this.deps.open(); return;
                case 'menu': this.menu(); return;
                case 'hide': this.hideUntilNext(); return;
                case 'ready':
                    this.ready = true;
                    this.push();
                    return;
            }
        });
        screen.on('display-metrics-changed', this.onDisplays);
        screen.on('display-added', this.onDisplays);
        screen.on('display-removed', this.onDisplays);
        this.watchMain();
        this.refresh();
    }

    private owns(sender: Electron.WebContents): boolean {
        return !!this.window && !this.window.isDestroyed() && sender === this.window.webContents;
    }

    private state(): object {
        const track = this.deps.track();
        return {
            track: { title: track.title, author: track.author, artwork: track.artwork, isPlaying: track.isPlaying, isLiked: track.isLiked, elapsed: track.elapsed, duration: track.duration },
            settings: { position: this.settings.position, look: this.settings.look, color: this.settings.color, color2: this.settings.color2, expandOnHover: this.settings.expandOnHover, showTitle: this.settings.showTitle, layout: this.settings.layout },
            shaped: this.deps.shaped,
            winter: this.deps.winter(),
            reduceMotion: this.deps.reduceMotion(),
            language: this.deps.language(),
        };
    }

    /** Окно клиента меняется при пересоздании: слушать фокус и перемещение нового */
    public watchMain(): void {
        const main = this.deps.mainWindow();
        if (main === this.watched) return;
        if (this.watched && !this.watched.isDestroyed()) {
            this.watched.off('focus', this.onMainFocus);
            this.watched.off('blur', this.onMainBlur);
            this.watched.off('moved', this.onMainMoved);
        }
        this.watched = main;
        if (!main || main.isDestroyed()) return;
        main.on('focus', this.onMainFocus);
        main.on('blur', this.onMainBlur);
        main.on('moved', this.onMainMoved);
        this.appFocused = main.isFocused();
    }

    public configure(settings: IslandSettings): void {
        const resized = settings.size !== this.settings.size;
        // Размер окна зависит и от вида: с большой обложкой раскрытая плашка выше
        this.settings = settings;
        if (resized && this.window && !this.window.isDestroyed()) this.window.webContents.setZoomFactor(ISLAND_SCALE[settings.size]);
        this.place();
        this.refresh();
        this.push();
    }

    /** Трек, пауза, лайк или прогресс поменялись */
    public update(): void {
        const track = this.deps.track();
        const key = track.url || track.title + '\n' + track.author;
        const changed = key !== this.trackKey;
        this.trackKey = key;
        if (this.snoozedFor && this.snoozedFor !== this.snoozeKey()) this.snoozedFor = '';
        if (track.isPlaying || !track.title) this.pausedSince = 0;
        else if (!this.pausedSince) this.pausedSince = Date.now();
        this.armPauseTimer();
        this.refresh();
        this.push();
        if (changed && track.title && this.settings.announceTrack && this.window?.isVisible()) this.send('island:announce');
    }

    /** Тема, язык или меньше анимаций поменялись */
    public push(): void {
        if (this.ready) this.send('island:state', this.state());
    }

    private send(channel: string, ...args: unknown[]): void {
        if (this.window && !this.window.isDestroyed()) this.window.webContents.send(channel, ...args);
    }

    private armPauseTimer(): void {
        if (this.pauseTimer) clearTimeout(this.pauseTimer);
        this.pauseTimer = null;
        if (!this.pausedSince || !this.settings.hideWhenPaused) return;
        const left = this.pausedSince + PAUSE_HIDE_MS - Date.now();
        if (left > 0) this.pauseTimer = setTimeout(() => this.refresh(), left + 50);
    }

    /** Должна ли плашка быть на экране без учёта полноэкранных окон */
    private wanted(): boolean {
        const track = this.deps.track();
        if (!this.settings.enabled || this.disposed || !track.title) return false;
        if (this.snoozedFor && this.snoozedFor === this.snoozeKey()) return false;
        if (this.settings.hideInApp && this.appFocused) return false;
        if (this.settings.hideWhenPaused && this.pausedSince && Date.now() - this.pausedSince >= PAUSE_HIDE_MS) return false;
        return true;
    }

    private refresh(): void {
        const wanted = this.wanted();
        this.setPolling(wanted && this.settings.hideFullscreen && !this.bridgeBroken);
        const show = wanted && !(this.settings.hideFullscreen && this.fullscreen);
        if (!show) {
            if (this.window && !this.window.isDestroyed() && this.window.isVisible()) this.window.hide();
            return;
        }
        if (!this.window || this.window.isDestroyed()) {
            try {
                this.window = this.create();
            } catch (error) {
                console.error('Остров не создался:', error);
                return;
            }
        }
        if (!this.window.isVisible()) {
            this.place();
            this.window.showInactive();
            this.raise();
        }
    }

    /** Выше панели задач и обычных окон «поверх всех»: Windows иногда сбрасывает это, поэтому и на каждой проверке */
    private raise(): void {
        if (!this.window || this.window.isDestroyed() || !this.window.isVisible()) return;
        // Пока открыто меню, остров не лезет поверх него: иначе он закрывал угол меню и первые пункты
        if (this.menuWindow && !this.menuWindow.isDestroyed()) return;
        this.window.setAlwaysOnTop(true, 'screen-saver');
        this.window.moveTop();
    }

    private setPolling(on: boolean): void {
        if (on && !this.poll) {
            this.poll = setInterval(() => void this.checkFullscreen(), FULLSCREEN_POLL_MS);
            void this.checkFullscreen();
        } else if (!on && this.poll) {
            clearInterval(this.poll);
            this.poll = null;
            this.fullscreen = false;
        }
    }

    private async checkFullscreen(): Promise<void> {
        if (this.bridgeBroken) return;
        try {
            this.bridge ??= await loadFullscreenBridge();
            const bridge = this.bridge;
            const read = (): boolean => {
                const own = this.window && !this.window.isDestroyed() ? this.window.getNativeWindowHandle() : null;
                const hwnd = own ? Number(own.length >= 8 ? own.readBigUInt64LE(0) : own.readUInt32LE(0)) : 0;
                return coversIsland(bridge.foreground(), hwnd ? bridge.monitorOf(hwnd) : 0);
            };
            let covered = read();
            // Сворачивание и переключение окон на миг даёт «полный экран»: прячем остров, только если оно не прошло за 350 мс
            if (covered && !this.fullscreen) {
                await new Promise((resolve) => setTimeout(resolve, FULLSCREEN_CONFIRM_MS));
                if (!this.poll) return;
                covered = read();
            }
            if (covered === this.fullscreen) {
                if (!covered) this.raise();
                return;
            }
            this.fullscreen = covered;
            this.refresh();
        } catch (error) {
            console.error('Остров не может проверять полноэкранные окна:', error);
            this.bridgeBroken = true;
            this.setPolling(false);
            this.refresh();
        }
    }

    /** Экран по умолчанию: основной или тот, где окно клиента */
    private display(): Display {
        const main = this.deps.mainWindow();
        if (this.settings.display === 'app' && main && !main.isDestroyed()) return screen.getDisplayMatching(main.getBounds());
        return screen.getPrimaryDisplay();
    }

    private screens(): IslandScreen[] {
        return screen.getAllDisplays().map(({ id, workArea }) => ({ id, workArea }));
    }

    private target(): Rectangle {
        const home = this.display();
        return placedBounds(this.screens(), { id: home.id, workArea: home.workArea }, this.settings).bounds;
    }

    private place(): void {
        if (!this.window || this.window.isDestroyed() || this.drag) return;
        this.window.setBounds(this.target());
    }

    private async loadBridge(): Promise<FullscreenBridge | null> {
        if (process.platform !== 'win32') return null;
        try {
            this.bridge ??= await loadFullscreenBridge();
            return this.bridge;
        } catch {
            return null;
        }
    }

    /** Курсор над плашкой: по прямоугольнику, который прислала страница */
    private cursorOnIsland(point: Electron.Point): boolean {
        if (!this.window || this.window.isDestroyed() || !this.shapeRect) return false;
        const bounds = this.window.getBounds();
        const r = this.shapeRect;
        return point.x >= bounds.x + r.x - 2 && point.x <= bounds.x + r.x + r.width + 2 && point.y >= bounds.y + r.y - 2 && point.y <= bounds.y + r.y + r.height + 2;
    }

    // «Сквозной» режим: курсор пролетает над свёрнутой плашкой (к вкладкам браузера, к кнопкам окна под ней) —
    // плашка бледнеет и клики проходят насквозь. Остановил курсор на GHOST_WAKE_MS — она становится обычной и раскрывается
    private startGhost(): void {
        if (this.ghost || this.drag || !this.window || this.window.isDestroyed()) return;
        const window = this.window;
        window.setIgnoreMouseEvents(true, { forward: true });
        window.setOpacity(GHOST_OPACITY);
        let last = screen.getCursorScreenPoint();
        let since = Date.now();
        this.ghost = setInterval(() => {
            if (window.isDestroyed()) return this.stopGhost(false);
            const point = screen.getCursorScreenPoint();
            if (!this.cursorOnIsland(point)) return this.stopGhost(false);
            if (Math.hypot(point.x - last.x, point.y - last.y) > 3) {
                last = point;
                since = Date.now();
            } else if (Date.now() - since >= GHOST_WAKE_MS) this.stopGhost(true);
        }, GHOST_STEP_MS);
    }

    private stopGhost(wake: boolean): void {
        if (!this.ghost) return;
        clearInterval(this.ghost);
        this.ghost = null;
        if (!this.window || this.window.isDestroyed()) return;
        this.window.setOpacity(1);
        if (wake || this.deps.shaped) this.window.setIgnoreMouseEvents(false);
        else this.window.setIgnoreMouseEvents(true, { forward: true });
        this.send(wake ? 'island:wake' : 'island:sleep');
        if (!wake) this.raise();
    }

    // Нажатие: кнопку мыши main проверяет сам (GetAsyncKeyState). Сдвиг на 5 px начинает перетаскивание, отпускание
    // заканчивает его, даже если страница не получила ни движения, ни отпускания (курсор ушёл за обрезанное окно)
    private press(): void {
        if (this.pressPoll || this.drag) return;
        const from = screen.getCursorScreenPoint();
        void this.loadBridge().then((bridge) => {
            if (!bridge || this.pressPoll || this.disposed) return;
            this.pressPoll = setInterval(() => {
                let down: boolean;
                try {
                    down = bridge.primaryButtonDown();
                } catch {
                    down = false;
                }
                if (!down) {
                    this.stopPress();
                    if (this.drag) {
                        this.endDrag();
                        this.send('island:drag-state', false);
                    }
                    return;
                }
                if (this.drag) return;
                const point = screen.getCursorScreenPoint();
                if (Math.hypot(point.x - from.x, point.y - from.y) >= 5) {
                    this.startDrag(from);
                    this.send('island:drag-state', true);
                }
            }, DRAG_STEP_MS);
        });
    }

    private stopPress(): void {
        if (this.pressPoll) clearInterval(this.pressPoll);
        this.pressPoll = null;
    }

    // Перетаскивание: окно идёт за курсором, пока не отпустят кнопку
    private startDrag(fromCursor?: Electron.Point): void {
        if (!this.window || this.window.isDestroyed() || this.drag) return;
        this.stopGhost(false);
        const window = this.window;
        const drag = { until: Date.now() + DRAG_LIMIT_MS, cursor: fromCursor ?? screen.getCursorScreenPoint(), from: window.getBounds(), timer: setInterval(() => {
            if (window.isDestroyed() || Date.now() > drag.until) return this.endDrag();
            const cursor = screen.getCursorScreenPoint();
            // setBounds с прежним размером: setPosition на Windows с масштабом экрана может менять размер окна
            window.setBounds({ x: Math.round(drag.from.x + cursor.x - drag.cursor.x), y: Math.round(drag.from.y + cursor.y - drag.cursor.y), width: drag.from.width, height: drag.from.height });
        }, DRAG_STEP_MS) };
        this.drag = drag;
    }

    private endDrag(): void {
        const drag = this.drag;
        if (!drag) return;
        clearInterval(drag.timer);
        this.drag = null;
        if (!this.window || this.window.isDestroyed()) return;
        const bounds = this.window.getBounds();
        const drop = screen.getDisplayMatching(bounds);
        const home = this.display();
        const place = dropPlace({ id: drop.id, workArea: drop.workArea }, bounds, { id: home.id, workArea: home.workArea }, this.settings);
        this.settings = { ...this.settings, place };
        this.deps.save(this.settings);
        this.place();
    }

    /** «Вернуть на место»: из меню плашки и из F1 */
    public resetPlace(): void {
        if (!this.settings.place) return;
        this.settings = { ...this.settings, place: null };
        this.deps.save(this.settings);
        this.place();
    }

    private create(): BrowserWindow {
        const shaped = this.deps.shaped;
        const window = new BrowserWindow({
            ...this.target(),
            frame: false,
            transparent: !shaped,
            backgroundColor: shaped ? '#000000' : '#00000000',
            hasShadow: false,
            // Без рамки Windows: нет тени и анимации окна; toolbar не попадает в Alt+Tab
            thickFrame: false,
            type: 'toolbar',
            resizable: false,
            movable: false,
            minimizable: false,
            maximizable: false,
            fullscreenable: false,
            focusable: false,
            skipTaskbar: true,
            alwaysOnTop: true,
            show: false,
            webPreferences: { preload: join(__dirname, 'islandPreload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false, backgroundThrottling: false },
        });
        // Обрезанное окно до первого размера плашки — одна точка: иначе на миг мелькнул бы чёрный прямоугольник
        if (shaped) window.setShape([{ x: 0, y: 0, width: 1, height: 1 }]);
        else window.setIgnoreMouseEvents(true, { forward: true });
        window.setVisibleOnAllWorkspaces(true);
        trustLocalFile(window.webContents, join(__dirname, 'island.html'));
        window.webContents.on('did-finish-load', () => window.webContents.setZoomFactor(ISLAND_SCALE[this.settings.size]));
        void window.loadFile(join(__dirname, 'island.html')).catch((error: unknown) => console.error('Остров не открылся:', error));
        this.ready = false;
        window.on('closed', () => {
            if (this.window === window) this.window = null;
            this.ready = false;
        });
        return window;
    }

    /** По названию и автору, а не по ссылке: она у трека может появиться позже и «сбросить» скрытие */
    private snoozeKey(): string {
        const track = this.deps.track();
        return track.title + '\n' + track.author;
    }

    /** «Скрыть до следующего трека»: из меню и из кнопки на плашке */
    private hideUntilNext(): void {
        this.snoozedFor = this.snoozeKey();
        this.refresh();
    }

    private menuItems(): MenuEntry[] {
        const en = this.deps.language() === 'en';
        const track = this.deps.track();
        const playing = track.isPlaying === true;
        // Порядок как на плашке: управление треком, затем сам трек и плашка, затем настройки, в конце выключение
        return [
            { id: 'toggle', icon: playing ? 'pause' : 'play', label: playing ? (en ? 'Pause' : 'Пауза') : (en ? 'Play' : 'Играть') },
            { id: 'previous', label: en ? 'Previous track' : 'Предыдущий трек' },
            { id: 'next', label: en ? 'Next track' : 'Следующий трек' },
            { id: 'like', icon: track.isLiked ? 'liked' : 'like', label: track.isLiked ? (en ? 'Remove like' : 'Убрать лайк') : (en ? 'Like' : 'Нравится') },
            { separator: true },
            { id: 'open', label: en ? 'Open SoundCloud 2' : 'Открыть SoundCloud 2' },
            { id: 'copy', label: en ? 'Copy track link' : 'Копировать ссылку', disabled: !track.url },
            { id: 'hide', label: en ? 'Hide until next track' : 'Скрыть до следующего трека' },
            ...(this.settings.place ? [{ id: 'reset', label: en ? 'Move back to default spot' : 'Вернуть на место' }] : []),
            { separator: true },
            { id: 'cover', label: en ? 'Big cover' : 'Большая обложка', checked: this.settings.layout === 'cover' },
            { id: 'fullscreen', label: en ? 'Hide in games' : 'Прятать в играх', checked: this.settings.hideFullscreen },
            { id: 'settings', label: en ? 'Island settings…' : 'Настроить остров…' },
            { separator: true },
            { id: 'off', label: en ? 'Turn off island' : 'Выключить остров', danger: true },
        ];
    }

    private runMenu(id: string): void {
        switch (id) {
            case 'toggle': case 'next': case 'previous': case 'like': this.deps.command(id); return;
            case 'open': this.deps.open(); return;
            case 'hide': this.hideUntilNext(); return;
            case 'reset': this.resetPlace(); return;
            case 'copy': {
                const url = this.deps.track().url;
                if (url) clipboard.writeText(url);
                return;
            }
            case 'cover':
                this.settings = { ...this.settings, layout: this.settings.layout === 'cover' ? 'classic' : 'cover' };
                this.deps.save(this.settings);
                this.place();
                this.push();
                return;
            case 'fullscreen':
                this.settings = { ...this.settings, hideFullscreen: !this.settings.hideFullscreen };
                this.deps.save(this.settings);
                this.refresh();
                return;
            case 'settings': this.deps.open('island'); return;
            case 'off':
                this.settings = { ...this.settings, enabled: false };
                this.deps.save(this.settings);
                this.refresh();
                return;
        }
    }

    private closeMenu(): void {
        const menu = this.menuWindow;
        this.menuWindow = null;
        // Уничтожать окно прямо в его же событии (blur) или в ответе на его IPC нельзя: Electron от этого падал вместе
        // с клиентом (правый клик по «⋯» открывал второе меню, пока первое закрывалось). Сначала спрятать, закрыть следующим тиком
        if (menu && !menu.isDestroyed()) {
            menu.hide();
            setTimeout(() => {
                if (!menu.isDestroyed()) menu.close();
            }, 0);
        }
        // Окно меню забирало верх: после него остров вставал под окна
        setTimeout(() => this.raise(), 50);
    }

    /** Своё тёмное меню вместо системного (оно стеклянное и не в тон): отдельное окно у курсора, закрывается по потере фокуса */
    private menu(): void {
        if (!this.window || this.window.isDestroyed()) return;
        // Правый клик и клик по «⋯» почти одновременно: второе меню поверх первого не открываем
        if (Date.now() - this.menuOpenedAt < 350) return;
        this.menuOpenedAt = Date.now();
        this.closeMenu();
        const items = this.menuItems();
        const shaped = this.deps.shaped;
        const pad = shaped ? 0 : MENU_PAD;
        const width = MENU_WIDTH;
        const height = items.reduce((total, item) => total + ('separator' in item ? MENU_SEPARATOR : MENU_ROW), MENU_INSET * 2);
        const cursor = screen.getCursorScreenPoint();
        const area = screen.getDisplayNearestPoint(cursor).workArea;
        // Меню встаёт под плашкой, правым краем у курсора («⋯» справа), и не заходит на неё: раньше оно открывалось
        // прямо у курсора, и плашка ложилась поверх его угла. Под плашкой нет места — над ней
        const bounds = this.window.getBounds();
        const plate = this.shapeRect ? { top: bounds.y + this.shapeRect.y, bottom: bounds.y + this.shapeRect.y + this.shapeRect.height } : null;
        const gap = 8;
        const x = Math.round(Math.max(area.x, Math.min(cursor.x - width + 24, area.x + area.width - width)));
        let y = plate ? plate.bottom + gap : cursor.y + gap;
        if (y + height > area.y + area.height) y = (plate ? plate.top : cursor.y) - gap - height;
        y = Math.round(Math.max(area.y, y));
        const menu = new BrowserWindow({
            x: x - pad, y: y - pad, width: width + pad * 2, height: height + pad * 2,
            frame: false, transparent: !shaped, backgroundColor: shaped ? '#1c1c1e' : '#00000000', hasShadow: false, thickFrame: false,
            resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false, skipTaskbar: true, alwaysOnTop: true, show: false,
            webPreferences: { preload: join(__dirname, 'islandMenuPreload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false },
        });
        this.menuWindow = menu;
        menu.setAlwaysOnTop(true, 'screen-saver');
        if (shaped) menu.setShape(roundedShape({ x: 0, y: 0, width, height }, MENU_RADIUS));
        menu.webContents.setZoomFactor(1);
        ipcMain.removeHandler('island-menu:items');
        ipcMain.removeAllListeners('island-menu:pick');
        ipcMain.handle('island-menu:items', (event) => (this.menuWindow && event.sender === this.menuWindow.webContents ? { items, shaped } : null));
        ipcMain.on('island-menu:pick', (event, id: unknown) => {
            if (!this.menuWindow || event.sender !== this.menuWindow.webContents) return;
            this.closeMenu();
            if (typeof id === 'string') this.runMenu(id);
        });
        menu.once('ready-to-show', () => {
            if (!menu.isDestroyed()) menu.show();
        });
        menu.on('blur', () => {
            if (this.menuWindow === menu) this.closeMenu();
        });
        menu.on('closed', () => {
            if (this.menuWindow === menu) this.menuWindow = null;
        });
        trustLocalFile(menu.webContents, join(__dirname, 'islandMenu.html'));
        void menu.loadFile(join(__dirname, 'islandMenu.html')).catch((error: unknown) => console.error('Меню острова не открылось:', error));
    }

    public dispose(): void {
        this.disposed = true;
        if (this.drag) clearInterval(this.drag.timer);
        this.drag = null;
        ipcMain.removeAllListeners('island:drag');
        ipcMain.removeAllListeners('island:shape');
        ipcMain.removeAllListeners('island:seek');
        this.setPolling(false);
        this.stopPress();
        if (this.ghost) clearInterval(this.ghost);
        this.ghost = null;
        this.closeMenu();
        ipcMain.removeHandler('island-menu:items');
        ipcMain.removeAllListeners('island-menu:pick');
        if (this.pauseTimer) clearTimeout(this.pauseTimer);
        screen.off('display-metrics-changed', this.onDisplays);
        screen.off('display-added', this.onDisplays);
        screen.off('display-removed', this.onDisplays);
        if (this.watched && !this.watched.isDestroyed()) {
            this.watched.off('focus', this.onMainFocus);
            this.watched.off('blur', this.onMainBlur);
            this.watched.off('moved', this.onMainMoved);
        }
        ipcMain.removeHandler('island:state');
        ipcMain.removeAllListeners('island:act');
        ipcMain.removeAllListeners('island:hover');
        ipcMain.removeHandler('island:volume');
        if (this.window && !this.window.isDestroyed()) this.window.destroy();
        this.window = null;
    }
}
