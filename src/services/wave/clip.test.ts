import { describe, expect, it } from 'vitest';
import { CLIP_FONT } from './clipFont';
import { clipArtwork, clipBarLevels, clipBassLevel, clipCrop, clipLineAt, clipOutputSize, clipPseudoWave, clipRecordMime, clipRecordFormats, clipFailReason, clipNextStyle, clipSeekStep, clipSimpleText, clipTime, clipVolumeIcon, clipVolumeStep, verticalFrame } from './clip';

describe('режим «Для роликов»', () => {
    it('кадр 9:16 во всю высоту, в узком окне во всю ширину', () => {
        expect(verticalFrame(1920, 1080)).toEqual({ width: 608, height: 1080 });
        expect(verticalFrame(400, 1080)).toEqual({ width: 400, height: 711 });
        expect(verticalFrame(0, 1080)).toEqual({ width: 0, height: 0 });
    });
    it('крупная обложка вместо 500×500, чужие адреса как были', () => {
        expect(clipArtwork('https://i1.sndcdn.com/artworks-abc-t500x500.jpg')).toBe('https://i1.sndcdn.com/artworks-abc-original.jpg');
        expect(clipArtwork('https://i1.sndcdn.com/avatars-abc-t500x500.png?x=1')).toBe('https://i1.sndcdn.com/avatars-abc-original.png?x=1');
        expect(clipArtwork('https://example.test/a.jpg')).toBe('https://example.test/a.jpg');
        expect(clipArtwork('')).toBe('');
    });
    it('строка текста по времени: начавшаяся последней, до первой -1', () => {
        const lines = [{ at: 1000 }, { at: 3000 }, { at: 5000 }];
        expect(clipLineAt(lines, 0)).toBe(-1);
        expect(clipLineAt(lines, 1000)).toBe(0);
        expect(clipLineAt(lines, 4999)).toBe(1);
        expect(clipLineAt(lines, 90000)).toBe(2);
        expect(clipLineAt([], 500)).toBe(-1);
    });
    it('перемотка не выходит за начало и конец трека', () => {
        expect(clipSeekStep(10000, 60000, 5000)).toBe(15000);
        expect(clipSeekStep(2000, 60000, -5000)).toBe(0);
        expect(clipSeekStep(59000, 60000, 5000)).toBe(59750);
        expect(clipSeekStep(1000, 0, 5000)).toBe(0);
    });
    it('стили текста по кругу: поток, удар, без текста', () => {
        expect(clipNextStyle('flow')).toBe('punch');
        expect(clipNextStyle('punch')).toBe('off');
        expect(clipNextStyle('off')).toBe('flow');
        expect(clipNextStyle('')).toBe('flow');
    });
    it('время на нижней панели: м:сс, с часа ч:мм:сс', () => {
        expect(clipTime(0)).toBe('0:00');
        expect(clipTime(65400)).toBe('1:05');
        expect(clipTime(3723000)).toBe('1:02:03');
        expect(clipTime(NaN)).toBe('0:00');
        expect(clipTime(-500)).toBe('0:00');
    });
    it('значок и шаг громкости', () => {
        expect(clipVolumeIcon(0)).toBe('mute');
        expect(clipVolumeIcon(0.3)).toBe('volLow');
        expect(clipVolumeIcon(0.5)).toBe('vol');
        expect(clipVolumeStep(0.5, 0.05)).toBe(0.55);
        expect(clipVolumeStep(0.98, 0.05)).toBe(1);
        expect(clipVolumeStep(0.02, -0.05)).toBe(0);
        expect(clipVolumeStep(NaN, 0.05)).toBe(0.05);
    });
    it('уровни волны: бас слева, верх спектра справа, тишина даёт нули, значения в 0..1', () => {
        const freq = new Uint8Array(512);
        freq.fill(0);
        for (let k = 1; k <= 6; k++) freq[k] = 255;
        const bars = clipBarLevels(freq, 48000, 1024, 56);
        expect(bars).toHaveLength(56);
        expect(bars[0]).toBeGreaterThan(0.5);
        expect(bars[55]).toBe(0);
        expect(bars.every((v) => v >= 0 && v <= 1)).toBe(true);
        expect(clipBarLevels(new Uint8Array(512), 48000, 1024, 8)).toEqual(new Array(8).fill(0));
        expect(clipBarLevels([], 48000, 1024, 4)).toEqual([0, 0, 0, 0]);
    });
    it('бас для бита: энергия 40–160 Гц в квадрате', () => {
        const loud = new Uint8Array(512);
        loud.fill(255, 1, 8);
        expect(clipBassLevel(loud, 48000, 1024)).toBeGreaterThan(0.9);
        expect(clipBassLevel(new Uint8Array(512), 48000, 1024)).toBe(0);
        expect(clipBassLevel([], 48000, 1024)).toBe(0);
    });
    it('запасная волна одна и та же для одного трека и разная для разных', () => {
        const a = clipPseudoWave(42, 56);
        expect(a).toEqual(clipPseudoWave(42, 56));
        expect(a).not.toEqual(clipPseudoWave(43, 56));
        expect(a).toHaveLength(56);
        expect(a.every((v) => v > 0 && v <= 1)).toBe(true);
    });
    it('формат записи: MP4 с H.264 и AAC, потом любой MP4, потом WebM, иначе пусто', () => {
        expect(clipRecordMime(() => true)).toEqual({ mime: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', ext: 'mp4' });
        expect(clipRecordMime((t) => t === 'video/mp4')).toEqual({ mime: 'video/mp4', ext: 'mp4' });
        expect(clipRecordMime((t) => t.startsWith('video/webm'))).toEqual({ mime: 'video/webm;codecs=vp9,opus', ext: 'webm' });
        expect(clipRecordMime(() => false)).toEqual({ mime: '', ext: 'webm' });
    });
    it('форматы записи: все поддерживаемые по порядку, запасные WebM без аудиокодека', () => {
        expect(clipRecordFormats(() => false)).toEqual([]);
        expect(clipRecordFormats((t) => t === 'video/webm;codecs=vp8').map((f) => f.mime)).toEqual(['video/webm;codecs=vp8']);
        const all = clipRecordFormats(() => true);
        expect(all[0].ext).toBe('mp4');
        expect(all[all.length - 1]).toEqual({ mime: 'video/webm', ext: 'webm' });
        expect(all.map((f) => f.ext)).toEqual(['mp4', 'mp4', 'mp4', 'webm', 'webm', 'webm', 'webm', 'webm']);
    });
    it('причина отказа по имени ошибки', () => {
        expect(clipFailReason({ name: 'NotAllowedError' })).toBe('denied');
        expect(clipFailReason(new DOMException('x', 'NotFoundError'))).toBe('not-found');
        expect(clipFailReason({ name: 'NotReadableError' })).toBe('unavailable');
        expect(clipFailReason({ name: 'NotSupportedError' })).toBe('not-supported');
        expect(clipFailReason({ name: 'AbortError' })).toBe('aborted');
        expect(clipFailReason(new Error('boom'))).toBe('unknown');
        expect(clipFailReason(null)).toBe('unknown');
    });
    it('размер файла: длинная сторона 1920, стороны чётные', () => {
        expect(clipOutputSize(608, 1080)).toEqual({ width: 1080, height: 1920 });
        expect(clipOutputSize(1280, 720)).toEqual({ width: 1920, height: 1080 });
        expect(clipOutputSize(1000, 700)).toEqual({ width: 1920, height: 1344 });
        expect(clipOutputSize(0, 700)).toEqual({ width: 0, height: 0 });
    });
    it('вырез кадра: кадр по центру окна, снимок крупнее окна в полтора раза', () => {
        const crop = clipCrop(608, 1080, 1920, 1080, 2880, 1620);
        expect(crop).toEqual({ sx: 984, sy: 0, sw: 912, sh: 1620, width: 1080, height: 1920 });
        expect(clipCrop(1920, 1080, 1920, 1080, 1920, 1080)).toEqual({ sx: 0, sy: 0, sw: 1920, sh: 1080, width: 1920, height: 1080 });
        expect(clipCrop(608, 1080, 1920, 1080, 0, 0).sw).toBe(0);
    });
    it('шрифт «Удара» вшит: латиница и кириллица, woff2', () => {
        // woff2 начинается с сигнатуры «wOF2»
        expect(atob(CLIP_FONT.latin).slice(0, 4)).toBe('wOF2');
        expect(atob(CLIP_FONT.cyrillic).slice(0, 4)).toBe('wOF2');
    });
    it('упрощённая подача текста: только системное «Отключить анимации», режимы эффектов и флажок не влияют', () => {
        for (const mode of ['full', 'light', 'solid', 'off']) {
            expect(clipSimpleText(false, mode, false)).toBe(false);
            expect(clipSimpleText(true, mode, false)).toBe(false);
            expect(clipSimpleText(false, mode, true)).toBe(true);
            expect(clipSimpleText(true, mode, true)).toBe(true);
        }
    });
});
