import { describe, expect, it } from 'vitest';
import { memoryLimits, memoryVerdict, type MemoryReading } from './memoryGuard';

const reading = (extra: Partial<MemoryReading>): MemoryReading => ({ pageMiB: 500, totalMiB: 16384, playing: true, windowShown: true, sinceReloadMs: 3_600_000, ...extra });

describe('сторож памяти', () => {
    it('пороги зависят от памяти ПК и зажаты между 1400 и 2400 МиБ', () => {
        expect(memoryLimits(32768)).toEqual({ soft: 2400, hard: 3600 });
        expect(memoryLimits(8192)).toEqual({ soft: 2048, hard: 3072 });
        expect(memoryLimits(4096)).toEqual({ soft: 1400, hard: 2100 });
        expect(memoryLimits(Number.NaN).soft).toBe(2400);
    });
    it('пока память в норме, ничего не делает', () => {
        expect(memoryVerdict(reading({ pageMiB: 1300 }))).toBeNull();
        expect(memoryVerdict(reading({ pageMiB: 0 }))).toBeNull();
    });
    it('мягкий порог ждёт паузы или свёрнутого окна, жёсткий не ждёт', () => {
        expect(memoryVerdict(reading({ pageMiB: 2500 }))).toBeNull();
        expect(memoryVerdict(reading({ pageMiB: 2500, playing: false }))).toBe('soft');
        expect(memoryVerdict(reading({ pageMiB: 2500, windowShown: false }))).toBe('soft');
        expect(memoryVerdict(reading({ pageMiB: 3700 }))).toBe('hard');
    });
    it('не чаще раза в 30 минут', () => {
        expect(memoryVerdict(reading({ pageMiB: 5000, sinceReloadMs: 29 * 60_000 }))).toBeNull();
        expect(memoryVerdict(reading({ pageMiB: 5000, sinceReloadMs: 31 * 60_000 }))).toBe('hard');
    });
    it('2 ГБ страницы на ПК с 16 ГБ — не повод для перезагрузки', () => {
        expect(memoryVerdict(reading({ pageMiB: 2037, playing: false }))).toBeNull();
    });
});
