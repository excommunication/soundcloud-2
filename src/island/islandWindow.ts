// «Остров»: чёрная плашка сейчас играющего сверху экрана, как Dynamic Island у iPhone. Отдельное прозрачное окно поверх
// остальных, без фокуса и без значка на панели задач. Пустое место окна пропускает мышь насквозь, ловит её только сама
// плашка. Окно прячется, пока ничего не играет, пока впереди клиент, игра или видео во весь экран, и после долгой паузы.
// Плашку можно перетащить мышью на любое место любого экрана; рядом с местом по умолчанию она прилипает обратно.
// В режиме совместимости NVIDIA (GPU в главном процессе без DirectComposition) прозрачных окон нет: там окно
// непрозрачное и обрезано по форме плашки (shaped), что вне плашки — не окно, клики туда проходят сами
import { BrowserWindow, Menu, ipcMain, screen, type Display, type Rectangle } from 'electron';
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
    /** Показать клиент; section: открыть F1 на этом разделе */
    open(section?: 'island'): void;
    /** Окно клиента: для экрана «где клиент» и для «прятать, пока клиент впереди» */
    mainWindow(): BrowserWindow | null;
    /** Записать настройки, поменянные самим островом (выключение, новое место), и показать их в F1 */
    save(settings: IslandSettings): void;
    /** Окно без прозрачности, обрезанное по плашке: режим совместимости NVIDIA */
    shaped: boolean;
}

/** Как часто смотреть, нет ли впереди полноэкранного окна */
const FULLSCREEN_POLL_MS = 1500;
/** Шаг перетаскивания: окно идёт за курсором с частотой кадров */
const DRAG_STEP_MS = 16;
/** Отпускание потерялось (кнопку отпустили вне окна, пока оно не успело догнать): перетаскивание кончается само */
const DRAG_LIMIT_MS = 60_000;

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
        ipcMain.on('island:drag', (event, phase: unknown) => {
            if (!this.owns(event.sender)) return;
            if (phase === 'start') this.startDrag();
            else if (phase === 'end') this.endDrag();
        });
        // Плашка поменяла размер: в режиме совместимости окно обрезается по ней, в CSS-пикселях до масштаба
        ipcMain.on('island:shape', (event, rect: unknown) => {
            if (!this.owns(event.sender) || !this.deps.shaped || !rect || typeof rect !== 'object') return;
            const { x, y, width, height, radius } = rect as Record<string, unknown>;
            if (![x, y, width, height, radius].every((n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 5000)) return;
            const zoom = ISLAND_SCALE[this.settings.size];
            const scaled = { x: (x as number) * zoom, y: (y as number) * zoom, width: (width as number) * zoom, height: (height as number) * zoom };
            this.window!.setShape(roundedShape(scaled, (radius as number) * zoom));
        });
        ipcMain.handle('island:volume', (event, value: unknown) => {
            if (!this.owns(event.sender)) return -1;
            const next = value === 'mute' ? 'mute' : typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : undefined;
            return this.deps.volume(next);
        });
        ipcMain.handle('island:state', (event) => (this.owns(event.sender) ? this.state() : null));
        ipcMain.on('island:hover', (event, inside: unknown) => {
            if (!this.owns(event.sender) || this.deps.shaped) return;
            // Над плашкой окно ловит мышь, вне её пропускает насквозь, но продолжает слышать движение
            if (inside === true) this.window!.setIgnoreMouseEvents(false);
            else this.window!.setIgnoreMouseEvents(true, { forward: true });
        });
        ipcMain.on('island:act', (event, act: unknown) => {
            if (!this.owns(event.sender) || typeof act !== 'string') return;
            switch (act) {
                case 'toggle': case 'next': case 'previous': case 'like':
                    this.deps.command(act);
                    return;
                case 'open': this.deps.open(); return;
                case 'menu': this.menu(); return;
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
            settings: { position: this.settings.position, expandOnHover: this.settings.expandOnHover, showTitle: this.settings.showTitle },
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
        if (changed && this.snoozedFor && this.snoozedFor !== key) this.snoozedFor = '';
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
        if (this.snoozedFor && this.snoozedFor === this.trackKey) return false;
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
            const info = this.bridge.foreground();
            const own = this.window && !this.window.isDestroyed() ? this.window.getNativeWindowHandle() : null;
            const hwnd = own ? Number(own.length >= 8 ? own.readBigUInt64LE(0) : own.readUInt32LE(0)) : 0;
            const monitor = hwnd ? this.bridge.monitorOf(hwnd) : 0;
            const covered = coversIsland(info, monitor);
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

    // Перетаскивание: окно идёт за курсором, пока страница не скажет, что кнопку отпустили
    private startDrag(): void {
        if (!this.window || this.window.isDestroyed() || this.drag) return;
        const window = this.window;
        const drag = { until: Date.now() + DRAG_LIMIT_MS, cursor: screen.getCursorScreenPoint(), from: window.getBounds(), timer: setInterval(() => {
            if (window.isDestroyed() || Date.now() > drag.until) return this.endDrag();
            const cursor = screen.getCursorScreenPoint();
            window.setPosition(Math.round(drag.from.x + cursor.x - drag.cursor.x), Math.round(drag.from.y + cursor.y - drag.cursor.y));
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

    private menu(): void {
        if (!this.window || this.window.isDestroyed()) return;
        const en = this.deps.language() === 'en';
        Menu.buildFromTemplate([
            { label: en ? 'Open SoundCloud 2' : 'Открыть SoundCloud 2', click: () => this.deps.open() },
            { label: en ? 'Hide until next track' : 'Скрыть до следующего трека', click: () => {
                this.snoozedFor = this.trackKey;
                this.refresh();
            } },
            ...(this.settings.place ? [{ label: en ? 'Move back to default spot' : 'Вернуть на место', click: () => this.resetPlace() }] : []),
            { label: en ? 'Island settings…' : 'Настроить остров…', click: () => this.deps.open('island') },
            { type: 'separator' },
            { label: en ? 'Turn off island' : 'Выключить остров', click: () => {
                this.settings = { ...this.settings, enabled: false };
                this.deps.save(this.settings);
                this.refresh();
            } },
        ]).popup({ window: this.window });
    }

    public dispose(): void {
        this.disposed = true;
        if (this.drag) clearInterval(this.drag.timer);
        this.drag = null;
        ipcMain.removeAllListeners('island:drag');
        ipcMain.removeAllListeners('island:shape');
        this.setPolling(false);
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
