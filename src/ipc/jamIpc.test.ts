import { describe, expect, it, vi } from 'vitest';
import { FakeIpc, fakeEvent, trusting } from './fakeIpc.helper.test';
import { JAM_SERVER_DEFAULT, jamServerOf, registerJamIpc } from './jamIpc';
import type { JamClient } from '../services/jam/client';

function setup(setting: unknown = 'https://sc2-jam.x.workers.dev') {
    const ipc = new FakeIpc();
    const site = fakeEvent();
    const stranger = fakeEvent();
    const client = {
        create: vi.fn(async () => ({ ok: true as const, code: 'ABC234' })),
        join: vi.fn((_base: unknown, code: string) => ({ ok: true as const, code })),
        leave: vi.fn(),
        send: vi.fn(() => true),
        snapshot: vi.fn(() => []),
    };
    let buffer = 'старое';
    const clipboard = { writeText: vi.fn((text: string) => { buffer = text; }), readText: () => buffer };
    registerJamIpc(ipc, { trustedSite: trusting(site), client: client as unknown as JamClient, setting: () => setting, fallback: '', clipboard });
    return { ipc, site, stranger, client, clipboard };
}

describe('джем: мост к main', () => {
    it('вшитый адрес валиден, настройка важнее него', () => {
        expect(jamServerOf('')).not.toBeNull();
        expect(JAM_SERVER_DEFAULT.startsWith('https://')).toBe(true);
        expect(jamServerOf('', '')).toBeNull();
        expect(jamServerOf('', 'https://a.workers.dev')?.http).toBe('https://a.workers.dev');
        expect(jamServerOf('https://b.workers.dev', 'https://a.workers.dev')?.http).toBe('https://b.workers.dev');
        expect(jamServerOf('http://evil.com', '')).toBeNull();
    });
    it('повторная регистрация не задваивает обработчики', () => {
        const { ipc, client } = setup();
        registerJamIpc(ipc, { trustedSite: () => true, client: client as unknown as JamClient, setting: () => '' });
        expect([...ipc.handlers.keys()].sort()).toEqual(['jam:copy', 'jam:create', 'jam:join', 'jam:leave', 'jam:send', 'jam:snapshot']);
    });
    it('чужой отправитель отвергается везде', async () => {
        const { ipc, stranger, client } = setup();
        expect(await ipc.invoke('jam:create', stranger, 'x', '')).toEqual({ ok: false, error: 'invalid' });
        expect(await ipc.invoke('jam:join', stranger, 'ABC234', 'x', '')).toEqual({ ok: false, error: 'invalid' });
        expect(await ipc.invoke('jam:leave', stranger)).toBe(false);
        expect(await ipc.invoke('jam:send', stranger, { t: 'pause' })).toBe(false);
        expect(await ipc.invoke('jam:snapshot', stranger)).toBeNull();
        expect(await ipc.invoke('jam:copy', stranger, 'ABC234', 'code')).toBe(false);
        expect(client.create).not.toHaveBeenCalled();
        expect(client.send).not.toHaveBeenCalled();
    });
    it('сервер не настроен: понятный отказ, сеть не трогается', async () => {
        const { ipc, site, client } = setup('');
        expect(await ipc.invoke('jam:create', site, 'x', '')).toEqual({ ok: false, error: 'not-configured' });
        expect(await ipc.invoke('jam:join', site, 'ABC234', 'x', '')).toEqual({ ok: false, error: 'not-configured' });
        expect(client.create).not.toHaveBeenCalled();
        expect(await ipc.invoke('jam:snapshot', site)).toMatchObject({ configured: false });
    });
    it('имя и аватарка чистятся, код берётся и из ссылки', async () => {
        const { ipc, site, client } = setup();
        await ipc.invoke('jam:create', site, '  Вася\n', 'https://evil.com/a.jpg');
        expect(client.create).toHaveBeenCalledWith(expect.objectContaining({ ws: 'wss://sc2-jam.x.workers.dev' }), 'Вася', '');
        await ipc.invoke('jam:create', site, 42, 7);
        expect(client.create).toHaveBeenLastCalledWith(expect.anything(), 'SoundCloud', '');
        await ipc.invoke('jam:join', site, 'sc2://jam/abc234', 'Я', 'https://i1.sndcdn.com/a.jpg');
        expect(client.join).toHaveBeenCalledWith(expect.anything(), 'ABC234', 'Я', 'https://i1.sndcdn.com/a.jpg');
        expect(await ipc.invoke('jam:join', site, 'нет', 'Я', '')).toEqual({ ok: false, error: 'invalid' });
    });
    it('send: проверяется протоколом, ping от страницы не пускается', async () => {
        const { ipc, site, client } = setup();
        expect(await ipc.invoke('jam:send', site, { t: 'pause' })).toBe(true);
        expect(client.send).toHaveBeenCalledWith({ t: 'pause' });
        expect(await ipc.invoke('jam:send', site, { t: 'seek', positionMs: 'много' })).toBe(false);
        expect(await ipc.invoke('jam:send', site, { t: 'ping', c: 1 })).toBe(false);
        expect(await ipc.invoke('jam:send', site, 'мусор')).toBe(false);
        expect(client.send).toHaveBeenCalledTimes(1);
    });
    it('copy: в буфер попадает только код комнаты или ссылка sc2://jam/КОД', async () => {
        const { ipc, site, stranger, clipboard } = setup();
        expect(await ipc.invoke('jam:copy', site, 'abc234', 'code')).toBe(true);
        expect(clipboard.readText()).toBe('ABC234');
        expect(await ipc.invoke('jam:copy', site, 'ABC234', 'link')).toBe(true);
        expect(clipboard.readText()).toBe('sc2://jam/ABC234');
        const calls = clipboard.writeText.mock.calls.length;
        for (const bad of ['', 'ABC23', 'ABC2345', 'https://evil.com', 'sc2://jam/ABC234', 'ABC234 http://x', 'ABCOI0', 42, null]) {
            expect(await ipc.invoke('jam:copy', site, bad, 'code')).toBe(false);
        }
        expect(await ipc.invoke('jam:copy', site, 'ABC234', 'text')).toBe(false);
        expect(await ipc.invoke('jam:copy', stranger, 'ABC234', 'code')).toBe(false);
        expect(clipboard.writeText.mock.calls.length).toBe(calls);
        expect(clipboard.readText()).toBe('sc2://jam/ABC234');
    });
    it('copy: если буфер не принял запись, это false', async () => {
        const { ipc, site, clipboard } = setup();
        clipboard.writeText.mockImplementationOnce(() => undefined);
        expect(await ipc.invoke('jam:copy', site, 'ABC234', 'code')).toBe(false);
        clipboard.writeText.mockImplementationOnce(() => { throw new Error('нет'); });
        expect(await ipc.invoke('jam:copy', site, 'ABC234', 'code')).toBe(false);
    });
});
