// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { installJam } from './jam';

function setup(lang: 'ru' | 'en') {
    let emit: (event: unknown) => void = () => undefined;
    const api = {
        create: async () => ({ ok: true }),
        join: async () => ({ ok: true }),
        leave: async () => undefined,
        send: async () => undefined,
        snapshot: async () => null,
        onState: (callback: (event: unknown) => void) => {
            emit = callback;
            return () => undefined;
        },
    };
    const section = installJam({ lang, disposed: () => false, api: () => api, current: () => null, seek: () => undefined, setPlaying: () => undefined });
    const slot = document.createElement('div');
    document.body.append(slot);
    section.mount(slot);
    const label = () => slot.querySelector('.scj-n')?.textContent;
    const members = (count: number) =>
        Array.from({ length: count }, (_, index) => ({ id: 'm' + index, name: 'u' + index, avatar: '', isHost: index === 0, canControl: false }));
    const live = (count: number) => {
        emit({ type: 'status', status: 'open' });
        emit({ type: 'state', state: { code: 'ABC123', members: members(count), queue: [], now: null, settings: { everyoneCanAdd: false, everyoneCanControl: false } }, you: 'm0', offset: 0, synced: true });
    };
    return { section, label, live, emit };
}

describe('Джем: подпись кнопки', () => {
    afterEach(() => {
        document.body.textContent = '';
    });

    it('в простое показывает только короткую подпись, без числа', () => {
        const { section, label } = setup('ru');
        expect(label()).toBe('С другом');
        section.dispose();
    });

    it('в простое по-английски', () => {
        const { section, label } = setup('en');
        expect(label()).toBe('Together');
        section.dispose();
    });

    it('при активном джеме: «Джем · N», N считает всех участников, включая хозяина', () => {
        const { section, label, live } = setup('ru');
        live(1);
        expect(label()).toBe('Джем · 1');
        live(3);
        expect(label()).toBe('Джем · 3');
        expect(label()).not.toMatch(/-/);
        section.dispose();
    });

    it('после выхода возвращается короткая подпись', () => {
        const { section, label, live, emit } = setup('en');
        live(2);
        expect(label()).toBe('Jam · 2');
        emit({ type: 'status', status: 'idle' });
        expect(label()).toBe('Together');
        section.dispose();
    });
});
