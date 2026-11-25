// Автозамена недоступных треков: отрывки Go+ (30 секунд без подписки), закрытые в стране и треки только с защищённым
// потоком, если Widevine в этой сборке не работает. Раздел смотрит на текущий трек и три следующих в очереди сайта
// (любой: волна, плейлист, лайки), ищет на SoundCloud другую загрузку той же песни, которую можно слушать целиком,
// и ставит её на место. Защищённый поток считается сломанным, когда такой трек сменился, не проиграв и двух секунд.
// Раздел страницы волны: installSwap уходит на страницу текстом и зовёт помощников разбора по голому имени
import * as identity from '../trackIdentity';
import type { WaveTrack } from '../waveTypes';
import type { SitePlayer, SiteQueueItem } from '../wave';

const { familyKey, versionKey, searchQueries, trackDuration } = identity;

export interface SwapCore {
    lang: 'ru' | 'en';
    player(): SitePlayer | null;
    disposed(): boolean;
    searchTracks(q: string): Promise<WaveTrack[]>;
    /** Элемент очереди сайта для трека; null, если сайт его не сыграет */
    makeItem(track: WaveTrack, seed: string): SiteQueueItem | null;
    showToast(text: string): void;
}
export interface SwapSection {
    dispose(): void;
}

interface Media { transcodings?: Array<{ snipped?: boolean; format?: { protocol?: string } } | null> }
/** Что с треком: ok, отрывок или закрыт (snip), только защищённый поток (drm) */
export function trackAccess(track: WaveTrack | undefined): 'ok' | 'snip' | 'drm' {
    if (!track) return 'ok';
    if (track.policy === 'SNIP' || track.policy === 'BLOCK' || track.streamable === false) return 'snip';
    const list = ((track as WaveTrack & { media?: Media }).media?.transcodings ?? []).filter((item) => !!item);
    if (!list.length) return 'ok';
    const full = list.filter((item) => item && item.snipped !== true);
    if (!full.length) return 'snip';
    const open = full.some((item) => /^(hls|progressive)$/.test(item?.format?.protocol ?? ''));
    return open ? 'ok' : 'drm';
}

export function installSwap(core: SwapCore): SwapSection {
    const T = core.lang === 'ru'
        ? { swapped: 'Заменил недоступный трек на версию, которую можно слушать: {title}' }
        : { swapped: 'Replaced an unavailable track with a playable upload: {title}' };
    // Ключ с номером: прежний флаг ставился и от быстрого пропуска трека руками, его больше не читаем
    const KEY = 'scDesktopDrmBroken2';
    let drmBroken = false;
    try {
        localStorage.removeItem('scDesktopDrmBroken');
        drmBroken = Number(localStorage.getItem(KEY) || 0) > Date.now() - 7 * 86400000;
    } catch {
        // без хранилища считается рабочим
    }
    // Защищённые треки, сменившиеся сами не проиграв и двух секунд, подряд: одного случая мало, это мог быть сбой сети
    let drmFailures = 0;
    // Найденные замены и неудачи: по id исходного трека, на сессию
    const found = new Map<number, WaveTrack | null>();
    const pending = new Set<number>();
    let lastId = 0;
    let lastStarted = 0;
    let lastPos = 0;
    let lastDrm = false;
    // Трек, который человек включил сам (клик, Enter, пробел недавно до смены), не подменяется: играет именно он.
    // Замена только у того, что переключилось само
    let lastInput = 0;
    let chosenId = 0;
    const markInput = (): void => {
        lastInput = Date.now();
    };
    document.addEventListener('pointerdown', markInput, true);
    document.addEventListener('keydown', markInput, true);

    const needs = (track: WaveTrack | undefined): boolean => {
        // Отрывок Go+ (SNIP) не подменяется: человек слушает оригинал, пусть и тридцать секунд. Замена только там, где
        // трек не играет вовсе: закрыт в стране (BLOCK) или защищённый поток не работает
        const access = trackAccess(track);
        if (access === 'snip') return track?.policy === 'BLOCK' || (track?.streamable === false && track?.policy !== 'SNIP');
        return access === 'drm' && drmBroken;
    };
    async function replacementFor(track: WaveTrack): Promise<WaveTrack | null> {
        if (found.has(track.id)) return found.get(track.id) ?? null;
        if (pending.has(track.id)) return null;
        pending.add(track.id);
        try {
            const family = familyKey(track);
            const version = versionKey(track);
            const length = trackDuration(track);
            const queries = [...searchQueries(track).map((query) => query.q), [track.user?.username ?? '', track.title ?? ''].join(' ')].filter(Boolean).slice(0, 3);
            const seen = new Set<number>();
            const pool: WaveTrack[] = [];
            for (const q of queries) {
                for (const item of await core.searchTracks(q).catch(() => [] as WaveTrack[])) {
                    if (seen.has(item.id) || item.id === track.id) continue;
                    seen.add(item.id);
                    pool.push(item);
                }
            }
            // Та же песня: та же семья по разбору названия; лучше та же версия и длительность рядом, без отрывков
            // Только та же версия: никаких slowed, sped up, ремиксов и безымянных переделок вместо оригинала
            const scored = pool
                .filter((item) => family && familyKey(item) === family && versionKey(item) === version && trackAccess(item) === 'ok')
                // Только настоящая копия: длительность в пределах трёх секунд, иначе лучше не менять совсем
                .filter((item) => !length || !trackDuration(item) || Math.abs(trackDuration(item) - length) <= 3000)
                .map((item) => {
                    const near = length && trackDuration(item) ? Math.abs(trackDuration(item) - length) / 1000 : 30;
                    const score = -Math.min(near, 60) / 6 + Math.log10(1 + (item.playback_count ?? 0));
                    return { item, score };
                })
                .sort((a, b) => b.score - a.score);
            const best = scored[0]?.item ?? null;
            found.set(track.id, best);
            return best;
        } finally {
            pending.delete(track.id);
        }
    }
    function trackOf(item: SiteQueueItem | undefined): WaveTrack | undefined {
        const attributes = item?.sound?.attributes;
        return attributes && typeof attributes.id === 'number' ? attributes : undefined;
    }
    // Замена в очереди: новый элемент на месте старого; текущий трек сменяется сразу
    async function swap(at: number, current: boolean): Promise<void> {
        const p = core.player();
        if (!p) return;
        const original = trackOf(p.getQueue().slice()[at]);
        if (!original || !needs(original)) return;
        const replacement = await replacementFor(original);
        if (!replacement || core.disposed()) return;
        const items = p.getQueue().slice();
        const index = p.getQueueState().currentIndex;
        const position = items.findIndex((item) => trackOf(item)?.id === original.id);
        if (position < 0 || (current && position !== index) || (!current && position <= index)) return;
        const fresh = core.makeItem(replacement, original.title ?? '');
        if (!fresh) return;
        items[position] = fresh;
        p.getQueue().reset(items);
        if (current) {
            p.setCurrentItem(fresh, {});
            p.playCurrent({ userInitiated: true });
        }
        core.showToast(T.swapped.replace('{title}', (replacement.user?.username ? replacement.user.username + ' — ' : '') + (replacement.title ?? '')));
    }
    function step(): void {
        const p = core.player();
        if (!p || core.disposed()) return;
        const sound = p.getCurrentSound();
        const id = sound?.id ?? 0;
        const position = typeof sound?.currentTime === 'function' ? sound.currentTime() || 0 : 0;
        // Защищённый трек сменился сам, не проиграв и двух секунд: похоже, Widevine здесь не работает. Пропуск руками
        // (клик, клавиша незадолго до смены) не в счёт, и вывод делается только после двух таких треков подряд
        if (id !== lastId) {
            if (lastId && lastDrm && !drmBroken) {
                const failed = lastPos < 2000 && Date.now() - lastStarted < 15000 && Date.now() - lastInput > 4000;
                drmFailures = failed ? drmFailures + 1 : lastPos >= 2000 ? 0 : drmFailures;
                if (drmFailures >= 2) {
                    drmBroken = true;
                    try {
                        localStorage.setItem(KEY, String(Date.now()));
                    } catch {
                        // без хранилища до перезагрузки
                    }
                }
            }
            lastId = id;
            chosenId = Date.now() - lastInput < 4000 ? id : 0;
            lastStarted = Date.now();
            lastDrm = trackAccess(sound?.attributes) === 'drm';
            lastPos = 0;
        } else lastPos = Math.max(lastPos, position);
        const items = p.getQueue().slice();
        const index = p.getQueueState().currentIndex;
        if (needs(trackOf(items[index])) && trackOf(items[index])?.id !== chosenId) void swap(index, true);
        for (let i = index + 1; i <= index + 3 && i < items.length; i++) if (needs(trackOf(items[i]))) void swap(i, false);
    }
    const timer = setInterval(() => {
        try {
            step();
        } catch (error) {
            console.warn('Автозамена: шаг не удался', error);
        }
    }, 1500);
    return {
        dispose() {
            clearInterval(timer);
            document.removeEventListener('pointerdown', markInput, true);
            document.removeEventListener('keydown', markInput, true);
        },
    };
}
