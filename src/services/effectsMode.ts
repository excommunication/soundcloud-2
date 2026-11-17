// Режим оформления: «Полные эффекты», «Облегчённо», «Супер лайт» и «Без эффектов». Режим накладывается поверх настроек
// «Оформление» (они не стираются): при возврате на «Полные» человек получает свои эффект, палитру и ползунки.
import { normalizeAppearance, type Appearance } from './aurora';

export const EFFECTS_MODES = ['full', 'light', 'solid', 'off'] as const;
export type EffectsMode = (typeof EFFECTS_MODES)[number];
export const EFFECTS_MODE_DEFAULT: EffectsMode = 'full';

export function isEffectsMode(value: unknown): value is EffectsMode {
    return typeof value === 'string' && (EFFECTS_MODES as readonly string[]).includes(value);
}

/** Неизвестное значение из файла настроек читается как умолчание */
export function normalizeEffectsMode(value: unknown): EffectsMode {
    return isEffectsMode(value) ? value : EFFECTS_MODE_DEFAULT;
}

/** Оформление, которое реально рисуется: «Облегчённо» оставляет фон, но дёшево; «Без эффектов» гасит всё */
export function effectiveAppearance(input: unknown, mode: EffectsMode): Appearance {
    const appearance = normalizeAppearance(input);
    if (mode === 'light') {
        return { ...appearance, quality: 'eco', blur: Math.min(appearance.blur, 8), grain: 0, parallax: false, hoverMotion: false, beat: 0, likeSound: false };
    }
    if (mode === 'solid') {
        return { ...appearance, effect: 'off', quality: 'eco', blur: 0, grain: 0, parallax: false, hoverMotion: false, beat: 0, likeSound: false, calmOnPause: true };
    }
    if (mode === 'off') {
        return { ...appearance, effect: 'off', blur: 0, grain: 0, parallax: false, hoverMotion: false, beat: 0, likeSound: false, calmOnPause: true };
    }
    return appearance;
}

/** «Меньше анимаций» включают и сам флажок, и режимы «Облегчённо» и «Без эффектов» */
export function effectiveReduceMotion(reduceMotion: boolean, mode: EffectsMode): boolean {
    return reduceMotion || mode !== 'full';
}

/** Дополнительный CSS: в режиме «Без эффектов» ни размытия, ни переходов, ни анимаций, фон простой тёмный */
export function effectsModeCss(mode: EffectsMode): string {
    if (mode === 'solid') {
        // Один спокойный цвет вместо анимации: тёмная основа с лёгким оттенком акцента, без размытия и WebGL
        return [
            '*,*::before,*::after{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}',
            'html{background:color-mix(in srgb,var(--sca-c1,#3a6bff) 16%,#121212)!important}',
            '#sca-bg{display:none!important}',
        ].join('\n');
    }
    if (mode !== 'off') return '';
    return [
        '*,*::before,*::after{animation:none!important;transition:none!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}',
        'html{background:#121212!important}',
        '#sca-bg{display:none!important}',
    ].join('\n');
}
