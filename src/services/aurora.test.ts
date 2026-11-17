import { describe, expect, it } from 'vitest';
import { APPEARANCE_DEFAULTS, AURORA_EFFECTS, appearanceCss, auroraScript, fragmentSource, isAppearance, normalizeAppearance, paletteColors, PALETTES } from './aurora';
import { validateSettingChange } from '../settings/validateSetting';

describe('оформление', () => {
    it('normalizeAppearance отбрасывает мусор и держит границы', () => {
        const value = normalizeAppearance({ effect: 'evil', palette: 'sunset', speed: 500, blur: 12.4, colors: ['#FFF', 'x', 1], hoverMotion: false });
        expect(value.effect).toBe(APPEARANCE_DEFAULTS.effect);
        expect(value.palette).toBe('sunset');
        expect(value.speed).toBe(APPEARANCE_DEFAULTS.speed);
        expect(value.blur).toBe(12);
        expect(value.colors).toEqual(APPEARANCE_DEFAULTS.colors);
        expect(value.hoverMotion).toBe(false);
    });
    it('isAppearance принимает только полный правильный объект; валидатор настроек тоже', () => {
        expect(isAppearance({ ...APPEARANCE_DEFAULTS })).toBe(true);
        expect(isAppearance({ ...APPEARANCE_DEFAULTS, speed: 101 })).toBe(false);
        expect(isAppearance({ ...APPEARANCE_DEFAULTS, beat: 0 })).toBe(true);
        expect(isAppearance({ ...APPEARANCE_DEFAULTS, extra: 1 })).toBe(false);
        expect(isAppearance({ effect: 'mesh' })).toBe(false);
        expect(validateSettingChange({ key: 'appearance', value: { ...APPEARANCE_DEFAULTS, effect: 'silk' } })).toBe(true);
        expect(validateSettingChange({ key: 'appearance', value: 'liquid' })).toBe(false);
    });
    it('палитры', () => {
        expect(paletteColors({ ...APPEARANCE_DEFAULTS, palette: 'ember' })).toEqual(PALETTES.ember);
        expect(paletteColors({ ...APPEARANCE_DEFAULTS, palette: 'custom', colors: ['#000000', '#111111', '#222222'] })).toEqual(['#000000', '#111111', '#222222']);
    });
    it('CSS: без эффекта фон сайта не прозрачный, с эффектом стекло и холст', () => {
        const off = appearanceCss({ ...APPEARANCE_DEFAULTS, effect: 'off' });
        expect(off).not.toContain('--background-base:transparent');
        const on = appearanceCss({ ...APPEARANCE_DEFAULTS, glass: 100, blur: 30 });
        expect(on).toContain('--background-base:transparent');
        expect(on).toContain('blur(30px)');
        expect(on).toContain('#sca-bg');
        expect(appearanceCss({ ...APPEARANCE_DEFAULTS, hoverMotion: false })).not.toContain('translateY(-3px)');
    });
    it('у каждого эффекта есть шейдер с main, скрипт несёт все эффекты', () => {
        for (const effect of AURORA_EFFECTS.filter((item) => item !== 'off')) {
            const source = fragmentSource(effect);
            expect(source).toContain('vec3 effect(');
            expect(source).toContain('void main()');
        }
        const script = auroraScript({ effect: 'nebula' });
        expect(script).toContain('function glowPalette');
        expect(script).toContain('"effect":"nebula"');
        expect(() => new Function(script)).not.toThrow();
    });
});

import { beatAmount, beatInit, beatStep, envelopeTempo } from './aurora';

describe('интенсивность бита', () => {
    it('кривая: 0 выключает, максимум прежний, середина мягче линейной, растёт монотонно', () => {
        expect(beatAmount(0)).toBe(0);
        expect(beatAmount(100)).toBe(1);
        expect(beatAmount(50)).toBeLessThan(0.5);
        expect(beatAmount(50)).toBeGreaterThan(0.25);
        expect(beatAmount(25)).toBeLessThan(0.25);
        for (let v = 1; v <= 100; v++) expect(beatAmount(v)).toBeGreaterThan(beatAmount(v - 1));
    });
    it('мусор и выход за границы не ломают множитель', () => {
        expect(beatAmount(-5)).toBe(0);
        expect(beatAmount(Number.NaN)).toBe(0);
        expect(beatAmount(250)).toBe(1);
    });
    it('умолчание заметно тише прежнего линейного 0.65; сохранённые значения проходят нормализацию как есть', () => {
        expect(APPEARANCE_DEFAULTS.beat).toBe(40);
        expect(beatAmount(APPEARANCE_DEFAULTS.beat)).toBeLessThan(0.3);
        expect(normalizeAppearance({ beat: 65 }).beat).toBe(65);
        expect(normalizeAppearance({ beat: 120 }).beat).toBe(APPEARANCE_DEFAULTS.beat);
        expect(normalizeAppearance({}).beat).toBe(40);
    });
    it('скрипт страницы несёт ту же кривую', () => {
        expect(auroraScript({}).includes('function beatAmount')).toBe(true);
    });
});

describe('бит', () => {
    const run = (bpm: number, seconds: number, beatAt = (t: number) => (t % (60000 / bpm)) < 90) => {
        const state = beatInit();
        let hits = 0;
        for (let t = 0; t < seconds * 1000; t += 16) if (beatStep(state, beatAt(t) ? 0.9 : 0.15, 0.5, t, 16)) hits++;
        return { state, hits };
    };
    it('находит удары и темп 120', () => {
        const { state, hits } = run(120, 10);
        expect(hits).toBeGreaterThanOrEqual(18);
        expect(state.bpm).toBeGreaterThan(112);
        expect(state.bpm).toBeLessThan(128);
    });
    it('медленный темп сводится в 80..170', () => {
        const { state } = run(60, 12);
        expect(state.bpm).toBeGreaterThan(110);
        expect(state.bpm).toBeLessThan(130);
    });
    it('бочка поверх гулкой бас-линии: слабые толчки между ударами не считаются, темп 128', () => {
        const state = beatInit();
        const period = 60000 / 128;
        const hits: number[] = [];
        for (let t = 0; t < 12000; t += 16) {
            const phase = t % period;
            const kick = phase < 120 ? 0.5 * Math.exp(-phase / 60) : 0;
            const off = Math.abs(phase - period / 2) < 30 ? 0.06 : 0;
            const line = 0.3 + 0.05 * Math.sin(t / 700);
            if (beatStep(state, line + kick + off, 0.5, t, 16)) hits.push(t);
        }
        // Удары только рядом с началом такта
        expect(hits.length).toBeGreaterThanOrEqual(22);
        expect(hits.every((t) => t % period < 60 || period - (t % period) < 20)).toBe(true);
        expect(state.bpm).toBeGreaterThan(122);
        expect(state.bpm).toBeLessThan(134);
    });
    it('пропущенный удар дорисовывается по темпу слабой вспышкой', () => {
        const state = beatInit();
        const period = 500;
        let pulseAtGap = 0;
        for (let t = 0; t < 9000; t += 16) {
            const muted = t >= 6000 && t < 6500;
            beatStep(state, !muted && t % period < 90 ? 0.9 : 0.15, 0.5, t, 16);
            if (t >= 6040 && t < 6200) pulseAtGap = Math.max(pulseAtGap, state.pulse);
        }
        expect(pulseAtGap).toBeGreaterThan(0.25);
    });
    it('ровный звук без ударов не даёт вспышек', () => {
        const { hits, state } = run(120, 8, () => false);
        expect(hits).toBeLessThanOrEqual(1);
        expect(state.bpm).toBe(0);
        expect(state.pulse).toBeLessThan(0.05);
    });
});

describe('envelopeTempo (2.8.1)', () => {
    const wave = (bpm: number): number[] => {
        const duration = 180000;
        const period = 60000 / bpm;
        return Array.from({ length: 1800 }, (_, i) => {
            const phase = ((i * duration) / 1800 % period) / period;
            return 60 + 40 * Math.exp(-phase * 5) + ((i * 7919) % 13);
        });
    };
    it('находит темп по форме волны', () => {
        for (const bpm of [100, 128, 140]) {
            const found = envelopeTempo(wave(bpm), 180000);
            expect(found).not.toBeNull();
            expect(Math.abs(60000 / (found?.period ?? 1) - bpm)).toBeLessThan(bpm * 0.06);
        }
    });
    it('ровная форма и короткие данные ритма не дают', () => {
        expect(envelopeTempo(new Array(1800).fill(80), 180000)).toBeNull();
        expect(envelopeTempo([1, 2, 3], 1000)).toBeNull();
    });
    it('детектор бита не залипает: удары идут весь трек', () => {
        const state = beatInit();
        let late = 0;
        for (let t = 0; t < 30000; t += 16) {
            const phase = (t % 469) / 469;
            const f = Math.min(1, 0.25 + 0.7 * Math.exp(-phase * 7));
            if (beatStep(state, f ** 3, 0.4, t, 16) && t > 20000) late++;
        }
        expect(late).toBeGreaterThan(15);
    });
});
