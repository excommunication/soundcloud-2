import { describe, expect, it } from 'vitest';
import { JAM_MAX_ATTEMPTS, JamClient, parseSavedSession, type JamSavedSession, type JamSocket, type JamUiEvent } from './client';
import { addMember, newState } from './room';

const tail = <T>(list: T[]): T | undefined => list[list.length - 1];
const BASE = { http: 'https://sc2-jam.x.workers.dev', ws: 'wss://sc2-jam.x.workers.dev' };
const TOKEN = 'f'.repeat(48);
const SAVED: JamSavedSession = { code: 'ABC234', token: TOKEN, name: 'Me', avatar: '', server: BASE.http };

class FakeSocket implements JamSocket {
    sent: string[] = [];
    closed = false;
    onopen: ((event: unknown) => void) | null = null;
    onmessage: ((event: { data: unknown }) => void) | null = null;
    onclose: ((event: { code: number }) => void) | null = null;
    onerror: ((event: unknown) => void) | null = null;
    constructor(readonly url: string) {}
    send(data: string): void { this.sent.push(data); }
    close(): void { this.closed = true; }
    receive(msg: unknown): void { this.onmessage?.({ data: JSON.stringify(msg) }); }
}

function setup(initial: unknown = null, reachable: boolean | undefined = true) {
    const sockets: FakeSocket[] = [];
    const events: JamUiEvent[] = [];
    let disk: unknown = initial;
    const writes: unknown[] = [];
    const timers: Array<{ fn: () => void; ms: number; live: boolean }> = [];
    const client = new JamClient({
        connect: (url) => { const socket = new FakeSocket(url); sockets.push(socket); return socket; },
        post: async () => ({ status: 200, body: { code: 'ABC234', hostToken: TOKEN } }),
        now: () => 10000,
        random: () => 1,
        timers: { set: (fn, ms) => { const item = { fn, ms, live: true }; timers.push(item); return item; }, clear: (handle) => { (handle as { live: boolean }).live = false; } },
        saved: { load: () => disk, save: (value) => { disk = value; writes.push(value); } },
        reachable: reachable === undefined ? undefined : async () => reachable,
    }, (event) => events.push(event));
    const fire = (): void => { const next = timers.find((item) => item.live); if (next) { next.live = false; next.fn(); } };
    const hello = (socket: FakeSocket): void => {
        socket.receive({ t: 'hello', you: 'h', state: addMember(newState('ABC234'), { id: 'h', name: 'Me', avatar: '' }, true).state, serverNow: 15000 });
    };
    return { client, sockets, events, fire, hello, disk: () => disk, writes };
}
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('джем: запись комнаты на диске', () => {
    it('запись проверяется: код, токен, имя, аватарка; мусор отбрасывается', () => {
        expect(parseSavedSession(SAVED)).toEqual(SAVED);
        expect(parseSavedSession({ ...SAVED, avatar: 'https://evil.com/a.jpg' })?.avatar).toBe('');
        for (const bad of [null, 'x', [], { ...SAVED, code: 'bad' }, { ...SAVED, token: 'zz' }, { ...SAVED, name: '' }, { ...SAVED, server: 5 }]) expect(parseSavedSession(bad)).toBeNull();
        expect(parseSavedSession({ ...SAVED, token: '' })?.token).toBe('');
    });
    it('комната запоминается только после hello, не при самой попытке входа', async () => {
        const t = setup();
        await t.client.create(BASE, 'Me', '');
        expect(t.writes).toEqual([]);
        t.sockets[0].onopen?.({});
        t.hello(t.sockets[0]);
        expect(t.disk()).toEqual(SAVED);
        t.hello(t.sockets[0]);
        expect(t.writes).toHaveLength(1);
    });
    it('неверный код никогда не попадает на диск', () => {
        const t = setup();
        t.client.join(BASE, 'ABC234', 'Me', '');
        for (let i = 0; i <= JAM_MAX_ATTEMPTS; i++) { tail(t.sockets)!.onclose?.({ code: 1006 }); t.fire(); }
        expect(t.writes.filter((value) => value !== null)).toEqual([]);
    });
    it('перезапуск: restore возвращает в комнату с токеном хозяина и без шума', () => {
        const t = setup(SAVED);
        expect(t.client.restore(BASE)).toBe(true);
        expect(new URL(t.sockets[0].url).searchParams.get('token')).toBe(TOKEN);
        t.sockets[0].onopen?.({});
        t.hello(t.sockets[0]);
        expect(tail(t.events)).toMatchObject({ type: 'state', you: 'h' });
        expect(t.events.some((event) => event.type === 'error')).toBe(false);
    });
    it('restore: нечего восстанавливать, другой сервер или мусор', () => {
        expect(setup(null).client.restore(BASE)).toBe(false);
        const other = setup({ ...SAVED, server: 'https://other.workers.dev' });
        expect(other.client.restore(BASE)).toBe(false);
        expect(other.disk()).not.toBeNull();
        const junk = setup({ code: 1 });
        expect(junk.client.restore(BASE)).toBe(false);
        expect(junk.disk()).toBeNull();
    });
    it('закрытие приложения (suspend) запись сохраняет, «Выйти» стирает', () => {
        const t = setup(SAVED);
        t.client.restore(BASE);
        t.sockets[0].onopen?.({});
        t.hello(t.sockets[0]);
        t.client.suspend();
        expect(t.disk()).toEqual(SAVED);
        t.client.restore(BASE);
        t.client.leave();
        expect(t.disk()).toBeNull();
    });
    it('выгнали или комната истекла: запись стирается', () => {
        for (const code of [4000, 4001, 1013]) {
            const t = setup(SAVED);
            t.client.restore(BASE);
            t.sockets[0].onclose?.({ code });
            expect(t.disk()).toBeNull();
        }
    });
    it('комнаты на сервере больше нет: после попыток запись стирается молча', async () => {
        const t = setup(SAVED, true);
        t.client.restore(BASE);
        for (let i = 0; i <= JAM_MAX_ATTEMPTS; i++) { tail(t.sockets)!.onclose?.({ code: 1006 }); t.fire(); }
        await flush();
        expect(t.disk()).toBeNull();
        expect(tail(t.events)).toEqual({ type: 'status', status: 'idle' });
    });
    it('сервер недоступен (нет сети): запись остаётся, ошибки нет', async () => {
        const t = setup(SAVED, false);
        t.client.restore(BASE);
        for (let i = 0; i <= JAM_MAX_ATTEMPTS; i++) { tail(t.sockets)!.onclose?.({ code: 1006 }); t.fire(); }
        await flush();
        expect(t.disk()).toEqual(SAVED);
        expect(tail(t.events)).toEqual({ type: 'status', status: 'idle' });
    });
    it('связь пропала посреди джема надолго: запись остаётся для следующего запуска', () => {
        const t = setup(SAVED);
        t.client.restore(BASE);
        t.sockets[0].onopen?.({});
        t.hello(t.sockets[0]);
        for (let i = 0; i <= JAM_MAX_ATTEMPTS; i++) { tail(t.sockets)!.onclose?.({ code: 1006 }); t.fire(); }
        expect(tail(t.events)).toMatchObject({ status: 'idle', reason: 'network' });
        expect(t.disk()).toEqual(SAVED);
    });
    it('токен хозяина не попадает ни в снимок, ни в события для страницы', async () => {
        const t = setup();
        await t.client.create(BASE, 'Me', '');
        t.sockets[0].onopen?.({});
        t.hello(t.sockets[0]);
        expect(JSON.stringify([t.events, t.client.snapshot()])).not.toContain(TOKEN);
    });
});
