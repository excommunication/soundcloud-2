// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { installFullShuffle, SHUFFLE_TEXTS } from './fullShuffle';

interface Sound { id: number }
interface Item { id: number; sound: Sound; explicit?: boolean; copy?: boolean; clone(changes: object): Item; release(): void }
type Listener = (value?: unknown) => void;

function fakePlayer(total: number, stallAt = total) {
    const listeners = new Map<string, Set<Listener>>();
    const items: Item[] = [];
    const sounds = new Map<number, Sound>();
    let loaded = 0;
    let shuffle = false;
    let current = -1;
    const emit = (event: string, value?: unknown): void => listeners.get(event)?.forEach((listener) => listener(value));
    const soundOf = (id: number): Sound => {
        if (!sounds.has(id)) sounds.set(id, { id });
        return sounds.get(id)!;
    };
    const makeItem = (id: number): Item => ({ id, sound: soundOf(id), clone: (changes: object) => ({ ...makeItem(id), ...changes, copy: true }), release: vi.fn() });
    const likes = { getSourceInfo: () => ({ type: 'likes' }) };
    const playlist = { getSourceInfo: () => ({ type: 'playlist' }) };
    const unnamed = { getSourceInfo: () => ({}) };
    const playSource = vi.fn();
    let adBreak = false;
    const queue = {
        get length() { return items.length; },
        slice: (start?: number, end?: number) => items.slice(start, end),
        reset: (next: Item[]) => { items.splice(0, items.length, ...next); },
    };
    const player = {
        getQueue: () => queue,
        getQueueState: () => ({ currentIndex: current }),
        getState: (name: string) => name === 'shuffle' && shuffle,
        hasMoreAhead: () => loaded < total,
        hasFallback: () => false,
        pullNext: vi.fn((count: number) => { for (let i = 0; i < count && loaded < stallAt; i++) items.push(makeItem(loaded++)); }),
        toggleShuffle: () => { shuffle = !shuffle; emit('state:shuffle', shuffle); },
        on: (event: string, listener: Listener) => { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event)!.add(listener); },
        off: (event: string, listener: Listener) => { listeners.get(event)?.delete(listener); },
        playSource: playSource as (...args: unknown[]) => unknown,
        isSourceActive: (source: unknown) => source === likes || source === unnamed,
        // Во время непропускаемой рекламы сайт клик не выполняет
        setCurrentItem: (item: Item) => { if (!adBreak) current = items.indexOf(item); },
        toggleState: vi.fn(),
    };
    return {
        player, items, emit, listeners, likes, playlist, unnamed, playSource,
        get current() { return current; },
        set adBreak(value: boolean) { adBreak = value; },
        start(count: number) { items.splice(0); loaded = 0; player.pullNext(count); current = 0; },
        newSource(count: number, nextTotal: number) { total = nextTotal; stallAt = nextTotal; items.splice(0); loaded = 0; current = -1; emit('queueReset'); player.pullNext(count); current = 0; },
    };
}

let fake: ReturnType<typeof fakePlayer>;
function provide(player: object): void {
    const jsonp: unknown[] = [];
    jsonp.push = (chunk: unknown) => {
        const [, modules, entries] = chunk as [unknown, Record<string, (m: unknown, e: unknown, r: unknown) => void>, string[][]];
        const id = entries[0][0];
        modules[id]({}, {}, { c: { '20': { exports: player }, '185': { exports: { QUEUE_RESET: 'queueReset' } } } });
        return 0;
    };
    Object.assign(window, { webpackJsonp: jsonp });
}
beforeEach(() => {
    vi.useFakeTimers();
    fake = fakePlayer(600);
    provide(fake.player);
});
afterEach(() => {
    window.dispatchEvent(new Event('pagehide'));
    vi.useRealTimers();
    document.body.innerHTML = '';
});
const ids = (items: Item[]) => items.map((item) => item.id);

it('догружает всю очередь и перемешивает всё после текущего трека, ручные треки не трогает', async () => {
    fake.start(21);
    fake.items[1].explicit = true;
    installFullShuffle(true, SHUFFLE_TEXTS);
    fake.player.toggleShuffle();
    await vi.advanceTimersByTimeAsync(2000);
    expect(fake.items).toHaveLength(600);
    expect(ids(fake.items.slice(0, 2))).toEqual([0, 1]);
    const rest = ids(fake.items.slice(2));
    expect([...rest].sort((a, b) => a - b)).toEqual(Array.from({ length: 598 }, (_, i) => i + 2));
    expect(rest).not.toEqual([...rest].sort((a, b) => a - b));
});

it('если сайт перестал отдавать треки, говорит об этом на языке сайта и перемешивает загруженное', async () => {
    for (const [language, text] of [['ru', 'Сайт перестал отдавать треки, перемешаны загруженные: 300'], ['en', 'The site stopped sending tracks, shuffled the loaded ones: 300']]) {
        fake = fakePlayer(600, 300);
        provide(fake.player);
        fake.start(21);
        // Русский сайт помечает перевод сам (preload), у английского пометки нет
        if (language === 'ru') Object.assign(window, { __scSiteTranslation: { language: 'ru' } });
        else Reflect.deleteProperty(window, '__scSiteTranslation');
        installFullShuffle(true, SHUFFLE_TEXTS);
        fake.player.toggleShuffle();
        await vi.advanceTimersByTimeAsync(20000);
        expect(fake.items).toHaveLength(300);
        expect(document.querySelector('[role="status"]')?.textContent).toBe(text);
    }
    Reflect.deleteProperty(window, '__scSiteTranslation');
});

it('новая очередь при включённом перемешивании тоже догружается целиком', async () => {
    fake = fakePlayer(21);
    provide(fake.player);
    fake.start(21);
    installFullShuffle(true, SHUFFLE_TEXTS);
    fake.player.toggleShuffle();
    fake.newSource(21, 500);
    await vi.advanceTimersByTimeAsync(2000);
    expect(fake.items).toHaveLength(500);
});

async function loadedLikes(): Promise<void> {
    fake.start(21);
    installFullShuffle(true, SHUFFLE_TEXTS);
    fake.player.toggleShuffle();
    await vi.advanceTimersByTimeAsync(2000);
    expect(fake.items).toHaveLength(600);
    fake.player.pullNext.mockClear();
}

it('клик по треку того же списка после полной загрузки не грузит очередь заново, трек встаёт за текущим', async () => {
    await loadedLikes();
    fake.items[1].explicit = true;
    const target = fake.items[300];
    const before = fake.items.slice();
    fake.player.playSource(fake.likes, target.sound, {}, { userInitiated: true });
    await vi.advanceTimersByTimeAsync(2000);
    expect(fake.playSource).not.toHaveBeenCalled();
    expect(fake.player.pullNext).not.toHaveBeenCalled();
    expect(fake.player.toggleState).toHaveBeenCalledWith('fallbackEnabled', true);
    expect(fake.current).toBe(1);
    expect(fake.items[1]).toBe(target);
    expect(fake.items[0]).toBe(before[0]);
    // Ручной трек из «Далее» остаётся сразу после выбранного, остальной порядок не меняется
    expect(fake.items.slice(2)).toEqual(before.slice(1).filter((item) => item !== target));
});

it('трек, который уже в истории очереди, играет копией, история не меняется', async () => {
    await loadedLikes();
    fake.player.setCurrentItem(fake.items[5]);
    const played = fake.items[2];
    const before = fake.items.slice();
    fake.player.playSource(fake.likes, played.sound, {}, {});
    expect(fake.playSource).not.toHaveBeenCalled();
    expect(fake.items).toHaveLength(601);
    expect(fake.items.slice(0, 6)).toEqual(before.slice(0, 6));
    expect(fake.current).toBe(6);
    expect(fake.items[6]).toMatchObject({ copy: true, sound: played.sound });
    expect(fake.items[6].release).toHaveBeenCalledTimes(1);
    expect(fake.items.slice(7)).toEqual(before.slice(6));
});

it('другой список, недогруженная очередь и выключенное перемешивание остаются за сайтом', async () => {
    fake.start(21);
    installFullShuffle(true, SHUFFLE_TEXTS);
    fake.player.toggleShuffle();
    fake.player.playSource(fake.likes, fake.items[10].sound, {}, {});
    expect(fake.playSource).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);
    fake.player.playSource(fake.playlist, fake.items[10].sound, {}, {});
    expect(fake.playSource).toHaveBeenCalledTimes(2);
    fake.player.toggleShuffle();
    fake.player.playSource(fake.likes, fake.items[10].sound, {}, {});
    expect(fake.playSource).toHaveBeenCalledTimes(3);
    // Новая очередь от сайта снова требует полной загрузки
    fake.player.toggleShuffle();
    fake.emit('queueReset');
    fake.player.playSource(fake.likes, fake.items[10].sound, {}, {});
    expect(fake.playSource).toHaveBeenCalledTimes(4);
});

it('список без описания источника, сбой обхода и недогруженная из-за зависания очередь остаются за сайтом', async () => {
    await loadedLikes();
    fake.player.playSource(fake.unnamed, fake.items[10].sound, {}, {});
    expect(fake.playSource).toHaveBeenCalledTimes(1);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
        fake.player.setCurrentItem(fake.items[5]);
        fake.items[2].clone = () => { throw new Error('clone'); };
        fake.player.playSource(fake.likes, fake.items[2].sound, {}, {});
        expect(fake.playSource).toHaveBeenCalledTimes(2);
        expect(error).toHaveBeenCalledTimes(1);
    } finally {
        error.mockRestore();
    }

    fake = fakePlayer(600, 300);
    provide(fake.player);
    fake.start(21);
    installFullShuffle(true, SHUFFLE_TEXTS);
    fake.player.toggleShuffle();
    await vi.advanceTimersByTimeAsync(20000);
    expect(fake.items).toHaveLength(300);
    fake.player.playSource(fake.likes, fake.items[100].sound, {}, {});
    expect(fake.playSource).toHaveBeenCalledTimes(1);
});

it('если сайт не выполнил клик из-за рекламы, порядок очереди возвращается', async () => {
    await loadedLikes();
    const before = fake.items.slice();
    fake.adBreak = true;
    fake.player.playSource(fake.likes, fake.items[300].sound, {}, {});
    expect(fake.playSource).not.toHaveBeenCalled();
    expect(fake.items).toEqual(before);
    expect(fake.current).toBe(0);
});

it('выключение снимает подписки и возвращает сайту его запуск очереди', () => {
    installFullShuffle(true, SHUFFLE_TEXTS);
    expect(fake.listeners.get('state:shuffle')?.size).toBe(1);
    expect(fake.player.playSource).not.toBe(fake.playSource);
    installFullShuffle(false, SHUFFLE_TEXTS);
    expect([...fake.listeners.values()].every((set) => set.size === 0)).toBe(true);
    expect(fake.player.playSource).toBe(fake.playSource);
    expect(vi.getTimerCount()).toBe(0);
});
