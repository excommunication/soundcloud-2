import type { PlaybackCommand } from './playbackController';
import type { TranslationKeys } from './translationService';

/** Windows показывает под превью на панели задач не больше семи кнопок */
export const THUMBAR_LIMIT = 7;

export interface ThumbarSpec {
    command: PlaybackCommand;
    icon: 'backward' | 'play' | 'pause' | 'forward' | 'heart' | 'heart-filled';
    tooltip: TranslationKeys;
}

/** Набор кнопок превью: предыдущий, пауза/играть, следующий, лайк. Иконка и подсказка зависят от состояния */
export function buildThumbarSpecs(playing: boolean, liked: boolean): ThumbarSpec[] {
    const specs: ThumbarSpec[] = [
        { command: 'previous', icon: 'backward', tooltip: 'thumbPrev' },
        { command: 'toggle', icon: playing ? 'pause' : 'play', tooltip: playing ? 'thumbPause' : 'thumbPlay' },
        { command: 'next', icon: 'forward', tooltip: 'thumbNext' },
        { command: 'like', icon: liked ? 'heart-filled' : 'heart', tooltip: liked ? 'thumbUnlike' : 'thumbLike' },
    ];
    return specs.slice(0, THUMBAR_LIMIT);
}
