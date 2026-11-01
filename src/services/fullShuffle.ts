import * as siteModules from './siteModules';
import type { WebpackRequire } from './siteModules';

// Функции уходят на страницу текстом: поиск модулей берётся по голому имени, на странице его объявление лежит рядом
const { siteRequires } = siteModules;

interface QueueItem {
    explicit?: boolean;
    sound?: { isPlayable?(): boolean };
    clone?(changes: object): QueueItem;
    release?(): void;
}
interface PlayQueue {
    readonly length: number;
    slice(start?: number, end?: number): QueueItem[];
    reset(items: QueueItem[]): void;
}
interface PlayManager {
    getQueue(): PlayQueue;
    getQueueState(): { currentIndex: number };
    getState(name: string): boolean;
    hasMoreAhead(): boolean;
    hasFallback(): boolean;
    pullNext(count: number): void;
    on(event: string, callback: (value?: unknown) => void): unknown;
    off(event: string, callback: (value?: unknown) => void): unknown;
}
// Методы запуска списка нужны только для обхода повторной загрузки, без них перемешивание работает как раньше
interface SourcePlayer extends PlayManager {
    playSource(...args: unknown[]): unknown;
    isSourceActive(source: unknown): boolean;
    setCurrentItem(item: QueueItem, options?: unknown): void;
    toggleState?(name: string, value: boolean): unknown;
}
interface ShuffleWindow extends Window {
    __disposeFullShuffle?: () => void;
    __scSiteTranslation?: { language?: string };
}

export interface ShuffleTexts {
    tooMany: string;
    stalled: string;
    loading: string;
    unsupported: string;
}

// Подсказки стоят на странице сайта и говорят на его языке, как «Моя волна»
export const SHUFFLE_TEXTS: Record<'ru' | 'en', ShuffleTexts> = {
    ru: {
        tooMany: 'В очереди больше {max} треков, перемешаны первые {count}',
        stalled: 'Сайт перестал отдавать треки, перемешаны загруженные: {count}',
        loading: 'Загружаю очередь для перемешивания: {count}',
        unsupported: 'Перемешивание всей очереди не работает с этой версией SoundCloud',
    },
    en: {
        tooMany: 'The queue has more than {max} tracks, the first {count} are shuffled',
        stalled: 'The site stopped sending tracks, shuffled the loaded ones: {count}',
        loading: 'Loading the queue to shuffle: {count}',
        unsupported: 'Whole-queue shuffle doesn’t work with this SoundCloud version',
    },
};

// SoundCloud перемешивает только загруженную часть очереди, а остальное берёт из буфера на сто треков вперёд.
// Здесь очередь догружается целиком и всё, что после текущего трека, перемешивается заново.
export function installFullShuffle(enabled: boolean, texts: Record<'ru' | 'en', ShuffleTexts>): void {
    const host = window as unknown as ShuffleWindow & Record<string, unknown>;
    host.__disposeFullShuffle?.();
    if (!enabled) return;
    const T = texts[host.__scSiteTranslation?.language === 'ru' ? 'ru' : 'en'];
    const fill = (template: string, values: Record<string, number>): string => template.replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? ''));

    const PULL_SIZE = 250;
    const MAX_TRACKS = 10000;
    const STALL_MS = 15000;
    const methods = ['getQueue', 'getQueueState', 'getState', 'hasMoreAhead', 'hasFallback', 'pullNext', 'toggleShuffle', 'on', 'off'];
    let manager: PlayManager | null = null;
    let resetEvent = 'queueReset';
    let run = 0;
    // Очередь догружена до конца источника: клик по другому треку того же списка грузить её заново не должен
    let loaded = false;
    let restorePlaySource: (() => void) | undefined;
    let disposed = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    let status: HTMLDivElement | null = null;

    const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

    function findRequire(): WebpackRequire[] {
        return siteRequires(host, '__fullShuffle');
    }

    function findManager(): PlayManager | null {
        for (const require of findRequire()) {
            let candidate: PlayManager | null = null;
            for (const entry of Object.values(require.c ?? {})) {
                const exports = entry?.exports as Record<string, unknown> | undefined;
                if (!exports || typeof exports !== 'object') continue;
                if (typeof exports.QUEUE_RESET === 'string') resetEvent = exports.QUEUE_RESET;
                if (!candidate && methods.every((name) => typeof exports[name] === 'function')) candidate = exports as unknown as PlayManager;
            }
            if (candidate) return candidate;
        }
        return null;
    }

    function showStatus(text: string, hideAfter?: number): void {
        if (hideTimer !== undefined) clearTimeout(hideTimer);
        hideTimer = undefined;
        if (!status) {
            status = document.createElement('div');
            status.setAttribute('role', 'status');
            status.style.cssText =
                'position:fixed;z-index:2147483000;transform:translateX(-50%);padding:6px 10px;border-radius:6px;font-family:inherit;font-size:12px;line-height:1.4;' +
                'pointer-events:none;white-space:nowrap;box-shadow:0 4px 12px rgba(0,0,0,.3);transition:opacity .15s;opacity:0';
            document.body.appendChild(status);
        }
        status.style.background = '#2a2a2a';
        status.style.color = 'rgba(255,255,255,.87)';
        status.style.border = '1px solid rgba(255,255,255,.08)';
        const button = document.querySelector('.shuffleControl');
        const rect = button?.getBoundingClientRect();
        status.style.left = (rect && rect.width ? rect.left + rect.width / 2 : window.innerWidth / 2) + 'px';
        status.style.bottom = (rect && rect.width ? window.innerHeight - rect.top + 8 : 64) + 'px';
        status.textContent = text;
        status.style.opacity = '1';
        if (hideAfter) hideTimer = setTimeout(hideStatus, hideAfter);
    }
    function hideStatus(): void {
        if (hideTimer !== undefined) clearTimeout(hideTimer);
        hideTimer = undefined;
        status?.remove();
        status = null;
    }

    function reshuffleAhead(player: PlayManager): void {
        const queue = player.getQueue();
        const items = queue.slice();
        // Треки, добавленные вручную в «Далее», остаются сразу после текущего
        let start = player.getQueueState().currentIndex + 1;
        while (start < items.length && items[start]?.explicit) start++;
        const rest = items.slice(start);
        for (let i = rest.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [rest[i], rest[j]] = [rest[j], rest[i]];
        }
        queue.reset(items.slice(0, start).concat(rest));
    }

    function shouldLoad(player: PlayManager): boolean {
        // hasFallback во время живого потока значит автовоспроизведение похожих треков, оно бесконечное
        return player.getState('shuffle') && player.hasMoreAhead() && !player.hasFallback();
    }

    async function fillAndShuffle(): Promise<void> {
        const player = manager;
        const current = ++run;
        if (!player || !shouldLoad(player)) return;
        const queue = player.getQueue();
        // Новая очередь сначала ставит текущий трек, догрузка до этого сбила бы выбор трека
        for (let i = 0; i < 50 && player.getQueueState().currentIndex < 0; i++) await wait(200);
        if (current !== run || disposed || !shouldLoad(player)) return;
        const started = Date.now();
        let grewAt = started;
        let last = queue.length;
        let failure = '';
        while (current === run && !disposed && shouldLoad(player)) {
            if (queue.length >= MAX_TRACKS) {
                failure = fill(T.tooMany, { max: MAX_TRACKS, count: queue.length });
                break;
            }
            player.pullNext(PULL_SIZE);
            await wait(150);
            if (queue.length > last) {
                last = queue.length;
                grewAt = Date.now();
            } else if (Date.now() - grewAt > STALL_MS) {
                failure = fill(T.stalled, { count: queue.length });
                break;
            }
            if (Date.now() - started > 1000) showStatus(fill(T.loading, { count: queue.length }));
        }
        if (current !== run || disposed) return;
        if (!player.getState('shuffle')) {
            hideStatus();
            return;
        }
        reshuffleAhead(player);
        loaded = !failure && !player.hasMoreAhead();
        if (failure) {
            console.warn('Перемешивание всей очереди:', failure);
            showStatus(failure, 8000);
        } else hideStatus();
    }

    const onShuffle = (value?: unknown): void => {
        if (value === true) void fillAndShuffle().catch((error: unknown) => console.error('Не удалось перемешать очередь:', error));
        else {
            run++;
            hideStatus();
        }
    };
    const onReset = (): void => {
        loaded = false;
        if (manager?.getState('shuffle')) onShuffle(true);
        else run++;
    };

    // Сайт на клик по треку из списка выбрасывает очередь и строит новую с этого трека, а её пришлось бы
    // снова догружать целиком. Если весь список уже в очереди, трек ставится сразу за текущим и включается.
    function playFromLoaded(player: SourcePlayer, source: unknown, sound: unknown, options: unknown): boolean {
        if (!loaded || !sound || !player.getState('shuffle') || player.getState('globalPlayLock') || player.hasMoreAhead()) return false;
        const getSourceInfo = (source as { getSourceInfo?: unknown } | null)?.getSourceInfo;
        if (typeof getSourceInfo !== 'function') return false;
        // Пустое описание источника у разных списков совпадает, по нему один список от другого не отличить
        const info: unknown = getSourceInfo.call(source);
        if (!info || typeof info !== 'object' || Object.keys(info).length === 0 || !player.isSourceActive(source)) return false;
        const queue = player.getQueue();
        const items = queue.slice();
        const current = player.getQueueState().currentIndex;
        if (current < 0 || items[current]?.sound === sound) return false;
        const matches = (index: number): boolean => items[index]?.sound === sound;
        let index = current + 1;
        while (index < items.length && !matches(index)) index++;
        if (index === items.length) {
            index = current - 1;
            while (index >= 0 && !matches(index)) index--;
            if (index < 0) return false;
        }
        // Недоступный трек сайт пропускает назад, если до этого нажимали «назад», и сбрасывает это только своим запуском списка
        if (items[index].sound?.isPlayable?.() === false) return false;
        const rest = items.slice(current + 1);
        let target = items[index];
        if (index > current) rest.splice(index - current - 1, 1);
        else {
            // Трек уже в истории очереди: там он и остаётся, а за текущим встаёт его копия
            if (typeof target.clone !== 'function') return false;
            target = target.clone({ explicit: false });
            target.release?.();
        }
        queue.reset(items.slice(0, current + 1).concat(target, rest));
        player.setCurrentItem(target, options);
        // Во время рекламы, которую нельзя пропустить, сайт клик не выполняет: порядок очереди возвращается
        if (player.getQueueState().currentIndex === current && queue.slice(current)[0] === items[current]) {
            queue.reset(items);
            return true;
        }
        // Как и запуск списка сайтом, клик снова включает похожие треки после конца очереди
        player.toggleState?.('fallbackEnabled', true);
        return true;
    }

    function canPlaySource(player: PlayManager): player is SourcePlayer {
        const candidate = player as Partial<SourcePlayer>;
        return typeof candidate.playSource === 'function' && typeof candidate.isSourceActive === 'function' && typeof candidate.setCurrentItem === 'function';
    }

    function hookPlaySource(player: PlayManager): void {
        if (!canPlaySource(player)) return;
        const original = player.playSource;
        const patched = function (this: unknown, ...args: unknown[]): unknown {
            try {
                if (playFromLoaded(player, args[0], args[1], args[3])) return undefined;
            } catch (error) {
                console.error('Перемешивание всей очереди: трек из загруженной очереди не включился, очередь строит сайт:', error);
            }
            return original.apply(this, args);
        };
        player.playSource = patched;
        restorePlaySource = () => {
            if (player.playSource === patched) player.playSource = original;
        };
    }
    const onMissingClick = (event: MouseEvent): void => {
        if (event.target instanceof Element && event.target.closest('.shuffleControl'))
            showStatus(T.unsupported, 6000);
    };

    let attempts = 0;
    function attach(): void {
        retryTimer = undefined;
        if (disposed) return;
        manager = findManager();
        if (manager) {
            manager.on('state:shuffle', onShuffle);
            manager.on(resetEvent, onReset);
            hookPlaySource(manager);
            if (manager.getState('shuffle')) onShuffle(true);
            return;
        }
        if (++attempts < 15) {
            retryTimer = setTimeout(attach, 1000);
            return;
        }
        console.warn('Перемешивание всей очереди: очередь SoundCloud не найдена');
        document.addEventListener('click', onMissingClick, true);
    }

    const dispose = (): void => {
        disposed = true;
        run++;
        if (retryTimer !== undefined) clearTimeout(retryTimer);
        manager?.off('state:shuffle', onShuffle);
        manager?.off(resetEvent, onReset);
        restorePlaySource?.();
        document.removeEventListener('click', onMissingClick, true);
        hideStatus();
        window.removeEventListener('pagehide', dispose);
        delete host.__disposeFullShuffle;
    };
    host.__disposeFullShuffle = dispose;
    window.addEventListener('pagehide', dispose, { once: true });
    attach();
}

export function fullShuffleScript(enabled: boolean): string {
    return '(function(){\n' + siteRequires.toString() + '\n(' + installFullShuffle.toString() + ')(' + JSON.stringify(enabled) + ',' + JSON.stringify(SHUFFLE_TEXTS) + ');\n})();';
}
