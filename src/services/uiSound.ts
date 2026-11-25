// Звуки интерфейса (2.13.6): мягкий колокольчик на лайк и тихая деревянная нота на дизлайк вместо прежних «попа» и шумового
// «свайпа». Синтез Web Audio, без файлов: синус и пара слабых обертонов, атака 5 мс, экспоненциальный спад, срез верхов.
// createUiSound уходит на страницу текстом вместе с auroraPage (auroraScript), поэтому всё нужное объявлено внутри функции.
// Контекст один на всё, создаётся при первом звуке и закрывается через несколько секунд тишины: в покое ничего не работает

export type UiSoundName = 'like' | 'dislike';

export interface UiSoundOptions {
    /** Создать контекст; в тестах подменяется */
    create?: () => AudioContext;
    /** Звук сайта выключен: интерфейс тоже молчит */
    muted?: () => boolean;
    /** Через сколько мс тишины контекст закрывается */
    idleMs?: number;
}

export interface UiSound {
    play(name: UiSoundName): void;
    dispose(): void;
}

export function createUiSound(options: UiSoundOptions = {}): UiSound {
    // Нота: частота, сдвиг от начала звука (с), спад (с), громкость. Обертоны: множитель частоты, доля громкости, доля спада
    interface Note { freq: number; at: number; decay: number; gain: number }
    interface Overtone { ratio: number; level: number; decay: number }
    // 2.14: прежний колокольчик (ля–ми, 0,07) был громким и звонким. Теперь в духе «оплачено» на iPhone: две тихие
    // округлые ноты, плавная атака, почти без обертонов; второй синус чуть расстроен (+5 центов) и даёт тепло вместо звона
    const SOFT: Overtone[] = [
        { ratio: 1, level: 1, decay: 1 },
        { ratio: 1.003, level: 0.35, decay: 0.9 },
        { ratio: 2, level: 0.05, decay: 0.35 },
    ];
    // Дизлайк: до и соль ниже (кварта вниз), ещё тише и короче, без верхнего обертона
    const LOW: Overtone[] = [
        { ratio: 1, level: 1, decay: 1 },
        { ratio: 1.003, level: 0.3, decay: 0.9 },
    ];
    const SOUNDS: Record<UiSoundName, { overtones: Overtone[]; notes: Note[] }> = {
        like: {
            overtones: SOFT,
            notes: [
                { freq: 659.25, at: 0, decay: 0.32, gain: 0.03 },
                { freq: 987.77, at: 0.09, decay: 0.45, gain: 0.026 },
            ],
        },
        dislike: {
            overtones: LOW,
            notes: [
                { freq: 523.25, at: 0, decay: 0.18, gain: 0.024 },
                { freq: 392, at: 0.08, decay: 0.24, gain: 0.02 },
            ],
        },
    };
    /** Атака: 15 мс вместо щелчка в 5 мс — звук «вплывает» */
    const ATTACK = 0.015;
    const idleMs = options.idleMs ?? 4000;
    let ctx: AudioContext | null = null;
    let out: AudioNode | null = null;
    let idle: ReturnType<typeof setTimeout> | undefined;
    /** До какого времени контекста ещё звучат ноты */
    let ringsUntil = 0;

    function context(): AudioContext | null {
        try {
            if (!ctx) {
                ctx = options.create ? options.create() : new AudioContext();
                // Общий выход: срез верхов, чтобы ничего не звенело
                const tone = ctx.createBiquadFilter();
                tone.type = 'lowpass';
                tone.frequency.value = 2600;
                tone.connect(ctx.destination);
                out = tone;
            }
            if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
            return ctx;
        } catch {
            ctx = null;
            out = null;
            return null;
        }
    }
    function close(): void {
        clearTimeout(idle);
        idle = undefined;
        const was = ctx;
        ctx = null;
        out = null;
        ringsUntil = 0;
        if (was) void was.close().catch(() => undefined);
    }
    function tone(audio: AudioContext, target: AudioNode, freq: number, start: number, decay: number, peak: number): number {
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(peak, start + ATTACK);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + ATTACK + decay);
        osc.connect(gain);
        gain.connect(target);
        const end = start + ATTACK + decay + 0.02;
        osc.onended = () => {
            try {
                osc.disconnect();
                gain.disconnect();
            } catch {
                // уже снято
            }
        };
        osc.start(start);
        osc.stop(end);
        return end;
    }
    function play(name: UiSoundName): void {
        const sound = SOUNDS[name];
        if (!sound) return;
        try {
            if (options.muted?.()) return;
        } catch {
            // проверка не удалась: звук играет
        }
        const audio = context();
        if (!audio || !out) return;
        const now = audio.currentTime;
        const base = now + 0.01;
        for (const note of sound.notes) {
            for (const overtone of sound.overtones) {
                const freq = note.freq * overtone.ratio;
                if (freq > 6000) continue;
                ringsUntil = Math.max(ringsUntil, tone(audio, out, freq, base + note.at, note.decay * overtone.decay, note.gain * overtone.level));
            }
        }
        // Закрыть после того, как отзвучит самый длинный из звуков, а не только последний
        clearTimeout(idle);
        idle = setTimeout(close, Math.max(0, ringsUntil - now) * 1000 + idleMs);
    }
    return { play, dispose: close };
}
