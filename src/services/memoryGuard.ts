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

/** Не чаще раза в 30 минут: перезагрузка не должна превращаться в цикл */
export const MEMORY_RELOAD_COOLDOWN_MS = 30 * 60_000;

/**
 * Пороги от объёма памяти ПК: 25% памяти, но не ниже 1400 и не выше 2400 МиБ (2.12.2). Прежние 600–1100 МиБ
 * срабатывали на обычных ~2 ГБ страницы и вызывали «перезагрузки сами по себе»; теперь перезагрузка только при
 * настоящей угрозе: жёсткий порог в 1,5 раза выше мягкого (4 ГБ ПК: 1400 / 2100, 16 ГБ: 2400 / 3600)
 */
export function memoryLimits(totalMiB: number): MemoryLimits {
    const base = Number.isFinite(totalMiB) && totalMiB > 0 ? totalMiB * 0.25 : 2400;
    const soft = Math.round(Math.max(1400, Math.min(2400, base)));
    return { soft, hard: Math.round(soft * 1.5) };
}

/** Что делать с этим замером: null — ничего. Не чаще раза в 30 минут */
export function memoryVerdict(reading: MemoryReading): 'soft' | 'hard' | null {
    if (!(reading.pageMiB > 0) || reading.sinceReloadMs < MEMORY_RELOAD_COOLDOWN_MS) return null;
    const limits = memoryLimits(reading.totalMiB);
    if (reading.pageMiB >= limits.hard) return 'hard';
    if (reading.pageMiB >= limits.soft && (!reading.playing || !reading.windowShown)) return 'soft';
    return null;
}
