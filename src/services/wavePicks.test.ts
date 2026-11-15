import { describe, expect, it } from 'vitest';
import { consensusScore, lowQuality, qualityScore } from './wavePicks';
import type { WaveTrack } from './waveTypes';

const NOW = Date.parse('2026-11-15T12:00:00Z');
const track = (plays: number | null, likes: number | null, daysAgo = 400): WaveTrack => ({
    id: 1,
    kind: 'track',
    playback_count: plays,
    likes_count: likes,
    created_at: new Date(NOW - daysAgo * 86400000).toISOString(),
});

describe('lowQuality', () => {
    it('отсекает старый перезалив без прослушиваний', () => {
        expect(lowQuality(track(300, 2), false, NOW)).toBe(true);
    });
    it('свежей загрузке хватает меньшего', () => {
        expect(lowQuality(track(300, 10, 5), false, NOW)).toBe(false);
    });
    it('знакомый артист и трек без счётчиков проходят', () => {
        expect(lowQuality(track(10, 0), true, NOW)).toBe(false);
        expect(lowQuality(track(null, null), false, NOW)).toBe(false);
    });
    it('ловит накрученные прослушивания', () => {
        expect(lowQuality(track(500000, 100), false, NOW)).toBe(true);
        expect(lowQuality(track(500000, 9000), false, NOW)).toBe(false);
    });
});

describe('qualityScore', () => {
    it('лайкаемый андеграунд выше раскрученного без лайков', () => {
        expect(qualityScore(track(5000, 800))).toBeGreaterThan(qualityScore(track(2000000, 4000)));
    });
    it('без счётчиков ноль', () => {
        expect(qualityScore(track(null, null))).toBe(0);
    });
});

describe('consensusScore', () => {
    it('два зерна весят больше одного, верх списка больше хвоста', () => {
        expect(consensusScore(2, 10, 50)).toBeGreaterThan(consensusScore(1, 0, 50));
        expect(consensusScore(1, 0, 50)).toBeGreaterThan(consensusScore(1, 49, 50));
        expect(consensusScore(0, 0, 50)).toBe(0);
    });
});
