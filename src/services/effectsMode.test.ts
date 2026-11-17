import { describe, expect, it } from 'vitest';
import { APPEARANCE_DEFAULTS } from './aurora';
import { effectiveAppearance, effectiveReduceMotion, effectsModeCss, isEffectsMode, normalizeEffectsMode } from './effectsMode';

describe('режим оформления', () => {
    it('узнаёт только известные режимы, остальное читает как «Полные»', () => {
        expect(['full', 'light', 'solid', 'off'].every(isEffectsMode)).toBe(true);
        expect(isEffectsMode('on')).toBe(false);
        expect(normalizeEffectsMode(undefined)).toBe('full');
        expect(normalizeEffectsMode('off')).toBe('off');
    });
    it('«Полные» не меняют оформление', () => {
        expect(effectiveAppearance({ ...APPEARANCE_DEFAULTS, effect: 'silk' }, 'full').effect).toBe('silk');
    });
    it('«Облегчённо» оставляет фон, но экономит', () => {
        const a = effectiveAppearance(APPEARANCE_DEFAULTS, 'light');
        expect(a.effect).toBe(APPEARANCE_DEFAULTS.effect);
        expect(a).toMatchObject({ quality: 'eco', parallax: false, hoverMotion: false, beat: 0 });
        expect(a.blur).toBeLessThanOrEqual(8);
    });
    it('«Без эффектов» выключает фон и размытие, не трогая сохранённую палитру', () => {
        const a = effectiveAppearance({ ...APPEARANCE_DEFAULTS, palette: 'sunset' }, 'off');
        expect(a).toMatchObject({ effect: 'off', blur: 0, parallax: false, palette: 'sunset' });
        expect(effectsModeCss('off')).toContain('backdrop-filter:none');
        expect(effectsModeCss('full')).toBe('');
    });
    it('«Супер лайт» даёт однотонный фон без WebGL и размытия', () => {
        const a = effectiveAppearance(APPEARANCE_DEFAULTS, 'solid');
        expect(a).toMatchObject({ effect: 'off', blur: 0, beat: 0 });
        expect(effectsModeCss('solid')).toContain('html{background:');
        expect(effectsModeCss('solid')).not.toContain('animation:none');
    });
    it('меньше анимаций включают и флажок, и режим', () => {
        expect(effectiveReduceMotion(false, 'full')).toBe(false);
        expect(effectiveReduceMotion(true, 'full')).toBe(true);
        expect(effectiveReduceMotion(false, 'off')).toBe(true);
    });
});
