// Математика синхронизации «Джема»: позиция по часам сервера, смещение часов, что сделать плееру. Чистые функции.
// Всё, что зовёт страница (expectedPosition, planFollow, isSeekJump, shouldAdvance), уходит на неё текстом через
// pageHelpers (jamHelpers в wave/jam.ts): эти функции не ссылаются на константы модуля, числа записаны в них самих.
// Для тестов и main: medianOffset, offsetFromPong.

export interface PositionNow {
    startedAt: number;
    positionMs: number;
    paused: boolean;
    track: { durationMs: number };
}
export interface LocalPlayback {
    /** id играющего трека сайта */
    trackId: number;
    positionMs: number;
    playing: boolean;
}
export interface FollowPlan {
    /** Нужно открыть трек джема (локально играет другой или ничего) */
    open: boolean;
    /** true включить, false поставить на паузу, null оставить */
    setPlaying: boolean | null;
    /** Куда перемотать, null — не нужно */
    seekTo: number | null;
}

/** Позиция трека джема в момент serverNow (часы сервера): на паузе стоит, иначе идёт; дальше конца трека не уходит */
export function expectedPosition(now: PositionNow, serverNow: number): number {
    const base = now.paused ? now.positionMs : now.positionMs + Math.max(0, serverNow - now.startedAt);
    const duration = now.track.durationMs;
    return Math.max(0, duration > 0 ? Math.min(base, duration) : base);
}

/** Что сделать локальному плееру, чтобы совпасть с джемом. driftMs: терпимое расхождение, дальше перемотка (по умолчанию 2500) */
export function planFollow(now: PositionNow & { track: { id: number; durationMs: number } } | null, serverNow: number, local: LocalPlayback | null, driftMs = 2500): FollowPlan {
    if (!now) return { open: false, setPlaying: null, seekTo: null };
    const want = expectedPosition(now, serverNow);
    if (!local || local.trackId !== now.track.id) return { open: true, setPlaying: null, seekTo: want };
    const setPlaying = local.playing === !now.paused ? null : !now.paused;
    // На паузе позиция неподвижна: перематываем при любом заметном расхождении
    const tolerance = now.paused ? 400 : driftMs;
    return { open: false, setPlaying, seekTo: Math.abs(local.positionMs - want) > tolerance ? want : null };
}

/** Позиция прыгнула, а не прошла сама: между опросами за elapsed мс должно набежать elapsed (если играет) или 0 */
export function isSeekJump(lastPositionMs: number, positionMs: number, elapsedMs: number, playing: boolean, toleranceMs = 1500): boolean {
    return Math.abs(positionMs - lastPositionMs - (playing ? elapsedMs : 0)) > toleranceMs;
}

/** Пора ли хозяину переключить трек: сыграл до конца (по локальному плееру) или по часам сервера давно вышло время.
 *  endedLocally: трек был в последних секундах и пропал или остановился; slackMs: запас по часам сервера */
export function shouldAdvance(now: PositionNow | null, serverNow: number, endedLocally: boolean, slackMs = 4000): boolean {
    if (!now || now.paused) return false;
    if (endedLocally) return true;
    const duration = now.track.durationMs;
    return duration > 0 && now.positionMs + Math.max(0, serverNow - now.startedAt) > duration + slackMs;
}

/** Смещение часов сервера относительно локальных из одного ответа ping/pong: server - (отправка + RTT/2) */
export function offsetFromPong(sentAt: number, serverAt: number, receivedAt: number): { offset: number; rtt: number } {
    const rtt = Math.max(0, receivedAt - sentAt);
    return { offset: serverAt - (sentAt + rtt / 2), rtt };
}
/** Медиана смещений (последние пять измерений): один случайный скачок задержки её не двигает */
export function medianOffset(samples: number[]): number {
    const sorted = samples.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
    if (!sorted.length) return 0;
    const mid = sorted.length >> 1;
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
