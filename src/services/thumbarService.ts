import { app, type BrowserWindow, nativeImage, type ThumbarButton } from 'electron';
import { existsSync } from 'fs';
import type { TranslationService } from './translationService';
import type { PlaybackController } from './playbackController';
import { buildThumbarSpecs } from './thumbarButtons';
import { fallbackIconPng, findIconFile, iconDirectories, THUMBAR_ICON_NAMES } from './thumbarIcons';
import type { TrackInfo } from '../types';
import { formatClock, trackParts, trackSeconds } from '../utils/trackParser';

export class ThumbarService {
    private key = '';
    private state: { playing: boolean; liked: boolean } | null = null;
    private tooltip = '';
    private shownTooltip = '';
    private icons: Record<string, Electron.NativeImage>;
    private fallbackIcons = 0;
    private lastReport = '';
    private retry: ReturnType<typeof setTimeout> | undefined;
    private retries = 0;
    constructor(
        private translation: TranslationService,
        resources: string,
        private playback: PlaybackController,
        private report: (fields: { ok: boolean; buttons: number; reason: string; iconsMissing: number }) => void = () => undefined,
    ) {
        const directories = iconDirectories(resources, process.resourcesPath, safeAppPath(), __dirname);
        this.icons = Object.fromEntries(
            THUMBAR_ICON_NAMES.map((name) => {
                const file = findIconFile(name, directories, existsSync);
                let image = file ? nativeImage.createFromPath(file) : nativeImage.createEmpty();
                if (image.isEmpty()) {
                    // Файла нет или он не читается: рисуем иконку сами, иначе Windows молча не покажет кнопку
                    image = nativeImage.createFromBuffer(fallbackIconPng(name));
                    this.fallbackIcons++;
                }
                return [name, image];
            }),
        );
    }
    private say(ok: boolean, buttons: number, reason: string): void {
        const signature = [ok, buttons, reason].join(':');
        if (signature === this.lastReport) return;
        this.lastReport = signature;
        this.report({ ok, buttons, reason, iconsMissing: this.fallbackIcons });
    }
    // Кнопка на панели задач появляется не мгновенно после показа окна: неудачную установку повторяем несколько раз
    private scheduleRetry(window: BrowserWindow): void {
        if (this.retry || this.retries >= 5) return;
        this.retries++;
        this.retry = setTimeout(() => {
            this.retry = undefined;
            if (this.state && !window.isDestroyed()) this.updateThumbarButtons(window, this.state.playing, this.state.liked);
        }, 400 * this.retries);
        this.retry.unref?.();
    }
    public updateThumbarButtons(window: BrowserWindow, playing: boolean, liked: boolean): void {
        this.state = { playing, liked };
        // У спрятанного в трей окна нет кнопки на панели задач. Кнопки, поставленные в этот момент, Windows не сохранит,
        // а Electron сочтёт их добавленными и после показа будет только обновлять несуществующие.
        if (window.isDestroyed()) return;
        if (!window.isVisible()) {
            this.say(false, 0, 'thumbar-hidden');
            return;
        }
        const key = [window.id, playing, liked, this.translation.getLanguage()].join(':');
        if (key === this.key) return;
        const buttons: ThumbarButton[] = buildThumbarSpecs(playing, liked).map((spec) => ({
            icon: this.icons[spec.icon],
            tooltip: this.translation.translate(spec.tooltip),
            click: () => {
                void this.playback.execute(spec.command).catch(console.error);
            },
        }));
        let ok = false;
        let reason = 'thumbar-rejected';
        try {
            ok = window.setThumbarButtons(buttons);
        } catch (error) {
            reason = 'thumbar-exception';
            console.error('setThumbarButtons:', error);
        }
        if (ok) {
            this.key = key;
            this.retries = 0;
            this.say(true, buttons.length, this.fallbackIcons > 0 ? 'thumbar-icons-fallback' : 'thumbar-ok');
        } else {
            this.say(false, buttons.length, reason);
            this.scheduleRetry(window);
        }
    }
    // Заголовок окна Windows пишет над превью на панели задач и в Alt+Tab, подсказка всплывает при наведении на превью.
    // Без трека заголовок возвращается к названию приложения
    public updateTrack(window: BrowserWindow, track: TrackInfo, parse: boolean, appTitle: string): void {
        if (window.isDestroyed()) return;
        const parts = trackParts(track.title, track.author, parse);
        const title = !parts.track ? appTitle : parts.artist ? parts.track + ' - ' + parts.artist : parts.track;
        if (title !== window.getTitle()) window.setTitle(title);
        let tooltip = parts.track ? title : '';
        const { elapsed, duration } = trackSeconds(track.elapsed, track.duration);
        if (parts.track && duration > 0) {
            const time = this.translation.translate('thumbnailTime').replace('{elapsed}', formatClock(elapsed)).replace('{duration}', formatClock(duration));
            tooltip += '\n' + time;
        }
        this.tooltip = tooltip;
        // Спрятанному в трей окну подсказку не поставить: кнопки на панели нет. Её вернёт restore()
        if (tooltip === this.shownTooltip || !window.isVisible()) return;
        window.setThumbnailToolTip(tooltip);
        this.shownTooltip = tooltip;
    }
    // После hide() Electron забывает кнопки превью, при каждом показе окна их надо ставить заново
    public restore(window: BrowserWindow): void {
        this.retries = 0;
        this.key = '';
        if (this.state) this.updateThumbarButtons(window, this.state.playing, this.state.liked);
        // Кнопка на панели после показа новая, подсказки на ней нет
        this.shownTooltip = '';
        if (!this.tooltip || window.isDestroyed()) return;
        window.setThumbnailToolTip(this.tooltip);
        this.shownTooltip = this.tooltip;
    }
}

function safeAppPath(): string | undefined {
    try {
        return app.getAppPath();
    } catch {
        return undefined;
    }
}
