import { trustLocalFile } from '../trustedViews';
import { homeBlockDefaults } from '../services/homeBlocks';
import { DEFAULT_RADAR_SCHEDULE, systemTimeZone } from '../services/radarSchedule';
import { TEMPLATE_DEFAULTS } from '../services/presenceService';
import { WebContentsView, BrowserWindow, ipcMain, type IpcMainInvokeEvent, type WebContents } from 'electron';
import type ElectronStore from 'electron-store';
import { join } from 'path';
import type { GpuRuntimeState } from '../services/gpuProcessMode';
import type { SiteState } from '../services/siteModules';
import { normalizeAppearance } from '../services/aurora';
import { WINTER_KEY, winterEnabled } from '../services/wave/winter';
import { ISLAND_KEY, normalizeIsland } from '../island/islandSettings';

const defaults: Record<string, string | number | boolean> = {
    minimizeToTray: false,
    navigationControlsEnabled: false,
    trackParserEnabled: true,
    hidePromotions: true,
    hideEventsNearYou: true,
    hideArtistUpsells: true,
    hideHeaderExtras: true,
    fullShuffle: true,
    quietEdges: true,
    crossfade: true,
    crossfadeSeconds: 5,
    reduceMotion: false,
    effectsMode: 'full',
    waveNoRussian: false,
    vibeWeb: true,
    gpuCompatibilityMode: 'auto',
    siteLanguage: 'ru',
    ...homeBlockDefaults,
    radarDay: DEFAULT_RADAR_SCHEDULE.day,
    radarTime: DEFAULT_RADAR_SCHEDULE.time,
    adBlocker: true,
    proxyEnabled: false,
    proxyHost: '',
    proxyPort: '',
    proxyUsername: '',
    webhookEnabled: false,
    webhookUrl: '',
    jamServer: '',
    webhookTriggerPercentage: 50,
    discordRichPresence: true,
    displaySCSmallIcon: false,
    displayGithubLink: true,
    displayButtons: false,
    statusDisplayType: 1,
    richPresencePreviewEnabled: false,
    discordIncognito: false,
    discordHiddenArtists: '',
    discordHiddenGenres: '',
    ...TEMPLATE_DEFAULTS,
    autoUpdateEnabled: true,
};

export class SettingsManager {
    private view: WebContentsView | null = null;
    private disposed = false;
    /** Раздел, который показать при открытии: «Оформление» из шапки и трея */
    private section = '';
    /** Чего страница не нашла у поменявшегося сайта; null, пока всё на месте */
    private siteState: SiteState | null = null;
    private resize = (): void => this.updateBounds();
    private ready = (event: IpcMainInvokeEvent): void => {
        if (!this.owns(event)) return;
        const view = this.view!;
        if (view.webContents.isDestroyed()) return;
        view.webContents.send('update-translations');
        if (this.section) view.webContents.send('settings-section', this.section);
        this.section = '';
        view.setVisible(true);
        view.webContents.focus();
        void view.webContents.executeJavaScript("requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.add('visible')))").catch((error: unknown) => {
            if (this.view === view && !view.webContents.isDestroyed()) console.error('Не удалось показать настройки:', error);
        });
    };

    constructor(
        private parentWindow: BrowserWindow,
        private store: ElectronStore,
        private restoreFocus: () => void = () => parentWindow.webContents.focus(),
        /** Горячие клавиши клиента внутри панели: Ctrl+H и другие работают и при открытых настройках */
        private attach: (contents: WebContents) => void = () => undefined,
        private beforeOpen: () => void = () => undefined,
        private gpuRuntime?: GpuRuntimeState,
    ) {
        this.parentWindow.on('resize', this.resize);
        this.parentWindow.once('closed', () => this.dispose());
        ipcMain.handle('get-settings-state', (event) => {
            if (!this.owns(event)) throw new Error('Недопустимый отправитель настроек');
            return {
                ...Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => [key, this.store.get(key, fallback)])),
                // Зону при первом запуске пишет перенос настроек; до него показывается зона системы
                radarZone: this.store.get('radarZone', systemTimeZone()),
                appearance: normalizeAppearance(this.store.get('appearance')),
                winterTheme: winterEnabled(this.store.get(WINTER_KEY), new Date()),
                island: normalizeIsland(this.store.get(ISLAND_KEY)),
                // Остров только на Windows и без режима совместимости NVIDIA
                islandAvailable: process.platform === 'win32' && this.gpuRuntime?.active !== true,
                gpuRuntime: this.gpuRuntime,
                siteState: this.siteState,
            };
        });
        ipcMain.on('settings-ready', this.ready);
    }
    public setSiteState(state: SiteState | null): void {
        this.siteState = state;
        const contents = this.view?.webContents;
        if (contents && !contents.isDestroyed()) contents.send('site-state-changed', state);
    }
    private owns(event: Pick<IpcMainInvokeEvent, 'sender' | 'senderFrame'>): boolean {
        return (
            this.view !== null && event.sender === this.view.webContents && event.senderFrame === event.sender.mainFrame
        );
    }
    /** section: открыть сразу на разделе; уже открытая панель с разделом переключается на него, а не закрывается */
    public toggle(section = ''): void {
        if (this.disposed) return;
        if (this.view) {
            if (section && !this.view.webContents.isDestroyed()) {
                this.view.webContents.send('settings-section', section);
                return;
            }
            this.teardownView();
            return;
        }
        this.section = section;
        this.beforeOpen();
        this.view = new WebContentsView({
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                sandbox: true,
                webSecurity: true,
                preload: join(__dirname, 'settingsPreload.js'),
                devTools: process.argv.includes('--dev'),
                spellcheck: false,
            },
        });
        this.view.setVisible(false);
        this.view.setBackgroundColor('#00000000');
        trustLocalFile(this.view.webContents, join(__dirname, 'settings.html'));
        this.attach(this.view.webContents);
        this.parentWindow.contentView.addChildView(this.view);
        this.updateBounds();
        void this.view.webContents
            .loadFile(join(__dirname, 'settings.html'))
            .catch((error: unknown) => console.error('Не удалось открыть настройки:', error));
    }
    private teardownView(): void {
        const view = this.view;
        this.view = null;
        if (!view) return;
        if (!this.parentWindow.isDestroyed()) this.parentWindow.contentView.removeChildView(view);
        if (!view.webContents.isDestroyed()) {
            view.webContents.once('destroyed', () => {
                if (!this.disposed && !this.view && !this.parentWindow.isDestroyed()) this.restoreFocus();
            });
            view.webContents.close();
        }
    }
    // Панель накрывает всю страницу под шапкой: затемнение и окно по центру рисует сама settings.html
    private updateBounds(): void {
        if (!this.view || this.parentWindow.isDestroyed()) return;
        const bounds = this.parentWindow.getContentBounds();
        this.view.setBounds({ x: 0, y: 32, width: bounds.width, height: Math.max(0, bounds.height - 32) });
    }
    public getView(): WebContentsView | null {
        return this.view;
    }
    public dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.teardownView();
        this.parentWindow.removeListener('resize', this.resize);
        ipcMain.removeHandler('get-settings-state');
        ipcMain.removeListener('settings-ready', this.ready);
    }
}
