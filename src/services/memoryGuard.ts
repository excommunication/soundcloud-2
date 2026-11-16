// Сторож памяти (2.10.1). Плеер самого сайта SoundCloud копит скачанные куски аудио: после каждого пропущенного трека
// в цепочке загрузчика (whenComplete → abort) остаются ~2,5 МБ, и без нашего кода (замер на чистом сайте: 75 → 179 МБ
// JS-кучи за 40 пропусков). Процесс страницы за пару сотен пропусков вырастает с 0,7 до 2 ГБ и больше. Починить сайт мы
// не можем, поэтому страница перезагружается, когда раздулась: волна после перезагрузки сама восстанавливает очередь и
// позицию (wave.ts, сохранённая сессия).
// Мягкий порог: перезагрузка, когда музыка стоит на паузе или окно не на виду, чтобы не прерывать звук.
// Жёсткий порог: перезагрузка в любом случае, пока рост не съел всю память слабого ПК.

export interface MemoryLimits {
    /** МиБ процесса страницы */
    soft: number;
    hard: number;
}
export interface MemoryReading {
    /** МиБ процесса страницы сейчас */
    pageMiB: number;
    totalMiB: number;
    playing: boolean;
    windowShown: boolean;
    /** Сколько прошло с прошлой перезагрузки сторожем и с загрузки страницы, мс */
    sinceReloadMs: number;
}

/** Пороги от объёма памяти ПК: на слабом раньше, но не ниже 600 МиБ и не выше 1100 МиБ */
export function memoryLimits(totalMiB: number): MemoryLimits {
    const base = Number.isFinite(totalMiB) && totalMiB > 0 ? totalMiB * 0.07 : 1100;
    const soft = Math.round(Math.max(600, Math.min(1100, base)));
    return { soft, hard: Math.round(soft * 1.7) };
}

/** Что делать с этим замером: null — ничего. Не чаще раза в 10 минут: перезагрузка не должна превращаться в цикл */
export function memoryVerdict(reading: MemoryReading): 'soft' | 'hard' | null {
    if (!(reading.pageMiB > 0) || reading.sinceReloadMs < 10 * 60_000) return null;
    const limits = memoryLimits(reading.totalMiB);
    if (reading.pageMiB >= limits.hard) return 'hard';
    if (reading.pageMiB >= limits.soft && (!reading.playing || !reading.windowShown)) return 'soft';
    return null;
}
