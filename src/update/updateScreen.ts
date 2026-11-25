import { WebContentsView, type BrowserWindow } from 'electron';
import { join } from 'path';
import { trustLocalFile } from '../trustedViews';

export interface UpdateScreenState {
    title: string;
    status: string;
    /** 0-100 */
    percent: number;
    later: string;
    installing: boolean;
    /** Подпись главной кнопки; пусто, если её нет */
    action?: string;
    /** Идёт проверка: кольцо крутится без процентов */
    busy?: boolean;
    /** Состояние без прогресса (последняя версия, ошибка): полоса скрыта */
    done?: boolean;
}

/** Карточка обновления с полями под тень: ширина, высота, отступ от правого края и от низа (над нижним плеером) */
export const UPDATE_CARD = { width: 380, height: 150, right: 8, bottom: 58 };

/** Место карточки обновления в окне: правый нижний угол над плеером; в узком или низком окне — сколько поместится под шапкой */
export function updateCardBounds(width: number, height: number, top: number): { x: number; y: number; width: number; height: number } {
    const cardWidth = Math.max(0, Math.min(UPDATE_CARD.width, width - UPDATE_CARD.right * 2));
    const cardHeight = Math.max(0, Math.min(UPDATE_CARD.height, height - top));
    return {
        x: Math.max(0, width - cardWidth - UPDATE_CARD.right),
        y: Math.max(top, height - cardHeight - UPDATE_CARD.bottom),
        width: cardWidth,
        height: cardHeight,
    };
}

// Окно обновления (2.13.3): компактная карточка в правом нижнем углу поверх страницы, а не экран на всё окно
export class UpdateScreen {
    private view: WebContentsView | null;
    private state: UpdateScreenState | null = null;
    private loaded = false;
    private resize = (): void => this.layout();

    constructor(private window: BrowserWindow, private top: number) {
        const view = new WebContentsView({
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                sandbox: true,
                webSecurity: true,
                preload: join(__dirname, 'updatePreload.js'),
                devTools: process.argv.includes('--dev'),
                spellcheck: false,
            },
        });
        view.setBackgroundColor('#00000000');
        const file = join(__dirname, 'update.html');
        trustLocalFile(view.webContents, file);
        view.webContents.on('did-finish-load', () => {
            this.loaded = true;
            this.push();
            // Карточка в углу не забирает фокус: страница под ней остаётся в работе
        });
        window.contentView.addChildView(view);
        window.on('resize', this.resize);
        this.view = view;
        this.layout();
        void view.webContents.loadFile(file).catch((error: unknown) => console.error('Не удалось открыть экран обновления:', error));
    }
    public owns(sender: Electron.WebContents): boolean {
        return this.view !== null && this.view.webContents === sender;
    }
    public show(state: UpdateScreenState): void {
        this.state = state;
        this.push();
    }
    public layout(): void {
        if (!this.view || this.window.isDestroyed()) return;
        const { width, height } = this.window.getContentBounds();
        this.view.setBounds(updateCardBounds(width, height, this.top));
    }
    public close(): void {
        const view = this.view;
        this.view = null;
        if (!view) return;
        if (!this.window.isDestroyed()) {
            this.window.removeListener('resize', this.resize);
            this.window.contentView.removeChildView(view);
        }
        if (!view.webContents.isDestroyed()) view.webContents.close();
    }
    private push(): void {
        if (!this.loaded || !this.state || !this.view || this.view.webContents.isDestroyed()) return;
        this.view.webContents.send('update-screen-state', this.state);
    }
}
