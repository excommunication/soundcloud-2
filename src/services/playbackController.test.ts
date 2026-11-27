// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { executePageCommand, toggleRepeatOne } from './playbackController';
afterEach(() => {
    document.body.innerHTML = '';
});
it('play и pause не превращаются в противоположное действие', () => {
    document.body.innerHTML = '<button class="playControls__play playing"></button>';
    const button = document.querySelector('button')!;
    const click = vi.fn();
    button.addEventListener('click', click);
    expect(executePageCommand('play')).toBe(true);
    expect(click).not.toHaveBeenCalled();
    executePageCommand('pause');
    expect(click).toHaveBeenCalledTimes(1);
    button.classList.remove('playing');
    executePageCommand('pause');
    expect(click).toHaveBeenCalledTimes(1);
});
it('отсутствующая или недоступная кнопка не считается успешной командой', () => {
    expect(executePageCommand('next')).toBe(false);
    document.body.innerHTML = '<button class="skipControl__next" disabled></button>';
    expect(executePageCommand('next')).toBe(false);
});

it('повтор трека включается перебором режимов кнопки сайта и выключается одним кликом', async () => {
    document.body.innerHTML = '<div class="playControls"><button class="repeatControl"></button></div>';
    const button = document.querySelector<HTMLElement>('.repeatControl')!;
    const modes = ['m-all', 'm-one', ''];
    let index = -1;
    button.addEventListener('click', () => {
        index = (index + 1) % modes.length;
        button.className = 'repeatControl ' + modes[index];
    });
    expect(await toggleRepeatOne()).toBe(true);
    expect(button.classList.contains('m-one')).toBe(true);
    expect(await toggleRepeatOne()).toBe(true);
    expect(button.classList.contains('m-one')).toBe(false);
});

it('без кнопки повтора возвращает false', async () => {
    document.body.innerHTML = '';
    expect(await toggleRepeatOne()).toBe(false);
});
