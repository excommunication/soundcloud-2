import { describe, expect, it } from 'vitest';
import { findLyrics, geniusLyricsFromHtml, lyricsQuery, parseLrc, pickLrclib, syncedFor } from './lyricsService';

describe('lyricsQuery', () => {
    it('артист из названия, хвосты убраны', () => {
        expect(lyricsQuery('Deftones - Be Quiet and Drive (Far Away) [Official Audio]', 'uploader')).toEqual({ artist: 'Deftones', track: 'Be Quiet and Drive (Far Away)', retimed: false });
        expect(lyricsQuery('Walk Down (feat. 21 Savage)', 'Young Thug')).toEqual({ artist: 'Young Thug', track: 'Walk Down', retimed: false });
    });
    it('slowed помечается, таймкоды для него не нужны', () => {
        expect(lyricsQuery('pyro - slowed', 'Gbzin')).toMatchObject({ artist: 'Gbzin', retimed: true });
    });
});

it('parseLrc: строки по времени', () => {
    expect(parseLrc('[00:06.51] This town\n[01:02.5] I am\nбез метки')).toEqual([
        { at: 6510, text: 'This town' },
        { at: 62500, text: 'I am' },
    ]);
});

it('pickLrclib: нужен тот же трек, артист и длительность поднимают', () => {
    const items = [
        { trackName: 'Other', artistName: 'Deftones', duration: 300, plainLyrics: 'x' },
        { trackName: 'Be Quiet and Drive', artistName: 'Deftones', duration: 308, plainLyrics: 'words', syncedLyrics: '[00:01.00] a' },
    ];
    expect(pickLrclib(items, 'Deftones', 'Be Quiet And Drive', 307000)?.plainLyrics).toBe('words');
    expect(pickLrclib(items, 'Someone', 'Nothing', 0)).toBeNull();
});

it('geniusLyricsFromHtml: блоки текста без служебных вставок', () => {
    const html = '<div data-lyrics-container="true" class="x"><div data-exclude-from-selection="true"><span>12 Contributors</span></div>Line one<br/>Line &amp; two<div>nested</div></div><div>after</div>';
    expect(geniusLyricsFromHtml(html)).toBe('Line one\nLine & two\nnested'.replace('\nnested', 'nested'));
    expect(geniusLyricsFromHtml('<p>nothing</p>')).toBeNull();
});

it('findLyrics: LRCLIB с таймкодами, сеть с ошибкой не роняет', async () => {
    const synced = Array.from({ length: 5 }, (_, i) => `[00:0${i}.00] line ${i}`).join('\n');
    const found = await findLyrics(
        {
            getJson: async (url) => (url.includes('track_name') ? [{ trackName: 'Song', artistName: 'Artist', duration: 200, plainLyrics: 'p', syncedLyrics: synced }] : []),
            getText: async () => '',
        },
        { title: 'Artist - Song', uploader: 'x', durationMs: 200000 },
    );
    expect(found?.source).toBe('lrclib');
    expect(found?.synced?.length).toBe(5);
    const failed = await findLyrics({ getJson: async () => { throw new Error('offline'); }, getText: async () => '' }, { title: 'A - B', uploader: '', durationMs: 0 });
    expect(failed).toBeNull();
});

describe('таймкоды под загрузку (2.8.3)', () => {
    const lrc = Array.from({ length: 6 }, (_, i) => `[00:${String(10 + i * 5).padStart(2, '0')}.00] line ${i}`).join('\n');
    it('parseLrc: слова расширенного LRC, метки слов не попадают в текст', () => {
        expect(parseLrc('[00:01.00] <00:01.00> Hello <00:01.50> big <00:02.10> world')).toEqual([
            { at: 1000, text: 'Hello big world', words: [{ at: 1000, text: 'Hello' }, { at: 1500, text: 'big' }, { at: 2100, text: 'world' }] },
        ]);
    });
    it('другая длительность у обычной загрузки: без таймкодов, чтобы строки не отставали', () => {
        expect(syncedFor({ syncedLyrics: lrc, duration: 200 }, 201000, false)?.length).toBe(6);
        expect(syncedFor({ syncedLyrics: lrc, duration: 200 }, 212000, false)).toBeNull();
    });
    it('slowed: таймкоды растягиваются по отношению длительностей', () => {
        expect(syncedFor({ syncedLyrics: lrc, duration: 200 }, 250000, true)?.[0].at).toBe(12500);
    });
    it('findLyrics: точная запись /get раньше поиска, чужая версия из поиска даёт простой текст', async () => {
        const urls: string[] = [];
        const found = await findLyrics(
            {
                getJson: async (url) => {
                    urls.push(url);
                    if (url.includes('/get?')) throw new Error('404');
                    return [{ trackName: 'Song', artistName: 'Artist', duration: 260, plainLyrics: 'p', syncedLyrics: lrc }];
                },
                getText: async () => '',
            },
            { title: 'Artist - Song', uploader: 'x', durationMs: 200000 },
        );
        expect(urls[0]).toContain('/get?');
        expect(found?.plain).toBe('p');
        expect(found?.synced).toBeNull();
    });
});
