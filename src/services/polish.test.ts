import { describe, expect, it } from 'vitest';
import { appearanceCss, APPEARANCE_DEFAULTS } from './aurora';
import { HERO_QUIET, polishCss } from './polish';

describe('полировка «Сцена»', () => {
    const css = polishCss();
    it('идёт последней в оформлении', () => {
        const all = appearanceCss(APPEARANCE_DEFAULTS);
        expect(all.endsWith(polishCss({ hoverMotion: APPEARANCE_DEFAULTS.hoverMotion }))).toBe(true);
    });
    it('линия прогресса бара тонкая, градиентом обложки, ручка на наведении', () => {
        expect(css).toContain('.playbackTimeline__progressBar{background:linear-gradient(90deg,var(--sca-c1,#ff5500),var(--sca-c3,#ff9a52))!important');
        expect(css).toMatch(/progressHandle\{[^}]*scale:0;/);
        expect(css).toMatch(/:is\(:hover,:focus-visible,:active\) \.playbackTimeline__progressHandle[^{]*\{scale:1\}/);
        // Холст с точками снят
        expect(appearanceCss(APPEARANCE_DEFAULTS)).not.toContain('#sca-line{');
    });
    it('у значков бара и карточки нет колец', () => {
        expect(css).toMatch(/\.playbackSoundBadge__actions \.sc-button,[^{]*\{background:transparent!important;box-shadow:none!important/);
        expect(css).toMatch(/\.scw-meta \.scw-like,[^{]*\{background:transparent!important;box-shadow:none!important/);
        expect(css).toMatch(/scw-lyrics-toggle\[aria-pressed="true"\]\{[^}]*box-shadow:none!important/);
    });
    it('второстепенные кнопки карточки проявляются при наведении и фокусе, в покое не занимают места, на сенсоре видны всегда', () => {
        for (const item of HERO_QUIET) {
            expect(css).toContain('.scw-body:is(:hover,:focus-within) .scw-meta>' + item);
            expect(css).toContain('.scw-body:not(:hover):not(:focus-within) .scw-meta>' + item);
        }
        // Прячутся только там, где есть наведение: на сенсоре правило не действует
        expect(css).toMatch(/@media \(hover:hover\)\{[^}]*display:none!important\}/);
    });
    it('движение уважает «меньше движения» и настройку анимации наведения', () => {
        expect(css).toContain('html.scm-reduce body #sc-wave .scw-tile[data-track]');
        expect(css).toContain('@media (prefers-reduced-motion:reduce)');
        expect(polishCss({ hoverMotion: false })).not.toContain('translateY(-2px)');
        expect(css).toContain('translateY(-2px)');
        // Ни одного нового размытия подложки
        expect(css).not.toContain('backdrop-filter');
    });
});
