/**
 * @vitest-environment jsdom
 */
import { afterEach, expect, it } from 'vitest';
import { installDock } from './dock';
import { WAVE_TEXTS } from '../waveTexts';

afterEach(() => {
    document.body.innerHTML = '';
});

// Одно действие называется одинаково в доке бара, на полоске у строк и в меню трека (2.13.6: «Следующим» и «Волна от трека»
// расходились с «Слушать следующим» и «Волна по треку» в меню)
it.each(['ru', 'en'] as const)('подписи дока совпадают с пунктами меню трека (%s)', (lang) => {
    document.body.innerHTML = '<div class="playControls"><div class="playbackSoundBadge"><div class="playbackSoundBadge__actions"></div></div></div>';
    const dock = installDock({ lang, actOn: () => false, actsOn: () => [], disposed: () => false });
    const T = WAVE_TEXTS[lang];
    const label = (root: Element | null, act: string): string | null | undefined => root?.querySelector(`[data-act="${act}"]`)?.getAttribute('aria-label');
    const bar = document.querySelector('.scd-dock');
    expect(label(bar, 'dislike')).toBe(T.menuDislike);
    expect(label(bar, 'more')).toBe(T.more);
    expect(label(bar, 'wave')).toBe(T.menuWaveTrack);
    expect(label(bar, 'next')).toBe(T.menuQueueNext);
    expect(label(bar, 'drop')?.startsWith(T.menuDrop)).toBe(true);
    const quick = document.querySelector('.scd-quick');
    expect(label(quick, 'next')).toBe(T.menuQueueNext);
    expect(label(quick, 'last')).toBe(T.menuQueueLast);
    expect(label(quick, 'wave')).toBe(T.menuWaveTrack);
    dock.dispose();
});
