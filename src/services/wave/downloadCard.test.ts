/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WaveTrack } from '../waveTypes';
import { installDownload, type DownloadPayload } from './download';

const API = 'https://api-v2.soundcloud.com';
const AAC = 'audio/mp4; codecs="mp4a.40.2"';
const stream = { url: `${API}/media/soundcloud:tracks:7/aac_160k-hls/stream/hls`, preset: 'aac_160k', snipped: false, format: { protocol: 'hls', mime_type: AAC } };
const track = {
    id: 7, title: 'poochie gown', user: { username: 'Gunna' }, track_authorization: 'AUTH', artwork_url: 'https://i1.sndcdn.com/artworks-x-large.jpg',
    media: { transcodings: [stream] },
} as unknown as WaveTrack;

function setup(result: unknown) {
    let progress: ((update: unknown) => void) | null = null;
    let finish: (value: unknown) => void = () => undefined;
    const send = vi.fn((payload: DownloadPayload) => new Promise<unknown>((resolve) => { finish = () => resolve(payload ? result : result); }));
    const reveal = vi.fn(async () => true);
    const showToast = vi.fn();
    const unsubscribe = vi.fn();
    const section = installDownload({
        lang: 'ru', disposed: () => false, showToast, send, reveal,
        get: async (url) => (url === stream.url + '?track_authorization=AUTH' ? { url: 'https://playback.media-streaming.soundcloud.cloud/p.m3u8' } : null),
        onProgress: (callback) => {
            progress = callback;
            return unsubscribe;
        },
    });
    return { section, send, reveal, showToast, unsubscribe, progress: (update: unknown) => progress?.(update), finish: () => finish(result) };
}
const card = (): HTMLElement | null => document.querySelector('#scw-dl-region .scw-dl');
const status = (): string => card()?.querySelector('.scw-dl-status')?.textContent ?? '';
const flush = async (): Promise<void> => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
};

afterEach(() => {
    document.body.replaceChildren();
    document.head.replaceChildren();
});

describe('карточка скачивания', () => {
    it('обложка, название и артист; ход от main полосой; «Сохранено» с «Показать в папке»', async () => {
        const { section, send, reveal, showToast, unsubscribe, progress, finish } = setup({ ok: true, file: 'C:\\Music\\SoundCloud\\Gunna - poochie gown.m4a' });
        const running = section.run(track);
        // Сразу карточка, а не плашка; полоса бежит, пока доли нет
        expect(showToast).not.toHaveBeenCalled();
        expect(card()?.dataset.state).toBe('working');
        expect(card()?.querySelector('.scw-dl-title')?.textContent).toBe('poochie gown');
        expect(card()?.querySelector('.scw-dl-artist')?.textContent).toBe('Gunna');
        expect(card()?.querySelector('img')?.getAttribute('src')).toBe('https://i1.sndcdn.com/artworks-x-t120x120.jpg');
        expect(card()?.querySelector('.scw-dl-bar')?.classList.contains('ind')).toBe(true);
        expect(document.getElementById('scw-dl-region')?.getAttribute('role')).toBe('region');
        await flush();
        expect(send).toHaveBeenCalledOnce();
        expect(status()).toBe('Выберите, куда сохранить…');
        progress({ phase: 'saving', name: 'Gunna - poochie gown.m4a' });
        progress({ phase: 'progress', value: 0.42 });
        expect(status()).toBe('Скачиваю 42%');
        const bar = card()!.querySelector<HTMLElement>('.scw-dl-bar')!;
        expect(bar.classList.contains('ind')).toBe(false);
        expect(bar.getAttribute('aria-valuenow')).toBe('42');
        expect(bar.querySelector('i')!.style.transform).toBe('scaleX(0.42)');
        finish();
        await running;
        expect(unsubscribe).toHaveBeenCalled();
        expect(card()?.dataset.state).toBe('done');
        expect(status()).toBe('Сохранено: Gunna - poochie gown.m4a');
        expect(document.querySelector('.scw-dl-live')?.textContent).toBe('Сохранено: poochie gown. Есть действия');
        const show = card()!.querySelector<HTMLButtonElement>('.scw-dl-btn')!;
        expect(show.textContent).toBe('Показать в папке');
        show.click();
        expect(reveal).toHaveBeenCalledWith('C:\\Music\\SoundCloud\\Gunna - poochie gown.m4a');
        expect(card()?.classList.contains('out')).toBe(true);
    });
    it('сбой загрузки: понятная причина и «Повторить»; отмена в окне сохранения убирает карточку', async () => {
        const broken = setup({ ok: false, reason: 'failed' });
        const running = broken.section.run(track);
        await flush();
        broken.finish();
        await running;
        expect(card()?.dataset.state).toBe('failed');
        expect(status()).toMatch(/оборвалась/);
        expect(card()?.querySelector('.scw-dl-btn')?.textContent).toBe('Повторить');
        card()!.querySelector<HTMLButtonElement>('.scw-dl-x')!.click();
        expect(card()?.classList.contains('out')).toBe(true);
        document.body.replaceChildren();

        const cancelled = setup({ ok: false, reason: 'cancelled' });
        const again = cancelled.section.run(track);
        await flush();
        cancelled.finish();
        await again;
        expect(card()?.classList.contains('out')).toBe(true);
    });
    it('защищённый трек: причина без «Повторить», в main ничего не уходит', async () => {
        const drm = { ...track, media: { transcodings: [{ ...stream, format: { protocol: 'ctr-encrypted-hls', mime_type: AAC } }] } } as unknown as WaveTrack;
        const { section, send } = setup({ ok: true });
        await section.run(drm);
        expect(send).not.toHaveBeenCalled();
        expect(card()?.dataset.state).toBe('failed');
        expect(status()).toMatch(/защитой/);
        expect(card()?.querySelector('.scw-dl-btn')).toBeNull();
    });
});
