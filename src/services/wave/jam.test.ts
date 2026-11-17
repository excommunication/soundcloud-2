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
    // Кнопка без подписи: число участников живёт только в бейдже на иконке
    const label = () => slot.querySelector('.scj-n')?.textContent;
    const chip = () => slot.querySelector<HTMLButtonElement>('.scj-chip')!;
    const members = (count: number) =>
        Array.from({ length: count }, (_, index) => ({ id: 'm' + index, name: 'u' + index, avatar: '', isHost: index === 0, canControl: false }));
    const live = (count: number) => {
        emit({ type: 'status', status: 'open' });
        emit({ type: 'state', state: { code: 'ABC123', members: members(count), queue: [], now: null, settings: { everyoneCanAdd: false, everyoneCanControl: false } }, you: 'm0', offset: 0, synced: true });
    };
    return { section, label, chip, live, emit };
}

describe('Джем: кнопка-иконка без подписи', () => {
    afterEach(() => {
        document.body.textContent = '';
    });

    it('в простое иконка без текста и без бейджа, смысл в подсказке и aria-label', () => {
        const { section, label, chip } = setup('ru');
        expect(label()).toBe('');
        expect(chip().textContent).toBe('');
        expect(chip().querySelector('svg')).not.toBeNull();
        expect(chip().classList.contains('live')).toBe(false);
        expect(chip().getAttribute('aria-label')).toBe('Слушать вместе с другом');
        expect(chip().title).toBe('Слушать вместе с другом (Ctrl+Shift+J)');
        section.dispose();
    });

    it('в простое по-английски', () => {
        const { section, chip } = setup('en');
        expect(chip().textContent).toBe('');
        expect(chip().getAttribute('aria-label')).toBe('Listen together with a friend');
        section.dispose();
    });

    it('при активном джеме на иконке бейдж с числом: считает всех участников, включая хозяина', () => {
        const { section, label, chip, live } = setup('ru');
        live(1);
        expect(label()).toBe('1');
        expect(chip().classList.contains('live')).toBe(true);
        live(3);
        expect(label()).toBe('3');
        expect(chip().textContent).toBe('3');
        expect(chip().getAttribute('aria-label')).toContain('Джем · 3');
        section.dispose();
    });

    it('после выхода бейдж пропадает', () => {
        const { section, label, chip, live, emit } = setup('en');
        live(2);
        expect(label()).toBe('2');
        emit({ type: 'status', status: 'idle' });
        expect(label()).toBe('');
        expect(chip().classList.contains('live')).toBe(false);
        expect(chip().getAttribute('aria-label')).toBe('Listen together with a friend');
        section.dispose();
    });

    it('в баре встаёт перед кнопкой эффектов, в правой группе', () => {
        const { section } = setup('ru');
        const bar = document.createElement('div');
        bar.className = 'playControls';
        bar.innerHTML = '<div class="scv" data-kind="bar"></div><button class="sca-fx"></button>';
        document.body.append(bar);
        section.sync();
        const kids = [...bar.children].map((node) => node.className);
        expect(kids.indexOf('scj-chip bar')).toBe(kids.indexOf('sca-fx') - 1);
        section.dispose();
    });
});
