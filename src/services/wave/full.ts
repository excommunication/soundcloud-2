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
    /** Трек по пути страницы (/artist/track); null, если сайт его не отдал. Нужен, чтобы понять, закрыт ли трек под кнопкой */
    lookup?(path: string): Promise<{ id: number; title?: string; policy?: string; streamable?: boolean; duration?: number; full_duration?: number; user?: { username?: string } } | null>;
    showToast?(text: string): void;
}
export interface FullSection {
    dispose(): void;
}

/** Трек закрыт в стране (BLOCK) или не отдаёт поток (streamable: false без отрывка Go+): сайт отключает у него кнопку «играть».
 *  Правило то же, что у автозамены в swap.ts. Отрывок Go+ (SNIP) сюда не входит: он играет и подменяется в step() */
export function isBlockedTrack(track: { policy?: string; streamable?: boolean } | null | undefined): boolean {
    if (!track) return false;
    if (track.policy === 'BLOCK') return true;
    return track.streamable === false && track.policy !== 'SNIP';
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
    // Закрытые в стране треки: кнопка «играть» у них отключена сайтом. Включаем её и по клику ставим тот же полный поток
    // с YouTube на собственный аудиоэлемент (плеер сайта такой трек не играет вовсе)
    const PLAY_BUTTON = '.sc-button-play, .playButton, .sc-button-startstop, button[class*="playButton"], button[class*="PlayButton"]';
    const ITEM = '.soundList__item, .searchItem__trackItem, .trackItem, .compactTrackList__item, .playableTile, .soundBadge, .sound, .listenEngagement, .fullListenHero, .l-listen-hero';
    const TRACK_LINK = 'a.soundTitle__title, a.trackItem__trackTitle, a.playableTile__mainHeading, a.playableTile__heading, a.sound__coverArt, a.playableTile__artworkLink';
    const blockedByPath = new Map<string, ReturnType<typeof trackOf> | null>();
    const lookups = new Set<string>();
    let own: HTMLAudioElement | null = null;
    let ownPath = '';
    const pathOf = (button: Element): string => {
        const item = button.closest(ITEM);
        const link = item?.querySelector<HTMLAnchorElement>(TRACK_LINK);
        const href = link?.getAttribute('href') ?? (item ? '' : location.pathname);
        const match = /^\/([a-z0-9_-]{1,100})\/([a-z0-9_-]{1,255})\/?$/i.exec((href ?? '').split(/[?#]/)[0]);
        return match ? '/' + match[1].toLowerCase() + '/' + match[2].toLowerCase() : '';
    };
    function lookupBlocked(path: string): void {
        if (!path || lookups.has(path) || !core.lookup) return;
        lookups.add(path);
        void core
            .lookup(path)
            .then((track) => {
                const blocked = !!track && typeof track.id === 'number' && isBlockedTrack(track);
                blockedByPath.set(path, blocked ? (track as NonNullable<ReturnType<typeof trackOf>>) : null);
            })
            .catch(() => lookups.delete(path));
    }
    // Кнопки закрытых треков: сайт ставит disabled, из-за этого клик не доходит ни до кого
    function enableBlockedButtons(): void {
        for (const button of document.querySelectorAll<HTMLElement>(PLAY_BUTTON)) {
            const off = button.hasAttribute('disabled') || button.getAttribute('aria-disabled') === 'true' || button.classList.contains('sc-button-disabled');
            if (!off && !button.hasAttribute('data-sc-blocked')) continue;
            const path = pathOf(button);
            if (!path) continue;
            if (!blockedByPath.has(path)) {
                lookupBlocked(path);
                continue;
            }
            if (!blockedByPath.get(path)) continue;
            button.removeAttribute('disabled');
            button.removeAttribute('aria-disabled');
            button.classList.remove('sc-button-disabled');
            button.setAttribute('data-sc-blocked', path);
            button.style.pointerEvents = 'auto';
            button.style.opacity = '1';
        }
    }
    async function playBlocked(path: string): Promise<void> {
        const track = blockedByPath.get(path);
        if (!track) return;
        if (own && ownPath === path) {
            if (own.paused) void own.play().catch(() => undefined);
            else own.pause();
            return;
        }
        const found = await core
            .resolve({ title: track.title ?? '', uploader: track.user?.username ?? '', durationMs: trackDuration(track) })
            .catch(() => null);
        if (core.disposed()) return;
        if (!found?.url) {
            core.showToast?.(document.documentElement.lang === 'ru' ? 'Не нашёл, откуда сыграть этот трек' : 'Could not find a source for this track');
            return;
        }
        core.player()?.pauseCurrent({ userInitiated: true });
        own?.pause();
        own = new Audio(found.url);
        ownPath = path;
        await own.play().catch(() => core.showToast?.(document.documentElement.lang === 'ru' ? 'Не удалось запустить трек' : 'Could not start the track'));
    }
    const onClick = (event: MouseEvent): void => {
        const button = event.target instanceof Element ? event.target.closest<HTMLElement>(PLAY_BUTTON) : null;
        const path = button?.getAttribute('data-sc-blocked');
        if (!button || !path) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        void playBlocked(path);
    };
    document.addEventListener('click', onClick, true);
    const timer = setInterval(() => {
        try {
            step();
            enableBlockedButtons();
        } catch (error) {
            console.warn('Полный трек: шаг не удался', error);
        }
    }, 2500);
    return {
        dispose() {
            clearInterval(timer);
            document.removeEventListener('click', onClick, true);
            own?.pause();
        },
    };
}
