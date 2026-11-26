// «Скачать» в меню правого клика: страница находит ссылку на аудио (ключ клиента и вход есть только у неё) и отдаёт её main,
// а тот спрашивает место, качает и пишет файл. Раздел страницы волны: installDownload и pickTranscoding уходят на страницу
// текстом вместе с волной (pageHelpers в wave.ts) и зовутся по голому имени, поэтому всё нужное внутри функций.
//
// Порядок источников как у scdl и soundcloud-dl: официальный файл автора (/tracks/{id}/download), потом поток из
// media.transcodings: progressive mp3, HLS mp3, HLS AAC (fMP4, лучший битрейт), в самом конце ABR-плейлист. Зашифрованные
// потоки (encrypted-hls, ctr-/cbc-encrypted-hls: Widevine/FairPlay) не трогаются: человеку честно говорится, что трек защищён.
// С конца 2025 SoundCloud почти не отдаёт progressive и HLS mp3: у обычного трека есть только aac_160k/aac_96k (HLS fMP4)
// и abr_sq (audio/mpegurl, мастер-плейлист). Прежний выбор принимал audio/mpegurl за mp3, брал abr_sq, получал 404 и сдавался
import type { WaveTrack } from '../waveTypes';

export interface Transcoding { url: string; protocol: 'progressive' | 'hls'; mime: string }
/** Запрос в main: ссылка уже проверена страницей, main проверяет её ещё раз */
export interface DownloadPayload { url: string; kind: 'file' | 'hls'; mime: string; title: string; artist: string; soft?: boolean }
export interface DownloadCore {
    lang: 'ru' | 'en';
    disposed(): boolean;
    /** GET api-v2 с правилами сайта (ключ клиента и вход подставляет сайт); null при сбое */
    get(url: string): Promise<unknown>;
    /** Отправка в main; null, если клиент без скачивания */
    send: ((payload: DownloadPayload) => Promise<unknown>) | null;
    showToast(text: string): void;
    /** Ход от main для карточки (место выбрано, доля 0..1): подписка, возвращает отписку. Нет — полоса без доли */
    onProgress?: ((callback: (update: unknown) => void) => () => void) | null;
    /** «Показать в папке»: main открывает проводник только для файла, который сам записал. Нет — кнопки нет */
    reveal?: ((file: string) => Promise<unknown>) | null;
}
export interface DownloadSection {
    /** Подпись пункта меню или null, если скачивать нечем */
    label(): string | null;
    run(track: WaveTrack): Promise<void>;
}

/** Лучший поток для скачивания из media.transcodings (all = true: все годные по убыванию предпочтения).
 *  Порядок: progressive mp3 → HLS mp3 → HLS AAC/fMP4 по битрейту → прочий открытый HLS → progressive не-mp3 → ABR (audio/mpegurl).
 *  Отрывки (snipped), зашифрованные потоки и адреса не с api-v2 не берутся. url без track_authorization: его добавляет вызывающий */
export function pickTranscoding(track: WaveTrack): Transcoding | null;
export function pickTranscoding(track: WaveTrack, all: true): Transcoding[];
export function pickTranscoding(track: WaveTrack, all?: boolean): Transcoding | null | Transcoding[] {
    const media = (track as { media?: { transcodings?: unknown } }).media;
    const list = Array.isArray(media?.transcodings) ? (media.transcodings as unknown[]) : [];
    const found: Array<Transcoding & { rank: number }> = [];
    for (const raw of list) {
        const item = raw as { url?: unknown; snipped?: unknown; preset?: unknown; quality?: unknown; format?: { protocol?: unknown; mime_type?: unknown } } | null;
        const url = item?.url;
        const protocol = item?.format?.protocol;
        if (item?.snipped === true || typeof url !== 'string' || !/^https:\/\/api-v2\.soundcloud\.com\/media\//.test(url)) continue;
        // Только открытые протоколы: encrypted-hls, ctr-encrypted-hls, cbc-encrypted-hls и прочие сюда не попадают
        if (protocol !== 'progressive' && protocol !== 'hls') continue;
        const mime = typeof item?.format?.mime_type === 'string' ? item.format.mime_type.toLowerCase() : '';
        const preset = typeof item?.preset === 'string' ? item.preset : '';
        // audio/mpegurl и x-mpegurl это сам плейлист (ABR, несколько качеств), а не mp3
        const playlist = /mpegurl/.test(mime) || /^abr/i.test(preset);
        const mp3 = !playlist && /audio\/(mpeg|mp3)/.test(mime);
        const aac = !playlist && /mp4|aac|m4a/.test(mime);
        const kbps = Number(/(\d+)k/i.exec(preset)?.[1]) || (item?.quality === 'hq' ? 256 : item?.quality === 'sq' ? 160 : 0);
        let rank: number;
        if (protocol === 'progressive' && mp3) rank = 600;
        else if (protocol === 'hls' && mp3) rank = 500;
        else if (protocol === 'hls' && aac) rank = 400;
        else if (protocol === 'hls' && !playlist) rank = 300;
        else if (protocol === 'progressive' && !playlist) rank = 200;
        else rank = 100;
        found.push({ url, protocol, mime, rank: rank + Math.min(kbps, 99) / 100 });
    }
    const ranked = found.sort((a, b) => b.rank - a.rank).map(({ url, protocol, mime }) => ({ url, protocol, mime }));
    return all ? ranked : ranked[0] ?? null;
}

export function installDownload(core: DownloadCore): DownloadSection {
    const ru = core.lang === 'ru';
    const API = 'https://api-v2.soundcloud.com';
    const text = {
        label: ru ? 'Скачать' : 'Download',
        preparing: ru ? 'Готовлю скачивание…' : 'Preparing download…',
        failed: ru ? 'Не удалось получить файл трека' : 'Couldn’t get the track file',
        protectedTrack: ru ? 'Этот трек правообладатель закрыл защитой: SoundCloud даёт его только слушать, не скачивать' : 'This track is protected by the rights holder: SoundCloud allows streaming only, not downloads',
        preview: ru ? 'SoundCloud отдаёт этот трек только отрывком: целиком его можно слушать с Go+' : 'SoundCloud only provides a preview of this track: the full version needs Go+',
        choose: ru ? 'Выберите, куда сохранить…' : 'Choose where to save…',
        downloading: ru ? 'Скачиваю' : 'Downloading',
        saved: ru ? 'Сохранено' : 'Saved',
        broken: ru ? 'Загрузка оборвалась: проверьте сеть и попробуйте ещё раз' : 'The download was interrupted: check your connection and try again',
        busy: ru ? 'Уже скачивается другой трек: дождитесь его' : 'Another track is downloading: wait for it to finish',
        reveal: ru ? 'Показать в папке' : 'Show in folder',
        retry: ru ? 'Повторить' : 'Try again',
        close: ru ? 'Закрыть' : 'Close',
        region: ru ? 'Скачивания' : 'Downloads',
        actions: ru ? 'Есть действия' : 'Actions available',
    };
    // Карточка скачивания (2.13.6): обложка, название и артист, тонкая полоса хода, потом «Сохранено» с «Показать в папке»
    // или понятная причина сбоя. Справа внизу над плеером, стекло как у меню; анимации только transform и opacity
    const CARD_CSS = [
        '#scw-dl-region{position:fixed;right:16px;bottom:var(--scw-dl-bottom,88px);z-index:2147483400;display:flex;flex-direction:column-reverse;gap:8px;width:min(340px,calc(100vw - 32px));pointer-events:none}',
        '.scw-dl{position:relative;display:grid;grid-template-columns:44px minmax(0,1fr) 24px;gap:0 12px;align-items:start;box-sizing:border-box;padding:10px 10px 10px 10px;border-radius:14px;' +
            'background:rgba(28,29,35,.84);-webkit-backdrop-filter:blur(22px) saturate(1.5);backdrop-filter:blur(22px) saturate(1.5);color:#fff;pointer-events:auto;' +
            'box-shadow:0 0 0 1px rgba(255,255,255,.08),inset 0 1px 0 rgba(255,255,255,.05),0 22px 50px -14px rgba(0,0,0,.7),0 6px 16px -6px rgba(0,0,0,.4);' +
            'font-size:13px;line-height:1.3;animation:scw-dl-in .2s cubic-bezier(.2,.9,.3,1) both}',
        '.scw-dl.out{animation:scw-dl-out .16s ease-in both}',
        '@keyframes scw-dl-in{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}',
        '@keyframes scw-dl-out{to{opacity:0;transform:translateY(6px) scale(.98)}}',
        '.scw-dl-art{position:relative;width:44px;height:44px;border-radius:9px;background:linear-gradient(135deg,#3a3d4a,#20222b);box-shadow:inset 0 0 0 1px rgba(255,255,255,.06)}',
        '.scw-dl-art img{display:block;width:100%;height:100%;border-radius:inherit;object-fit:cover}',
        '.scw-dl-art>svg{position:absolute;inset:12px;width:20px;height:20px;fill:rgba(255,255,255,.4)}',
        // Логотип установщика (setup/Setup.cs) поверх обложки, пока идёт скачивание: облако из 19 рёбрышек по 1px со свечением (тоньше в 44px не различить),
        // рёбрышки загораются слева направо по доле, без доли горят целиком и по ним бежит волна. Готово и сбой его убирают
        '.scw-dl-logo{position:absolute;inset:0;display:grid;place-items:center;border-radius:inherit;background:radial-gradient(80% 70% at 50% 85%,rgba(255,85,0,.3),transparent 70%),rgba(18,18,18,.76);transition:opacity .3s ease}',
        '.scw-dl-cloud{display:flex;align-items:flex-end;gap:1px;height:22px;margin-top:2px;filter:drop-shadow(0 0 4px rgba(255,85,0,.6));animation:scw-dl-drift 6.3s ease-in-out infinite alternate}',
        '.scw-dl-cloud i{display:block;width:1px;height:calc(var(--h) * 22px);border-radius:1px;background:#f50;transform-origin:50% 100%;opacity:var(--lit,1);transition:opacity .3s ease;' +
            'animation:scw-dl-sprout .5s cubic-bezier(.22,1,.36,1) calc(var(--i) * 25ms) backwards,scw-dl-eq 1.3s ease-in-out calc(var(--i) * -110ms) infinite alternate}',
        '@keyframes scw-dl-sprout{from{scale:1 0}}',
        '@keyframes scw-dl-eq{from{transform:scaleY(1)}to{transform:scaleY(.72)}}',
        '@keyframes scw-dl-drift{from{translate:-1.5px 0}to{translate:1.5px 0}}',
        '.scw-dl:not([data-state="working"]) .scw-dl-logo{opacity:0;pointer-events:none}',
        '.scw-dl[data-state="working"] .scw-dl-art>svg{opacity:0}',
        '.scw-dl:not([data-state="working"]) .scw-dl-cloud,.scw-dl:not([data-state="working"]) .scw-dl-cloud i{animation:none}',
        '.scw-dl-badge{position:absolute;right:-5px;bottom:-5px;display:none;place-items:center;width:20px;height:20px;border-radius:50%;box-shadow:0 0 0 2.5px rgba(28,29,35,1)}',
        '.scw-dl-badge svg{width:12px;height:12px;fill:#fff}',
        '.scw-dl[data-state="done"] .scw-dl-badge{display:grid;background:#2fbf71;animation:scw-dl-pop .26s cubic-bezier(.3,1.5,.5,1) both}',
        '.scw-dl[data-state="failed"] .scw-dl-badge{display:grid;background:#e5484d}',
        '@keyframes scw-dl-pop{from{opacity:0;transform:scale(.4)}to{opacity:1;transform:none}}',
        '.scw-dl-body{min-width:0;padding-top:2px}',
        '.scw-dl-title{overflow:hidden;font-size:13.5px;font-weight:600;white-space:nowrap;text-overflow:ellipsis}',
        '.scw-dl-sub{display:flex;gap:6px;margin-top:3px;color:rgba(255,255,255,.58);font-size:12px}',
        '.scw-dl-artist{min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}',
        '.scw-dl-status{flex:none;font-variant-numeric:tabular-nums}',
        '.scw-dl-status:not(:empty)::before{content:"·";margin-right:6px}',
        '.scw-dl:not([data-state="working"]) .scw-dl-sub{display:block}',
        '.scw-dl:not([data-state="working"]) .scw-dl-status{display:block;margin-top:3px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}',
        '.scw-dl:not([data-state="working"]) .scw-dl-status::before{content:none}',
        '.scw-dl[data-state="failed"] .scw-dl-status{color:#ffb4b4;white-space:normal}',
        '.scw-dl-bar{position:relative;height:3px;margin-top:9px;overflow:hidden;border-radius:2px;background:rgba(255,255,255,.1)}',
        '.scw-dl-bar i{position:absolute;inset:0;border-radius:inherit;background:var(--sc2-accent,#fff);transform:scaleX(0);transform-origin:left;transition:transform .25s ease-out}',
        '.scw-dl-bar.ind i{transform:translateX(-100%) scaleX(.4);transition:none;animation:scw-dl-ind 1.15s cubic-bezier(.45,0,.55,1) infinite}',
        '@keyframes scw-dl-ind{from{transform:translateX(-45%) scaleX(.4)}to{transform:translateX(100%) scaleX(.4)}}',
        '.scw-dl:not([data-state="working"]) .scw-dl-bar{display:none}',
        '.scw-dl-acts{display:none;gap:6px;margin-top:9px}',
        '.scw-dl-acts:has(button){display:flex}',
        '.scw-dl-btn{height:28px;padding:0 12px;border:0;border-radius:8px;background:rgba(255,255,255,.1);color:#fff;font:inherit;font-size:12.5px;font-weight:600;cursor:pointer;transition:background .12s}',
        '.scw-dl-btn:hover{background:rgba(255,255,255,.16)}',
        '.scw-dl-btn:focus-visible,.scw-dl-x:focus-visible{outline:2px solid rgba(255,255,255,.7);outline-offset:1px}',
        '.scw-dl-x{display:grid;place-items:center;width:24px;height:24px;margin:-2px -2px 0 0;padding:0;border:0;border-radius:7px;background:none;color:rgba(255,255,255,.45);cursor:pointer;transition:background .12s,color .12s}',
        '.scw-dl-x:hover{background:rgba(255,255,255,.09);color:#fff}',
        '.scw-dl-x svg{width:14px;height:14px;fill:currentColor}',
        '.scw-dl-live{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}',
        '@media (prefers-reduced-motion:reduce){.scw-dl,.scw-dl.out,.scw-dl-badge,.scw-dl-cloud,.scw-dl-cloud i{animation:none!important}.scw-dl-logo,.scw-dl-cloud i{transition:none}.scw-dl-bar i{transition:none}.scw-dl-bar.ind i{animation:none;transform:scaleX(.4)}}',
        'html.scm-reduce .scw-dl,html.scm-reduce .scw-dl.out,html.scm-reduce .scw-dl-badge,html.scm-reduce .scw-dl-cloud,html.scm-reduce .scw-dl-cloud i{animation:none!important}',
        'html.scm-reduce .scw-dl-bar.ind i{animation:none;transform:scaleX(.4)}',
    ].join('\n');
    const ICON = {
        note: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13.5 1.5v9.25a2.25 2.25 0 1 1-1.5-2.12V4.6L6.5 5.85v6.4a2.25 2.25 0 1 1-1.5-2.12V3.5z"/></svg>',
        check: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.4 10.9 13 4.3l1.4 1.4-8 8-4.4-4.4 1.4-1.4z"/></svg>',
        alert: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M7 3h2v6.5H7zM7 11h2v2H7z"/></svg>',
        close: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4.53 3.47 3.47 3.47 3.47-3.47 1.06 1.06L9.06 8l3.47 3.47-1.06 1.06L8 9.06l-3.47 3.47-1.06-1.06L6.94 8 3.47 4.53z"/></svg>',
    };
    interface Card {
        working(status: string, value?: number | null): void;
        done(file: string): void;
        fail(reason: string, retry?: () => void): void;
        dismiss(): void;
    }
    /** Карточка на странице; null без документа (тесты в node): тогда хватает обычной плашки */
    function makeCard(track: WaveTrack): Card | null {
        if (typeof document === 'undefined' || !document.body) return null;
        if (!document.getElementById('scw-dl-style')) {
            const style = document.createElement('style');
            style.id = 'scw-dl-style';
            style.textContent = CARD_CSS;
            (document.head ?? document.documentElement).append(style);
        }
        const make = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, content = ''): HTMLElementTagNameMap[K] => {
            const node = document.createElement(tag);
            node.className = className;
            if (content) node.textContent = content;
            return node;
        };
        let region = document.getElementById('scw-dl-region');
        if (!region) {
            region = make('div', '');
            region.id = 'scw-dl-region';
            region.setAttribute('role', 'region');
            region.setAttribute('aria-label', text.region);
            const live = make('div', 'scw-dl-live');
            live.setAttribute('aria-live', 'polite');
            region.append(live);
        }
        // В полном экране видно только полноэкранный узел; над плеером, где бы он ни был
        (document.fullscreenElement ?? document.body).append(region);
        const bar = document.fullscreenElement ? null : document.querySelector('.playControls')?.getBoundingClientRect();
        const lift = bar && bar.height > 0 && bar.top > 0 && bar.top < window.innerHeight ? window.innerHeight - bar.top + 12 : 16;
        region.style.setProperty('--scw-dl-bottom', Math.round(lift) + 'px');
        // Прежняя карточка (готово или сбой) уступает новой: скачивание всегда одно
        for (const old of region.querySelectorAll<HTMLElement>('.scw-dl')) old.remove();
        const live = region.querySelector<HTMLElement>('.scw-dl-live');
        const announce = (message: string): void => {
            if (live) live.textContent = message;
        };
        const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const node = make('div', 'scw-dl');
        node.dataset.state = 'working';
        const art = make('div', 'scw-dl-art');
        const cover = str(track.artwork_url) || str(track.user?.avatar_url);
        if (cover) {
            const img = make('img', '');
            img.alt = '';
            img.decoding = 'async';
            img.src = cover.replace(/-large(?=\.\w+(\?|$))/, '-t120x120');
            img.addEventListener('error', () => img.remove());
            art.append(img);
        } else art.insertAdjacentHTML('beforeend', ICON.note);
        // Облако из рёбрышек, как в установщике: высоты по профилю логотипа SoundCloud
        const CLOUD = [0.3, 0.36, 0.44, 0.4, 0.52, 0.48, 0.6, 0.7, 0.84, 0.94, 0.99, 1.0, 0.98, 0.92, 0.8, 0.74, 0.7, 0.62, 0.48];
        const logo = make('div', 'scw-dl-logo');
        logo.setAttribute('aria-hidden', 'true');
        const cloud = make('div', 'scw-dl-cloud');
        const ribs = CLOUD.map((h, i) => {
            const rib = make('i', '');
            rib.style.setProperty('--h', String(h));
            rib.style.setProperty('--i', String(i));
            cloud.append(rib);
            return rib;
        });
        logo.append(cloud);
        // Доля известна: рёбрышки слева направо загораются по ходу, погашенное светится на 30%. Нет доли: горят все
        const light = (share: number | null): void => {
            const done = share === null ? CLOUD.length : share * CLOUD.length;
            ribs.forEach((rib, i) => rib.style.setProperty('--lit', String(0.3 + 0.7 * Math.max(0, Math.min(1, done - i)))));
        };
        const badge = make('span', 'scw-dl-badge');
        art.append(logo, badge);
        const body = make('div', 'scw-dl-body');
        const title = str(track.title) || '…';
        const artist = str(track.publisher_metadata?.artist) || str(track.user?.username);
        const sub = make('div', 'scw-dl-sub');
        const status = make('span', 'scw-dl-status');
        if (artist) sub.append(make('span', 'scw-dl-artist', artist));
        sub.append(status);
        const progress = make('div', 'scw-dl-bar ind');
        progress.append(make('i', ''));
        progress.setAttribute('role', 'progressbar');
        progress.setAttribute('aria-label', title);
        const acts = make('div', 'scw-dl-acts');
        body.append(make('div', 'scw-dl-title', title), sub, progress, acts);
        const close = make('button', 'scw-dl-x');
        close.type = 'button';
        close.setAttribute('aria-label', text.close);
        close.title = text.close;
        close.insertAdjacentHTML('beforeend', ICON.close);
        node.append(art, body, close);
        region.append(node);
        // Готово и сбой уходят сами, но не пока на карточке мышь или фокус
        let timer: ReturnType<typeof setTimeout> | undefined;
        let ttl = 0;
        let held = false;
        const arm = (): void => {
            clearTimeout(timer);
            if (ttl && !held) timer = setTimeout(() => card.dismiss(), ttl);
        };
        const hold = (on: boolean): void => {
            held = on || node.matches(':hover') || node.contains(document.activeElement);
            arm();
        };
        node.addEventListener('pointerenter', () => hold(true));
        node.addEventListener('pointerleave', () => hold(false));
        node.addEventListener('focusin', () => hold(true));
        node.addEventListener('focusout', () => setTimeout(() => hold(false)));
        const button = (label: string, run: () => void): HTMLButtonElement => {
            const item = make('button', 'scw-dl-btn', label);
            item.type = 'button';
            item.addEventListener('click', run);
            return item;
        };
        const settle = (state: 'done' | 'failed', line: string, icon: string, ms: number): void => {
            node.dataset.state = state;
            status.textContent = line;
            badge.replaceChildren();
            badge.insertAdjacentHTML('beforeend', icon);
            acts.replaceChildren();
            ttl = ms;
        };
        let gone = false;
        const card: Card = {
            working: (line, value) => {
                if (gone) return;
                status.textContent = line;
                const known = typeof value === 'number' && Number.isFinite(value);
                progress.classList.toggle('ind', !known);
                const share = known ? Math.max(0, Math.min(1, value)) : 0;
                light(known ? share : null);
                progress.querySelector('i')!.style.transform = known ? 'scaleX(' + share + ')' : '';
                if (known) progress.setAttribute('aria-valuenow', String(Math.round(share * 100)));
                else progress.removeAttribute('aria-valuenow');
            },
            done: (file) => {
                if (gone) return;
                const name = file.split(/[\\/]/).pop() ?? '';
                settle('done', text.saved + (name ? ': ' + name : ''), ICON.check, 8000);
                const reveal = core.reveal;
                if (reveal) acts.append(button(text.reveal, () => {
                    void reveal(file).catch((error: unknown) => console.warn('Скачивание: папка не открылась', error));
                    card.dismiss();
                }));
                announce(text.saved + ': ' + title + (reveal ? '. ' + text.actions : ''));
                arm();
            },
            fail: (reason, retry) => {
                if (gone) return;
                settle('failed', reason, ICON.alert, 12000);
                if (retry) acts.append(button(text.retry, () => {
                    card.dismiss();
                    retry();
                }));
                announce(reason + (retry ? '. ' + text.actions : ''));
                arm();
            },
            dismiss: () => {
                if (gone) return;
                gone = true;
                clearTimeout(timer);
                // Фокус был в карточке: возвращается туда, где был до неё
                if (node.contains(document.activeElement) && before?.isConnected) before.focus({ preventScroll: true });
                const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('scm-reduce');
                if (reduce) {
                    node.remove();
                    return;
                }
                node.classList.add('out');
                node.addEventListener('animationend', () => node.remove(), { once: true });
                setTimeout(() => node.remove(), 400);
            },
        };
        close.addEventListener('click', () => card.dismiss());
        node.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                event.stopPropagation();
                card.dismiss();
            }
        });
        announce(text.preparing);
        return card;
    }
    const str = (value: unknown): string => (typeof value === 'string' ? value : '');
    const formats = (track: object): Array<{ protocol: string; snipped: boolean }> => {
        const list = (track as { media?: { transcodings?: unknown } }).media?.transcodings;
        return Array.isArray(list) ? list.map((raw) => {
            const item = raw as { snipped?: unknown; format?: { protocol?: unknown } } | null;
            return { protocol: str(item?.format?.protocol), snipped: item?.snipped === true };
        }) : [];
    };
    /** Почему потока нет: только зашифрованные (Widevine/FairPlay) или только отрывок. Это не сбой, а ограничение правообладателя */
    const why = (track: object): 'protected' | 'preview' | null => {
        const list = formats(track);
        if (list.some((item) => /encrypted/i.test(item.protocol))) return 'protected';
        if (list.length && list.every((item) => item.snipped)) return 'preview';
        return null;
    };
    let lastReason: 'protected' | 'preview' | null = null;
    // Трек из списков сайта часто без media и track_authorization: берём полный
    async function fullTrack(track: WaveTrack): Promise<{ media?: unknown; track_authorization?: unknown; downloadable?: unknown; has_downloads_left?: unknown } & WaveTrack> {
        const known = track as WaveTrack & { media?: unknown; track_authorization?: unknown };
        if (known.media && known.track_authorization) return known;
        const body = await core.get(API + '/tracks/' + track.id);
        return body && typeof body === 'object' ? { ...track, ...(body as object) } : known;
    }
    // Одна попытка не всегда доходит: ответ api-v2 иногда пустой или не успевает за 10 секунд
    async function getTwice(url: string): Promise<unknown> {
        const first = await core.get(url).catch(() => null);
        if (first || core.disposed()) return first;
        return core.get(url).catch(() => null);
    }
    const signed = (value: unknown): value is string => typeof value === 'string' && /^https:\/\//.test(value);
    /** Источники по порядку: официальный файл автора (если включён), потом до двух потоков. Все, кроме последнего, помечены soft:
     *  если источник не открылся до окна сохранения, main молчит и страница пробует следующий */
    async function payloadsOf(track: WaveTrack): Promise<DownloadPayload[]> {
        const full = await fullTrack(track);
        const title = str(full.title) || str(track.title);
        const meta = full.publisher_metadata?.artist;
        const artist = str(full.user?.username) || str(meta) || str(track.user?.username);
        const found: DownloadPayload[] = [];
        // Официальное скачивание, если автор его включил и попытки остались: исходник (wav, aiff, flac или mp3 автора)
        if (full.downloadable === true && full.has_downloads_left !== false) {
            const body = (await getTwice(API + '/tracks/' + track.id + '/download')) as { redirectUri?: unknown } | null;
            if (signed(body?.redirectUri)) found.push({ url: body.redirectUri, kind: 'file', mime: '', title, artist });
        }
        const auth = str(full.track_authorization);
        const candidates = pickTranscoding(full, true);
        lastReason = candidates.length ? null : why(full);
        let streams = 0;
        for (const item of candidates) {
            if (streams >= 2 || core.disposed()) break;
            // Ссылка на поток: api-v2 отвечает { url } с подписанным адресом на soundcloud.cloud или sndcdn.com
            const link = item.url + (auth ? (item.url.includes('?') ? '&' : '?') + 'track_authorization=' + encodeURIComponent(auth) : '');
            const body = (await getTwice(link)) as { url?: unknown } | null;
            if (!signed(body?.url)) continue;
            found.push({ url: body.url, kind: item.protocol === 'hls' ? 'hls' : 'file', mime: item.mime, title, artist });
            streams++;
        }
        return found.map((payload, index) => (index < found.length - 1 ? { ...payload, soft: true } : payload));
    }
    let running = false;
    return {
        label: () => (core.send ? text.label : null),
        run,
    };
    async function run(track: WaveTrack): Promise<void> {
        const send = core.send;
        if (!send || core.disposed() || running) return;
        running = true;
        const card = makeCard(track);
        // Без карточки (нет документа) хватает обычной плашки
        const fail = (reason: string, retry?: boolean): void => {
            if (card) card.fail(reason, retry ? () => void run(track) : undefined);
            else core.showToast(reason);
        };
        let unsubscribe: (() => void) | null = null;
        try {
            let payloads: DownloadPayload[] = [];
            lastReason = null;
            if (card) card.working(text.preparing);
            else core.showToast(text.preparing);
            try {
                payloads = await payloadsOf(track);
            } catch (error) {
                console.warn('Скачивание: ссылка на файл не получена', error);
            }
            if (core.disposed()) return card?.dismiss();
            if (!payloads.length) {
                // Защищённый трек и отрывок не исправить повтором; общий сбой — можно
                fail(lastReason === 'protected' ? text.protectedTrack : lastReason === 'preview' ? text.preview : text.failed, !lastReason);
                return;
            }
            // Ход от main: место выбрано, потом доля (полоса на значке панели задач та же)
            if (card && core.onProgress) {
                unsubscribe = core.onProgress((raw) => {
                    const update = raw as { phase?: unknown; value?: unknown } | null;
                    if (update?.phase === 'saving') card.working(text.downloading, 0);
                    else if (update?.phase === 'progress' && typeof update.value === 'number')
                        card.working(text.downloading + ' ' + Math.round(Math.max(0, Math.min(1, update.value)) * 100) + '%', update.value);
                });
            }
            card?.working(text.choose);
            // 'unreachable' значит, что источник не открылся до окна сохранения: пробуется следующий
            for (const payload of payloads) {
                const result = (await send(payload).catch((error: unknown) => {
                    console.warn('Скачивание: main не принял запрос', error);
                    return null;
                })) as { ok?: unknown; file?: unknown; reason?: unknown } | null;
                if (result?.reason === 'unreachable') continue;
                if (!card) return;
                if (result?.ok === true && typeof result.file === 'string') card.done(result.file);
                else if (result?.reason === 'cancelled') card.dismiss();
                else if (result?.reason === 'busy') card.fail(text.busy);
                else fail(text.broken, true);
                return;
            }
            fail(text.failed, true);
        } finally {
            unsubscribe?.();
            running = false;
        }
    }
}
