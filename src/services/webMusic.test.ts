import { expect, it } from 'vitest';
import { cleanTitle, findWebTracks } from './webMusic';

it('плейлисты и чарт Deezer дают треки по частоте, без мусора и кириллицы', async () => {
    const t = (artist: string, title: string, rank = 500000) => ({ title, title_short: title, rank, artist: { name: artist } });
    const responses: Record<string, unknown> = {
        'search/playlist?q=tiktok': { data: [{ id: 1, title: 'TikTok Hits 2026', nb_tracks: 60 }, { id: 2, title: 'Random', nb_tracks: 5 }, { id: 3, title: 'Viral TikTok', nb_tracks: 80 }] },
        'playlist/1/tracks': { data: [t('Artist A', 'Song A (feat. X)'), t('Artist B', 'Song B'), t('Кто-то', 'Песня')] },
        'playlist/3/tracks': { data: [t('Artist A', 'Song A'), t('Artist C', 'Song C (Slowed + Reverb)')] },
        'search/track?q=tiktok': { data: [t('Artist D', 'Song D', 900000)] },
        'chart/0/tracks': { data: [t('Artist E', 'Song E')] },
    };
    const asked: string[] = [];
    const getJson = async (url: string) => {
        asked.push(url);
        const key = Object.keys(responses).find((part) => url.includes(part));
        if (!key) throw new Error('нет ' + url);
        return responses[key];
    };
    const found = await findWebTracks(['tiktok'], getJson, { noRussian: true, raw: 'tiktok hits' });
    expect(found.tracks[0]).toBe('Artist A - Song A');
    expect(found.tracks).toEqual(expect.arrayContaining(['Artist B - Song B', 'Artist D - Song D', 'Artist E - Song E']));
    expect(found.tracks.some((item) => /Slowed|Песня/.test(item))).toBe(false);
    expect([...found.sources].sort()).toEqual(['TikTok Hits 2026', 'Viral TikTok', 'Чарт Deezer'].sort());
    expect(asked.some((url) => url.includes('playlist/2/'))).toBe(false);
    expect(cleanTitle('Song [Official Video] - Remastered 2011')).toBe('Song');
});
