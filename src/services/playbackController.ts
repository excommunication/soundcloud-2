import type { WebContents } from 'electron';
export type PlaybackCommand = 'play' | 'pause' | 'toggle' | 'next' | 'previous' | 'like' | 'repeat';

export function executePageCommand(command: PlaybackCommand): boolean {
    const selectors = {
        play: '.playControls__play',
        pause: '.playControls__play',
        toggle: '.playControls__play',
        next: '.skipControl__next',
        previous: '.skipControl__previous',
        like: '.playbackSoundBadge__like',
        repeat: '.playControls .repeatControl',
    };
    const button = document.querySelector<HTMLElement>(selectors[command]);
    if (!button || button.getAttribute('aria-disabled') === 'true' || button.hasAttribute('disabled') || button.classList.contains('disabled')) return false;
    const playing = button.classList.contains('playing');
    if ((command === 'play' && playing) || (command === 'pause' && !playing)) return true;
    button.click();
    return true;
}

// Кнопка повтора на сайте крутит «выкл → очередь → трек → выкл». Нам нужен переключатель «повтор трека»:
// если он включён, один клик выключает, иначе жмём, пока не станет «трек» (не больше трёх раз)
export async function toggleRepeatOne(): Promise<boolean> {
    const find = () => document.querySelector<HTMLElement>('.playControls .repeatControl');
    const one = () => !!find()?.classList.contains('m-one');
    if (!find()) return false;
    for (let i = 0; i < 3; i++) {
        const wasOne = one();
        find()!.click();
        await new Promise((resolve) => setTimeout(resolve, 80));
        if (wasOne || one()) return true;
    }
    return one();
}

export class PlaybackController {
    constructor(private contents: WebContents) {}
    public async execute(command: PlaybackCommand): Promise<boolean> {
        if (this.contents.isDestroyed()) return false;
        if (command === 'repeat') return this.contents.executeJavaScript('(' + toggleRepeatOne.toString() + ')();');
        return this.contents.executeJavaScript(
            '(' + executePageCommand.toString() + ')(' + JSON.stringify(command) + ');',
        );
    }
}
