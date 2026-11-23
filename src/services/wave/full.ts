// Полный трек вместо отрывка Go+ (30 секунд): для трека-отрывка, который играет сейчас или стоит в очереди ближайшим,
// main находит ту же песню на YouTube и отдаёт ссылку на аудио. Раздел подменяет источник у аудиоэлемента сайта на эту
// ссылку с того же места, поэтому полоса, пауза и перемотка сайта работают как обычно, а конец трека сайт считает сам.
// Раздел страницы волны: installFull уходит на страницу текстом и зовёт помощников разбора по голому имени
import * as identity from '../trackIdentity';
import type { SitePlayer, SiteQueueItem } from '../wave';

const { trackDuration } = identity;

export interface FullCore {
    player(): SitePlayer | null;
    disposed(): boolean;
    /** Ссылка на полный поток или null, если main ничего подходящего не нашёл (или функция выключена) */
    resolve(query: { title: string; uploader: string; durationMs: number }): Promise<{ url: string } | null>;
}
export interface FullSection {
    dispose(): void;
}

export function installFull(core: FullCore): FullSection {
    // По id трека: ссылка, null (не нашлось) или промис ещё идёт
    const urls = new Map<number, string | null>();
    const asked = new Set<number>();
    const applied = new Map<number, string>();

    const trackOf = (item: SiteQueueItem | null | undefined): (NonNullable<SiteQueueItem['sound']>['attributes']) | undefined => {
        const attributes = item?.sound?.attributes;
        return attributes && typeof attributes.id === 'number' ? attributes : undefined;
    };
    const isSnippet = (track: ReturnType<typeof trackOf>, sound?: { isSnippetized?(): boolean } | null): boolean =>
        !!track && (track.policy === 'SNIP' || !!sound?.isSnippetized?.());
    function ask(track: NonNullable<ReturnType<typeof trackOf>>): void {
        if (asked.has(track.id)) return;
        asked.add(track.id);
        void core
            .resolve({ title: track.title ?? '', uploader: track.user?.username ?? '', durationMs: trackDuration(track) })
            .then((found) => {
                urls.set(track.id, found?.url ?? null);
                // Без результата запрос не повторяется до перезапуска, кроме сбоя сети: его main не запоминает
                if (!found) setTimeout(() => asked.delete(track.id), 10 * 60_000);
            })
            .catch(() => asked.delete(track.id));
    }
    function step(): void {
        const p = core.player();
        if (!p || core.disposed()) return;
        const items = p.getQueue().slice();
        const index = p.getQueueState().currentIndex;
        const sound = p.getCurrentSound();
        const current = sound?.attributes ?? trackOf(items[index]);
        if (current && isSnippet(current, sound)) ask(current);
        // Ближайшие в очереди готовятся заранее, чтобы к их началу ссылка уже была
        for (let i = index + 1; i <= index + 2 && i < items.length; i++) {
            const next = trackOf(items[i]);
            if (next && isSnippet(next)) ask(next);
        }
        if (!current || !isSnippet(current, sound)) return;
        const url = urls.get(current.id);
        if (!url || applied.get(current.id) === url) return;
        // Аудиоэлемент, который сейчас играет трек сайта: играющий, иначе единственный с источником
        const elements = [...document.querySelectorAll('audio,video')] as HTMLMediaElement[];
        const el = elements.find((item) => !item.paused && item.currentSrc) ?? elements.find((item) => item.currentSrc);
        if (!el || el.currentSrc === url) return;
        const position = el.currentTime || 0;
        const playing = !el.paused;
        applied.set(current.id, url);
        const resume = (): void => {
            el.removeEventListener('loadedmetadata', resume);
            // Отрывок и полный трек одной песни: место то же, ставим его и продолжаем, если играло
            try {
                if (position > 0 && position < (el.duration || Infinity)) el.currentTime = position;
            } catch {
                // перемотка не удалась: играет с начала
            }
            if (playing) void el.play().catch(() => undefined);
        };
        el.addEventListener('loadedmetadata', resume);
        el.src = url;
        el.load();
    }
    const timer = setInterval(() => {
        try {
            step();
        } catch (error) {
            console.warn('Полный трек: шаг не удался', error);
        }
    }, 1000);
    return {
        dispose() {
            clearInterval(timer);
        },
    };
}
