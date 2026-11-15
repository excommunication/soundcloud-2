// «Для тебя»: карточки рекомендаций под блоком волны. Артисты, похожие на тех, кого ты лайкаешь чаще всего, но которых
// ты ещё не слушал (клик: волна по артисту), и персональные подборки SoundCloud (Daily Drops, Weekly Wave, Your Mix;
// клик: подборка играет по порядку, дальше похожее). Собирается один раз за сессию, когда главная видна.
// Раздел страницы волны: installForYou уходит на страницу текстом (pageHelpers в wave.ts) и зовёт помощников по голому имени
import * as wavePicks from '../wavePicks';
import type { RelatedArtist, ScMix } from './sources';
import type { Profile, Seed, WaveTrack } from '../waveTypes';

const { trackArtist } = wavePicks;

export interface ForYouCore {
    lang: 'ru' | 'en';
    disposed(): boolean;
    ensureProfile(): Promise<Profile>;
    relatedArtists(id: number): Promise<RelatedArtist[]>;
    scMixes(): Promise<ScMix[]>;
    tracksByIds(ids: number[]): Promise<WaveTrack[]>;
    isExcluded(track: WaveTrack): boolean;
    excludedArtist(id: number): boolean;
    startArtist(url: string, title: string): void;
    beginSeed(request: number, loaded: { seed: Seed; first: WaveTrack | null }): Promise<void>;
    nextSeedRequest(): number;
    paintArt(node: HTMLElement, url: string, key: string): void;
    artworkUrl(track: WaveTrack, size: 't300x300' | 't500x500'): string;
    showToast(text: string): void;
}
export interface ForYouSection {
    /** Поставить ряд после блока волны; без блока снимается */
    mount(section: HTMLElement | null): void;
    dispose(): void;
}

export function installForYou(core: ForYouCore): ForYouSection {
    const ru = core.lang === 'ru';
    const T = ru
        ? { title: 'Для тебя', artists: 'Артисты, которых ты ещё не слушал', mixes: 'Подборки SoundCloud', followers: (n: string) => n + ' подписчиков', play: 'Слушать', empty: 'В подборке нет доступных треков' }
        : { title: 'For you', artists: 'Artists you have not heard yet', mixes: 'SoundCloud mixes', followers: (n: string) => n + ' followers', play: 'Play', empty: 'No playable tracks in this mix' };
    let root: HTMLElement | null = null;
    let loading = false;
    let loaded = false;
    let artists: RelatedArtist[] = [];
    let mixes: Array<{ mix: ScMix; art: string[] }> = [];
    const compact = (n: number): string => (n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'K' : String(n));
    const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] => {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    };
    if (!document.getElementById('sc-foryou-style')) {
        const style = el('style', '');
        style.id = 'sc-foryou-style';
        style.textContent = [
            '#sc-foryou{margin:8px 0 40px 16px;color:var(--sc2-text,#fff)}',
            '#sc-foryou h2{font-size:24px;line-height:30px;font-weight:800;letter-spacing:-.4px;margin:0 0 4px}',
            '.scf-sub{font-size:13px;font-weight:600;color:var(--sc2-text-3,rgba(255,255,255,.5));margin:18px 0 10px}',
            '.scf-row{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(148px,1fr);gap:14px;overflow-x:auto;padding:4px 2px 12px;scrollbar-width:thin;scroll-snap-type:x proximity}',
            '#sc-foryou button{font:inherit;color:inherit;background:none;border:0;padding:0;cursor:pointer;text-align:left}',
            '#sc-foryou .scf-card{scroll-snap-align:start;display:flex;flex-direction:column;gap:3px;padding:10px;border-radius:var(--sc2-r3,16px);background:var(--sc2-panel,rgba(14,16,24,.5));backdrop-filter:var(--sc2-blur,blur(20px));-webkit-backdrop-filter:var(--sc2-blur,blur(20px));box-shadow:inset 0 0 0 1px var(--sc2-line,rgba(255,255,255,.09));transition:transform var(--sc2-mid,.24s) var(--sc2-ease,ease),box-shadow var(--sc2-mid,.24s);min-width:0}',
            '#sc-foryou .scf-card:hover{transform:translateY(-4px);box-shadow:0 22px 40px -22px rgba(0,0,0,.9),inset 0 0 0 1px rgba(255,255,255,.16)}',
            '.scf-card:focus-visible{outline:2px solid #fff;outline-offset:2px}',
            '.scf-art{position:relative;aspect-ratio:1;border-radius:var(--sc2-r2,12px);overflow:hidden;background:var(--sc2-surface-2,rgba(255,255,255,.08));margin-bottom:8px}',
            '.scf-art.round{border-radius:50%}',
            '.scf-art .scw-img{position:absolute;inset:0;background:center/cover;opacity:0;transition:opacity .25s,transform .5s var(--sc2-ease,ease)}',
            '.scf-art .scw-img.on{opacity:1}',
            '.scf-card:hover .scf-art .scw-img{transform:scale(1.06)}',
            '.scf-art.grid{display:grid;grid-template-columns:1fr 1fr}',
            '.scf-art.grid>span{position:relative}',
            '.scf-play{position:absolute;right:8px;bottom:8px;width:40px;height:40px;border-radius:50%;background:#fff;display:grid;place-items:center;opacity:0;transform:translateY(6px);transition:opacity .2s,transform .2s var(--sc2-ease,ease);box-shadow:0 8px 20px -6px rgba(0,0,0,.8)}',
            '.scf-play svg{width:16px;height:16px;fill:#0b0c10}',
            '.scf-card:hover .scf-play,.scf-card:focus-visible .scf-play{opacity:1;transform:none}',
            '.scf-name{font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
            '.scf-meta{font-size:12px;color:var(--sc2-text-3,rgba(255,255,255,.5));white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
            '.scf-card.wait .scf-art{animation:scf-wait 1.2s ease-in-out infinite alternate}',
            '@keyframes scf-wait{to{opacity:.5}}',
            'html.scm-reduce #sc-foryou *{animation:none!important;transition:none!important}',
        ].join('\n');
        document.head.append(style);
    }
    const PLAY = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11L13.5 8z"/></svg>';

    // Артисты: топ по лайкам → похожие на троих первых → без знакомых и скрытых, по подписчикам вперемешку
    async function loadArtists(profile: Profile): Promise<RelatedArtist[]> {
        const counts = new Map<number, number>();
        for (const track of profile.likedTracks.slice(0, 300)) {
            const id = trackArtist(track);
            if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
        }
        const seeds = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([id]) => id);
        const lists = await Promise.all(seeds.map((id) => core.relatedArtists(id).catch(() => [] as RelatedArtist[])));
        const seen = new Set<number>();
        const out: RelatedArtist[] = [];
        for (let i = 0; i < 12 && out.length < 12; i++) {
            for (const list of lists) {
                const artist = list[i];
                if (!artist || seen.has(artist.id) || profile.knownArtists.has(artist.id) || core.excludedArtist(artist.id) || !artist.url) continue;
                seen.add(artist.id);
                out.push(artist);
            }
        }
        return out.slice(0, 12);
    }
    async function loadMixes(): Promise<Array<{ mix: ScMix; art: string[] }>> {
        const list = (await core.scMixes().catch(() => [] as ScMix[])).slice(0, 8);
        return Promise.all(list.map(async (mix) => {
            const tracks = await core.tracksByIds(mix.ids.slice(0, 4)).catch(() => [] as WaveTrack[]);
            return { mix, art: tracks.map((track) => core.artworkUrl(track, 't300x300')).filter(Boolean) };
        }));
    }
    async function load(): Promise<void> {
        if (loading || loaded) return;
        loading = true;
        try {
            const profile = await core.ensureProfile();
            const [a, m] = await Promise.all([loadArtists(profile).catch(() => []), loadMixes().catch(() => [])]);
            artists = a;
            mixes = m;
            loaded = true;
        } catch (error) {
            console.warn('Для тебя: не собралось', error);
        } finally {
            loading = false;
            paint();
        }
    }
    async function playMix(mix: ScMix): Promise<void> {
        const tracks = (await core.tracksByIds(mix.ids.slice(0, 60)).catch(() => [] as WaveTrack[])).filter((track) => !core.isExcluded(track));
        if (!tracks.length) return core.showToast(T.empty);
        const request = core.nextSeedRequest();
        await core.beginSeed(request, { seed: { kind: 'group', title: mix.title, own: tracks.slice(1), tracks: tracks.slice(0, 5), order: 'fixed', mode: 'similar' }, first: tracks[0] });
    }
    function artistCard(artist: RelatedArtist): HTMLElement {
        const card = el('button', 'scf-card');
        card.type = 'button';
        card.title = artist.username;
        const art = el('div', 'scf-art round');
        if (artist.avatar) core.paintArt(art, artist.avatar.replace(/-large\./, '-t300x300.'), '');
        card.append(art, el('div', 'scf-name', artist.username), el('div', 'scf-meta', T.followers(compact(artist.followers))));
        card.addEventListener('click', () => artist.url && core.startArtist(artist.url, artist.username));
        return card;
    }
    function mixCard(item: { mix: ScMix; art: string[] }): HTMLElement {
        const card = el('button', 'scf-card');
        card.type = 'button';
        card.title = item.mix.title;
        const art = el('div', 'scf-art' + (item.art.length >= 4 ? ' grid' : ''));
        if (item.art.length >= 4) {
            for (const url of item.art.slice(0, 4)) {
                const cell = el('span', '');
                core.paintArt(cell, url, '');
                art.append(cell);
            }
        } else if (item.art[0]) core.paintArt(art, item.art[0].replace('t300x300', 't500x500'), '');
        const play = el('span', 'scf-play');
        play.insertAdjacentHTML('beforeend', PLAY);
        art.append(play);
        card.append(art, el('div', 'scf-name', item.mix.title), el('div', 'scf-meta', item.mix.ids.length + (ru ? ' треков' : ' tracks')));
        card.addEventListener('click', () => void playMix(item.mix));
        return card;
    }
    function waitRow(): HTMLElement {
        const row = el('div', 'scf-row');
        for (let i = 0; i < 6; i++) {
            const card = el('div', 'scf-card wait');
            card.append(el('div', 'scf-art'), el('div', 'scf-name', ' '), el('div', 'scf-meta', ' '));
            row.append(card);
        }
        return row;
    }
    function paint(): void {
        if (!root) return;
        root.textContent = '';
        root.append(el('h2', '', T.title));
        if (!loaded) {
            root.append(el('div', 'scf-sub', T.artists), waitRow());
            return;
        }
        if (artists.length) {
            const row = el('div', 'scf-row');
            for (const artist of artists) row.append(artistCard(artist));
            root.append(el('div', 'scf-sub', T.artists), row);
        }
        if (mixes.length) {
            const row = el('div', 'scf-row');
            for (const item of mixes) row.append(mixCard(item));
            root.append(el('div', 'scf-sub', T.mixes), row);
        }
        if (!artists.length && !mixes.length) root.remove();
    }
    return {
        mount(section) {
            if (!section?.parentElement) {
                root?.remove();
                return;
            }
            if (!root) {
                root = el('section', '');
                root.id = 'sc-foryou';
                root.setAttribute('aria-label', T.title);
                paint();
                // Не в первую секунду: сначала волна и сайт
                setTimeout(() => void load(), 1500);
            }
            if (loaded && !artists.length && !mixes.length) return;
            if (section.nextElementSibling !== root) section.after(root);
        },
        dispose() {
            root?.remove();
            root = null;
            document.getElementById('sc-foryou-style')?.remove();
        },
    };
}
