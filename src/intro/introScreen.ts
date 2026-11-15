import { WebContentsView, type BrowserWindow } from 'electron';
import { join } from 'path';
import { trustLocalFile } from '../trustedViews';

/** Самая короткая заставка: сборка логотипа должна успеть доиграть */
export const INTRO_MIN_MS = 1500;
/** Сайт так и не загрузился: заставка уходит сама */
export const INTRO_MAX_MS = 9000;
/** Сколько идёт бросок, взрыв и раскрытие клиента */
export const INTRO_OUT_MS = 1700;

// Заставка поверх всего окна при запуске (шапка тоже под ней): логотип собирается, пока грузится сайт, потом его
// подбрасывает, он взрывается и круг взрыва открывает клиент
export class IntroScreen {
    private view: WebContentsView | null;
    private readonly started = Date.now();
    private leaving = false;
    private loaded = false;
    private pendingGo = false;
    private readonly resize = (): void => this.layout();
    private readonly safety: NodeJS.Timeout;

    constructor(private window: BrowserWindow) {
        const view = new WebContentsView({
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                sandbox: true,
                webSecurity: true,
                devTools: process.argv.includes('--dev'),
                spellcheck: false,
            },
        });
        view.setBackgroundColor('#00000000');
        const file = join(__dirname, 'intro.html');
        trustLocalFile(view.webContents, file);
        view.webContents.on('did-finish-load', () => {
            if (this.view !== view) return;
            this.loaded = true;
            if (this.pendingGo) this.play();
        });
        window.contentView.addChildView(view);
        window.on('resize', this.resize);
        this.view = view;
        this.layout();
        void view.webContents.loadFile(file).catch((error: unknown) => {
            console.error('Заставка не открылась:', error);
            this.close();
        });
        this.safety = setTimeout(() => this.finish(), INTRO_MAX_MS);
    }
    /** Заставка снова сверху: виды, добавленные после неё, иначе легли бы поверх */
    public raise(): void {
        if (!this.view || this.window.isDestroyed() || this.view.webContents.isDestroyed()) return;
        this.window.contentView.addChildView(this.view);
        this.layout();
    }
    public layout(): void {
        if (!this.view || this.window.isDestroyed() || this.view.webContents.isDestroyed()) return;
        const { width, height } = this.window.getContentBounds();
        this.view.setBounds({ x: 0, y: 0, width, height });
    }
    /** Сайт готов: заставка доигрывает сборку и уходит взрывом */
    public finish(): void {
        if (this.leaving || !this.view) return;
        this.leaving = true;
        clearTimeout(this.safety);
        const wait = Math.max(0, INTRO_MIN_MS - (Date.now() - this.started));
        setTimeout(() => {
            if (this.loaded) this.play();
            else this.pendingGo = true;
        }, wait);
    }
    private play(): void {
        const view = this.view;
        if (!view || view.webContents.isDestroyed()) return this.close();
        this.raise();
        void view.webContents.executeJavaScript('window.introGo && window.introGo()').catch(() => undefined);
        setTimeout(() => this.close(), INTRO_OUT_MS);
    }
    public close(): void {
        clearTimeout(this.safety);
        const view = this.view;
        this.view = null;
        if (!view) return;
        if (!this.window.isDestroyed()) {
            this.window.removeListener('resize', this.resize);
            this.window.contentView.removeChildView(view);
        }
        if (!view.webContents.isDestroyed()) view.webContents.close();
    }
}
