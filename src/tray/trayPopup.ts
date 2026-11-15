// Меню трея SoundCloud 2: вместо системного меню Windows своё стеклянное окошко у значка. Сейчас играет (обложка,
// трек, управление, лайк), «Открыть», «Оформление», «Настройки», «Инкогнито в Discord» и «Выход».
// Окно без рамки, прячется при потере фокуса; данные трека и команды идут через свой preload с узким набором каналов
import { BrowserWindow, ipcMain, screen, type Rectangle } from 'electron';
import { join } from 'path';
import { trustLocalFile } from '../trustedViews';
import type { TrackInfo } from '../types';

export interface TrayPopupDeps {
    track(): TrackInfo;
    incognito(): boolean;
    language(): 'ru' | 'en';
    command(name: 'toggle' | 'next' | 'previous' | 'like'): void;
    open(section?: '' | 'settings' | 'appearance'): void;
    setIncognito(value: boolean): void;
    quit(): void;
}

const WIDTH = 304;
const HEIGHT = 336;

export class TrayPopup {
    private window: BrowserWindow | null = null;
    private hiddenAt = 0;
    constructor(private deps: TrayPopupDeps) {
        ipcMain.removeHandler('tray-popup:state');
        ipcMain.removeAllListeners('tray-popup:act');
        ipcMain.handle('tray-popup:state', (event) => (this.owns(event.sender) ? this.state() : null));
        ipcMain.on('tray-popup:act', (event, act: unknown, value: unknown) => {
            if (!this.owns(event.sender) || typeof act !== 'string') return;
            switch (act) {
                case 'toggle': case 'next': case 'previous': case 'like':
                    this.deps.command(act);
                    setTimeout(() => this.push(), 350);
                    return;
                case 'open': this.hide(); this.deps.open(''); return;
                case 'appearance': this.hide(); this.deps.open('appearance'); return;
                case 'settings': this.hide(); this.deps.open('settings'); return;
                case 'incognito': this.deps.setIncognito(value === true); this.push(); return;
                case 'quit': this.hide(); this.deps.quit(); return;
                case 'close': this.hide(); return;
            }
        });
    }
    private owns(sender: Electron.WebContents): boolean {
        return !!this.window && !this.window.isDestroyed() && sender === this.window.webContents;
    }
    private state(): object {
        const track = this.deps.track();
        return { track: { title: track.title, author: track.author, artwork: track.artwork, isPlaying: track.isPlaying, isLiked: track.isLiked }, incognito: this.deps.incognito(), language: this.deps.language() };
    }
    /** Обновить показанное: трек сменился, лайк, пауза */
    public push(): void {
        if (this.window && !this.window.isDestroyed() && this.window.isVisible()) this.window.webContents.send('tray-popup:state', this.state());
    }
    private create(): BrowserWindow {
        const window = new BrowserWindow({
            width: WIDTH,
            height: HEIGHT,
            frame: false,
            transparent: true,
            resizable: false,
            movable: false,
            minimizable: false,
            maximizable: false,
            fullscreenable: false,
            skipTaskbar: true,
            alwaysOnTop: true,
            show: false,
            hasShadow: false,
            webPreferences: { preload: join(__dirname, 'trayPreload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false },
        });
        trustLocalFile(window.webContents, join(__dirname, 'tray.html'));
        void window.loadFile(join(__dirname, 'tray.html')).catch((error: unknown) => console.error('Меню трея не открылось:', error));
        window.on('blur', () => this.hide());
        window.on('closed', () => {
            this.window = null;
        });
        return window;
    }
    /** Показать у значка: над ним, если панель задач снизу, иначе под ним; повторный клик по значку прячет */
    public toggle(anchor: Rectangle): void {
        if (this.window?.isVisible()) return this.hide();
        // Клик по значку сразу после потери фокуса окном это тот же клик, которым окно закрылось
        if (Date.now() - this.hiddenAt < 250) return;
        this.window ??= this.create();
        const area = screen.getDisplayNearestPoint({ x: anchor.x, y: anchor.y }).workArea;
        const above = anchor.y > area.y + area.height / 2;
        const x = Math.round(Math.min(area.x + area.width - WIDTH - 8, Math.max(area.x + 8, anchor.x + anchor.width / 2 - WIDTH / 2)));
        const y = Math.round(above ? Math.max(area.y + 8, area.y + area.height - HEIGHT - 8) : area.y + 8);
        this.window.setBounds({ x, y, width: WIDTH, height: HEIGHT });
        this.window.webContents.send('tray-popup:state', this.state());
        this.window.show();
        this.window.focus();
    }
    public hide(): void {
        if (!this.window || this.window.isDestroyed() || !this.window.isVisible()) return;
        this.hiddenAt = Date.now();
        this.window.hide();
    }
    public dispose(): void {
        ipcMain.removeHandler('tray-popup:state');
        ipcMain.removeAllListeners('tray-popup:act');
        if (this.window && !this.window.isDestroyed()) this.window.destroy();
        this.window = null;
    }
}
