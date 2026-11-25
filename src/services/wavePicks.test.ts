import { describe, expect, it } from 'vitest';
import { consensusScore, lowQuality, pickSpaced, qualityScore } from './wavePicks';
import type { WaveCandidate, WaveTrack } from './waveTypes';

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

// Разнесение без свободных мест: повтор давнего исполнителя раньше повтора того, кто играл последним
describe('pickSpaced fallback', () => {
    const cand = (id: number, artist: number): WaveCandidate => ({
        track: { id, title: 'x' + id, user_id: artist, user: { id: artist, username: 'a' + artist }, duration: 200000 },
        reason: { kind: 'similar' },
    } as unknown as WaveCandidate);
    it('без свободных берёт того, чей конфликт с окном давнее', () => {
        // Окно: артист 1 был давно, артист 2 вчера. Все в пуле конфликтуют, но у 1 повтор давнее
        const pool = [cand(10, 2), cand(11, 1)];
        const recent = [['u:1'], ['u:2']];
        expect(pickSpaced(pool, 1, recent, 2)[0].track.id).toBe(11);
    });
    it('при равенстве остаётся порядок пула', () => {
        const pool = [cand(20, 3), cand(21, 3)];
        expect(pickSpaced(pool, 2, [['u:3']], 2).map((item) => item.track.id)).toEqual([20, 21]);
    });
    it('свободный трек по-прежнему идёт первым, даже если он позже в пуле', () => {
        const pool = [cand(30, 4), cand(31, 5)];
        expect(pickSpaced(pool, 1, [['u:4']], 2)[0].track.id).toBe(31);
    });
});
