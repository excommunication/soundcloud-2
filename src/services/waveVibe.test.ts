import { describe, expect, it } from 'vitest';
import { russianTrack, vibeExact, vibeLangOk, vibeRank, type VibeHit, type VibePlan } from './waveVibe';
import type { WaveTrack } from './waveTypes';

const track = (id: number, title: string, user = 'artist' + id, extra: Partial<WaveTrack> = {}): WaveTrack => ({
    id, kind: 'track', title, user_id: id, user: { id, username: user }, duration: 180000, policy: 'ALLOW', permalink_url: 'https://soundcloud.com/u' + id + '/t' + id, ...extra,
});
const plan = (extra: Partial<VibePlan> = {}): VibePlan => ({
    title: 't', queries: [], tags: [], tracks: [], artists: [], words: [], avoid: [], lang: 'any', popularity: 'balanced', fresh: false, source: 'local', ...extra,
});

describe('russianTrack', () => {
    it('кириллица в названии или нике это русское', () => {
        expect(russianTrack(track(1, 'Ночь'))).toBe(true);
        expect(russianTrack(track(2, 'Night', 'Мальчик'))).toBe(true);
        expect(russianTrack(track(3, 'Night', 'boy'))).toBe(false);
    });
    it('украинский и казахский без русских букв не русское', () => {
        expect(russianTrack(track(4, 'Їжак у тумані'))).toBe(false);
        expect(russianTrack(track(5, 'Қазақ әні'))).toBe(false);
        expect(russianTrack(track(6, 'Мы і ты'))).toBe(true);
    });
    it('метки русского рэпа на латинице', () => {
        expect(russianTrack(track(7, 'Track', 'x', { tag_list: '"Russian Rap" trap' }))).toBe(true);
        expect(russianTrack(track(8, 'Track', 'x', { genre: 'Русский рэп' }))).toBe(true);
    });
    it('инструментал не песня', () => {
        expect(russianTrack(track(9, 'Минусовка для рэпа'))).toBe(false);
    });
    it('vibeLangOk', () => {
        expect(vibeLangOk(track(1, 'Ночь'), 'noRu')).toBe(false);
        expect(vibeLangOk(track(1, 'Night'), 'noRu')).toBe(true);
        expect(vibeLangOk(track(1, 'Ночь'), 'ru')).toBe(true);
        expect(vibeLangOk(track(1, 'Ніч'), 'en')).toBe(false);
    });
});

describe('vibeRank', () => {
    const now = Date.parse('2026-11-15T00:00:00Z');
    it('хиты выше при popularity hits, андеграунд наоборот', () => {
        const big = track(1, 'Sad Night', 'a', { playback_count: 5_000_000, likes_count: 90_000 });
        const small = track(2, 'Sad Night', 'b', { playback_count: 3_000, likes_count: 120 });
        expect(vibeRank([small, big], new Map(), plan({ popularity: 'hits' }), now, 5)[0].id).toBe(1);
        expect(vibeRank([small, big], new Map(), plan({ popularity: 'underground' }), now, 5)[0].id).toBe(2);
    });
    it('точное совпадение с треком плана и частота находок поднимают', () => {
        const a = track(1, 'Song A', 'a', { playback_count: 1000 });
        const b = track(2, 'Song B', 'b', { playback_count: 1000 });
        const hits = new Map<number, VibeHit>([[2, { count: 1, exact: true, artist: false }]]);
        expect(vibeRank([a, b], hits, plan(), now, 5)[0].id).toBe(2);
    });
    it('отсекает avoid, Go+, чужой язык и запреты', () => {
        const list = [
            track(1, 'Song (slowed + reverb)'),
            track(2, 'Песня'),
            track(3, 'Snippet', 'c', { policy: 'SNIP' }),
            track(4, 'Fine'),
            track(5, 'Banned'),
        ];
        const ranked = vibeRank(list, new Map(), plan({ avoid: ['slowed'], lang: 'noRu' }), now, 10, (item) => item.id === 5);
        expect(ranked.map((item) => item.id)).toEqual([4, 1]);
    });
    it('не больше двух треков артиста и артист не подряд', () => {
        const list = [1, 2, 3].map((id) => track(id, 'S' + id, 'same', { user_id: 77, user: { id: 77, username: 'same' }, playback_count: 1e6 }));
        list.push(track(4, 'Other', 'other', { playback_count: 10 }));
        const ranked = vibeRank(list, new Map(), plan(), now, 10);
        expect(ranked.filter((item) => item.user_id === 77)).toHaveLength(2);
        expect(ranked[1].id).toBe(4);
    });
    it('свежесть', () => {
        const old = track(1, 'Old', 'a', { created_at: '2015-01-01T00:00:00Z' });
        const fresh = track(2, 'New', 'b', { created_at: '2026-10-01T00:00:00Z' });
        expect(vibeRank([old, fresh], new Map(), plan({ fresh: true }), now, 5)[0].id).toBe(2);
    });
});

describe('vibeExact', () => {
    it('артист и все слова названия', () => {
        expect(vibeExact(track(1, 'Apocalypse', 'Cigarettes After Sex'), 'Cigarettes After Sex - Apocalypse')).toBe(true);
        expect(vibeExact(track(1, 'Cigarettes After Sex - Apocalypse (Live)', 'fan'), 'Cigarettes After Sex - Apocalypse')).toBe(true);
        expect(vibeExact(track(1, 'Apocalypse', 'someone'), 'Cigarettes After Sex - Apocalypse')).toBe(false);
        expect(vibeExact(track(1, 'K.', 'Cigarettes After Sex'), 'Cigarettes After Sex - Apocalypse')).toBe(false);
    });
});
