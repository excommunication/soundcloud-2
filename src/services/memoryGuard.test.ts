import { describe, expect, it } from 'vitest';
import { memoryLimits, memoryVerdict, type MemoryReading } from './memoryGuard';

const reading = (extra: Partial<MemoryReading>): MemoryReading => ({ pageMiB: 500, totalMiB: 16384, playing: true, windowShown: true, sinceReloadMs: 3_600_000, ...extra });

describe('сторож памяти', () => {
    it('пороги зависят от памяти ПК и зажаты между 600 и 1100 МиБ', () => {
        expect(memoryLimits(32768)).toEqual({ soft: 1100, hard: 1870 });
        expect(memoryLimits(8192)).toEqual({ soft: 600, hard: 1020 });
        expect(memoryLimits(4096).soft).toBe(600);
        expect(memoryLimits(Number.NaN).soft).toBe(1100);
    });
    it('пока память в норме, ничего не делает', () => {
        expect(memoryVerdict(reading({ pageMiB: 800 }))).toBeNull();
        expect(memoryVerdict(reading({ pageMiB: 0 }))).toBeNull();
    });
    it('мягкий порог ждёт паузы или свёрнутого окна, жёсткий не ждёт', () => {
        expect(memoryVerdict(reading({ pageMiB: 1200 }))).toBeNull();
        expect(memoryVerdict(reading({ pageMiB: 1200, playing: false }))).toBe('soft');
        expect(memoryVerdict(reading({ pageMiB: 1200, windowShown: false }))).toBe('soft');
        expect(memoryVerdict(reading({ pageMiB: 1900 }))).toBe('hard');
    });
    it('не чаще раза в 10 минут', () => {
        expect(memoryVerdict(reading({ pageMiB: 3000, sinceReloadMs: 60_000 }))).toBeNull();
        expect(memoryVerdict(reading({ pageMiB: 3000, sinceReloadMs: 11 * 60_000 }))).toBe('hard');
    });
});
