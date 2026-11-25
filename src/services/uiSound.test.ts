import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createUiSound } from './uiSound';

interface Ramp { kind: string; value: number; at: number }

function fakeContext() {
    const oscillators: Array<{ freq: number; type: string; start: number; stop: number; onended: (() => void) | null }> = [];
    const gains: Ramp[][] = [];
    const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });
    const ctx = {
        currentTime: 1,
        state: 'running' as AudioContextState,
        destination: node(),
        resume: vi.fn(() => Promise.resolve()),
        close: vi.fn(() => Promise.resolve()),
        createBiquadFilter: vi.fn(() => ({ ...node(), type: '', frequency: { value: 0 } })),
        createGain: vi.fn(() => {
            const ramps: Ramp[] = [];
            gains.push(ramps);
            return {
                ...node(),
                gain: {
                    setValueAtTime: (value: number, at: number) => ramps.push({ kind: 'set', value, at }),
                    exponentialRampToValueAtTime: (value: number, at: number) => ramps.push({ kind: 'exp', value, at }),
                },
            };
        }),
        createOscillator: vi.fn(() => {
            const osc = { freq: 0, type: '', start: 0, stop: 0, onended: null as (() => void) | null };
            oscillators.push(osc);
            return {
                ...node(),
                set type(value: string) {
                    osc.type = value;
                },
                frequency: { setValueAtTime: (value: number) => (osc.freq = value) },
                start: (at: number) => (osc.start = at),
                stop: (at: number) => (osc.stop = at),
                set onended(fn: () => void) {
                    osc.onended = fn;
                },
            };
        }),
    };
    return { ctx, oscillators, gains };
}

describe('uiSound', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('лайк: две тихие округлые ноты, синусы без резких верхов, плавная атака и спад до 0,55 с', () => {
        const fake = fakeContext();
        const create = vi.fn(() => fake.ctx as unknown as AudioContext);
        createUiSound({ create }).play('like');
        expect(create).toHaveBeenCalledTimes(1);
        expect(fake.oscillators.length).toBeGreaterThan(1);
        for (const osc of fake.oscillators) {
            expect(osc.type).toBe('sine');
            expect(osc.freq).toBeLessThanOrEqual(6000);
            expect(osc.freq).toBeLessThanOrEqual(2000);
            expect(osc.stop - osc.start).toBeLessThanOrEqual(0.55);
        }
        // Основные ноты: ми и си (квинта вверх), ниже прежних ля–ми
        expect(fake.oscillators.map((osc) => Math.round(osc.freq))).toEqual(expect.arrayContaining([659, 988]));
        for (const ramps of fake.gains) {
            const peak = Math.max(...ramps.map((ramp) => ramp.value));
            expect(peak).toBeLessThanOrEqual(0.03);
            const attack = ramps.find((ramp) => ramp.value === peak)!;
            expect(attack.at - ramps[0].at).toBeCloseTo(0.015, 4);
        }
    });

    it('дизлайк: ноты вниз, короче лайка', () => {
        const fake = fakeContext();
        createUiSound({ create: () => fake.ctx as unknown as AudioContext }).play('dislike');
        const main = fake.oscillators.filter((osc) => osc.freq < 1000).sort((a, b) => a.start - b.start);
        expect(main[0].freq).toBeGreaterThan(main[main.length - 1].freq);
        expect(Math.max(...fake.oscillators.map((osc) => osc.stop - osc.start))).toBeLessThan(0.5);
    });

    it('один контекст на все звуки, закрывается в тишине и создаётся заново по требованию', () => {
        const fake = fakeContext();
        const create = vi.fn(() => fake.ctx as unknown as AudioContext);
        const sound = createUiSound({ create, idleMs: 1000 });
        sound.play('like');
        sound.play('dislike');
        expect(create).toHaveBeenCalledTimes(1);
        vi.advanceTimersByTime(1500);
        expect(fake.ctx.close).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1000);
        expect(fake.ctx.close).toHaveBeenCalledTimes(1);
        sound.play('like');
        expect(create).toHaveBeenCalledTimes(2);
        sound.dispose();
        expect(fake.ctx.close).toHaveBeenCalledTimes(2);
    });

    it('уснувший контекст будится; выключенный звук сайта молчит и контекст не создаёт', () => {
        const fake = fakeContext();
        fake.ctx.state = 'suspended';
        const create = vi.fn(() => fake.ctx as unknown as AudioContext);
        let muted = true;
        const sound = createUiSound({ create, muted: () => muted });
        sound.play('like');
        expect(create).not.toHaveBeenCalled();
        muted = false;
        sound.play('like');
        expect(fake.ctx.resume).toHaveBeenCalled();
        expect(fake.oscillators.length).toBeGreaterThan(0);
    });

    it('нет Web Audio: тихо и без ошибок', () => {
        const sound = createUiSound({ create: () => { throw new Error('no audio'); } });
        expect(() => sound.play('like')).not.toThrow();
    });

    it('уходит на страницу текстом: без ссылок на внешние имена модуля', () => {
        const source = createUiSound.toString();
        const page = new Function(source + '\nreturn createUiSound;')() as typeof createUiSound;
        const fake = fakeContext();
        page({ create: () => fake.ctx as unknown as AudioContext }).play('like');
        expect(fake.oscillators.length).toBeGreaterThan(0);
    });
});
