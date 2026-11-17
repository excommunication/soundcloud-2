// Защита места в треке от отката назад без действия человека.

/** Допуск: позиция чуть позади сохранённой не считается потерянной (сохранение шло раз в 30 с) */
export const RESTORE_TOLERANCE_MS = 2000;
/** Откат назад дольше этого без действия человека уходит в журнал */
export const SEEK_BACK_MIN_MS = 1000;
/** Действие человека (клик, клавиша, медиаклавиша) объясняет перемотку в течение этого времени */
export const USER_ACTION_WINDOW_MS = 2500;

export interface RestoreInput {
    savedTrackId: number;
    savedPositionMs: number;
    /** Трек, который играет сейчас, до замены очереди; null, если ничего не играет */
    currentTrackId: number | null;
    currentPositionMs: number;
}

/**
 * Куда перемотать при восстановлении сессии, или null, если перематывать не нужно:
 * уже проигранное место никогда не уводим назад.
 */
export function restorePosition(input: RestoreInput): number | null {
    // Функции уходят на страницу текстом: константы модуля там недоступны, допуск 2 с записан здесь (RESTORE_TOLERANCE_MS)
    if (!(input.savedPositionMs > 0)) return null;
    if (input.currentTrackId === input.savedTrackId && input.currentPositionMs >= input.savedPositionMs - 2000) return null;
    return input.savedPositionMs;
}

/** Откат назад между двумя замерами: на сколько миллисекунд позиция ушла назад, или 0 */
export function seekBackDelta(prevMs: number, nextMs: number, bothPlaying: boolean): number {
    if (!bothPlaying) return 0;
    const back = prevMs - nextMs;
    // Возврат к самому началу — повтор трека или «назад» с перезапуском, а не потерянное место
    if (back <= 1000 || nextMs < 1500) return 0;
    return back;
}

export type SeekSource = 'seek-restore' | 'seek-core' | 'seek-unknown';

export interface SeekWatch {
    /** Свои перемотки (восстановление, слежение джема): так источник в журнале понятен */
    note(source: SeekSource, now?: number): void;
    /** Действие человека */
    user(now?: number): void;
    /** Очередной замер; возвращает найденный откат */
    sample(trackId: number, positionMs: number, playing: boolean, now?: number): { source: SeekSource; deltaMs: number } | null;
}

export function createSeekWatch(report: (source: SeekSource, deltaMs: number) => void): SeekWatch {
    let last: { id: number; position: number; playing: boolean } | null = null;
    let userAt = -Infinity;
    let noted: { source: SeekSource; at: number } | null = null;
    return {
        note: (source, now = Date.now()) => { noted = { source, at: now }; },
        user: (now = Date.now()) => { userAt = now; },
        sample(trackId, positionMs, playing, now = Date.now()) {
            const before = last;
            last = { id: trackId, position: positionMs, playing };
            if (!before || before.id !== trackId) return null;
            const delta = seekBackDelta(before.position, positionMs, before.playing && playing);
            if (!delta || now - userAt <= 2500) return null;
            const source: SeekSource = noted && now - noted.at <= 2500 ? noted.source : 'seek-unknown';
            report(source, delta);
            return { source, deltaMs: delta };
        },
    };
}
