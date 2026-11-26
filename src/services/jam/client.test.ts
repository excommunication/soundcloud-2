import { describe, expect, it } from 'vitest';
import { JAM_MAX_ATTEMPTS, JamClient, backoffDelay, jamServerBase, type JamSocket, type JamUiEvent } from './client';
import { addMember, newState } from './room';

const tail = <T>(list: T[]): T | undefined => list[list.length - 1];

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
const BASE = { http: 'https://sc2-jam.x.workers.dev', ws: 'wss://sc2-jam.x.workers.dev' };

function setup(post: (url: string) => Promise<{ status: number; body: unknown }> = async () => ({ status: 200, body: { code: 'ABC234', hostToken: 'f'.repeat(48) } })) {
    const sockets: FakeSocket[] = [];
    const events: JamUiEvent[] = [];
    let clock = 10000;
    const timers: Array<{ fn: () => void; ms: number; live: boolean }> = [];
    const client = new JamClient({
        connect: (url) => { const socket = new FakeSocket(url); sockets.push(socket); return socket; },
        post,
        now: () => clock,
        random: () => 1,
        timers: { set: (fn, ms) => { const item = { fn, ms, live: true }; timers.push(item); return item; }, clear: (handle) => { (handle as { live: boolean }).live = false; } },
    }, (event) => events.push(event));
    const fire = (): void => { const next = timers.find((item) => item.live); if (next) { next.live = false; next.fn(); } };
    const hello = (socket: FakeSocket, you = 'h'): void => {
        const state = addMember(newState('ABC234'), { id: you, name: 'Me', avatar: '' }, true).state;
        socket.receive({ t: 'hello', you, state, serverNow: 15000 });
    };
    return { client, sockets, events, timers, fire, hello, advance: (ms: number) => { clock += ms; } };
}

describe('адрес сервера', () => {
    it('https и wss принимаются, путь сохраняется, лишнее нет', () => {
        expect(jamServerBase('https://sc2-jam.a.workers.dev')).toEqual({ http: 'https://sc2-jam.a.workers.dev', ws: 'wss://sc2-jam.a.workers.dev' });
        expect(jamServerBase(' wss://x.example.com/jam/ ')).toEqual({ http: 'https://x.example.com/jam', ws: 'wss://x.example.com/jam' });
        expect(jamServerBase('http://localhost:8787')).toEqual({ http: 'http://localhost:8787', ws: 'ws://localhost:8787' });
        for (const bad of ['', '   ', 'http://evil.com', 'ftp://x.com', 'https://u:p@x.com', 'https://x.com/?a=1', 'https://x.com/#a', 'не адрес', 5, 'https://' + 'a'.repeat(250)]) expect(jamServerBase(bad), String(bad)).toBeNull();
    });
});

describe('задержка переподключения', () => {
    it('растёт вдвое и упирается в 30 с, с разбросом', () => {
        expect([0, 1, 2, 3].map((n) => backoffDelay(n, 1))).toEqual([1000, 2000, 4000, 8000]);
        expect(backoffDelay(10, 1)).toBe(30000);
        expect(backoffDelay(0, 0)).toBe(600);
    });
});

describe('создание и вход', () => {
    it('создание: POST /rooms, затем сокет с токеном хозяина', async () => {
        const t = setup();
        const result = await t.client.create(BASE, 'Me', '');
        expect(result).toEqual({ ok: true, code: 'ABC234' });
        expect(t.sockets[0].url).toMatch(/^wss:\/\/sc2-jam\.x\.workers\.dev\/rooms\/ABC234\/ws\?name=Me&token=f{48}&cid=[0-9a-f]{16}$/);
    });
    it('сервер недоступен или ответил мусором: ошибка и тишина', async () => {
        expect(await setup(async () => { throw new Error('net'); }).client.create(BASE, 'Me', '')).toEqual({ ok: false, error: 'unreachable' });
        expect(await setup(async () => ({ status: 200, body: { code: 'bad', hostToken: 'x' } })).client.create(BASE, 'Me', '')).toEqual({ ok: false, error: 'unreachable' });
        expect(await setup(async () => ({ status: 503, body: null })).client.create(BASE, 'Me', '')).toEqual({ ok: false, error: 'busy' });
    });
    it('вход по коду: без токена, имя и аватарка в адресе экранируются', () => {
        const t = setup();
        expect(t.client.join(BASE, 'abc234', 'Вася & Ко', 'https://i1.sndcdn.com/a.jpg')).toEqual({ ok: true, code: 'ABC234' });
        const url = new URL(t.sockets[0].url);
        expect(url.searchParams.get('name')).toBe('Вася & Ко');
        expect(url.searchParams.get('token')).toBeNull();
        expect(t.client.join(BASE, '000000', 'x', '')).toEqual({ ok: false, error: 'invalid' });
    });
});

describe('соединение', () => {
    it('hello открывает комнату, события обновляют состояние, снимок отдаёт его странице', () => {
        const t = setup();
        t.client.join(BASE, 'ABC234', 'Me', '');
        t.sockets[0].onopen?.({});
        t.hello(t.sockets[0]);
        expect(tail(t.events)).toMatchObject({ type: 'state', you: 'h' });
        t.sockets[0].receive({ t: 'join', member: { id: 'a', name: 'A', avatar: '', isHost: false, canControl: false } });
        const last = tail(t.events);
        expect(last && last.type === 'state' && last.state.members.map((member) => member.id)).toEqual(['h', 'a']);
        expect(t.client.snapshot().map((event) => event.type)).toEqual(['status', 'state']);
    });
    it('мусор от сервера игнорируется', () => {
        const t = setup();
        t.client.join(BASE, 'ABC234', 'Me', '');
        t.sockets[0].onopen?.({});
        const before = t.events.length;
        t.sockets[0].onmessage?.({ data: 'не json' });
        t.sockets[0].receive({ t: 'boom' });
        expect(t.events.length).toBe(before);
    });
    it('send идёт только в открытое соединение', () => {
        const t = setup();
        t.client.join(BASE, 'ABC234', 'Me', '');
        expect(t.client.send({ t: 'pause' })).toBe(false);
        t.sockets[0].onopen?.({});
        t.hello(t.sockets[0]);
        expect(t.client.send({ t: 'pause' })).toBe(true);
        expect(tail(t.sockets[0].sent)).toBe('{"t":"pause"}');
    });
    it('часы: пять пингов, медиана смещения', () => {
        const t = setup();
        t.client.join(BASE, 'ABC234', 'Me', '');
        const socket = t.sockets[0];
        socket.onopen?.({});
        const offsets = [5000, 5002, 4998, 5001, 9000];
        for (const offset of offsets) {
            const ping = JSON.parse(tail(socket.sent)!) as { c: number };
            t.advance(100);
            socket.receive({ t: 'pong', c: ping.c, s: ping.c + 50 + offset });
            t.fire();
        }
        expect(t.client.serverOffset).toBe(5001);
        // pong на неизвестный ping не считается
        socket.receive({ t: 'pong', c: 1, s: 1e12 });
        expect(t.client.serverOffset).toBe(5001);
    });
});

describe('переподключение', () => {
    it('обрыв: статус reconnecting, попытки с растущей задержкой, успех сбрасывает счёт', () => {
        const t = setup();
        t.client.join(BASE, 'ABC234', 'Me', '');
        t.sockets[0].onopen?.({});
        t.hello(t.sockets[0]);
        t.sockets[0].onclose?.({ code: 1006 });
        expect(tail(t.events)).toMatchObject({ type: 'status', status: 'reconnecting', attempt: 1 });
        expect(tail(t.timers)?.ms).toBe(1000);
        t.fire();
        expect(t.sockets).toHaveLength(2);
        t.sockets[1].onclose?.({ code: 1006 });
        expect(tail(t.timers)?.ms).toBe(2000);
        t.fire();
        t.sockets[2].onopen?.({});
        t.hello(t.sockets[2]);
        t.sockets[2].onclose?.({ code: 1006 });
        expect(tail(t.timers)?.ms).toBe(1000);
    });
    it('комнаты нет: после лимита попыток сдаётся с причиной', () => {
        const t = setup();
        t.client.join(BASE, 'ABC234', 'Me', '');
        for (let i = 0; i <= JAM_MAX_ATTEMPTS; i++) {
            tail(t.sockets)!.onclose?.({ code: 1006 });
            t.fire();
        }
        expect(tail(t.events)).toMatchObject({ type: 'status', status: 'idle', reason: 'not-found' });
        expect(t.client.active).toBe(false);
    });
    it('выгнали, комната истекла, мест нет: без переподключения', () => {
        for (const [code, reason] of [[4001, 'kicked'], [4000, 'expired'], [1013, 'full']] as const) {
            const t = setup();
            t.client.join(BASE, 'ABC234', 'Me', '');
            t.sockets[0].onclose?.({ code });
            expect(tail(t.events)).toMatchObject({ status: 'idle', reason });
            expect(t.timers.filter((item) => item.live)).toEqual([]);
        }
        const t = setup();
        t.client.join(BASE, 'ABC234', 'Me', '');
        t.sockets[0].onopen?.({});
        t.hello(t.sockets[0]);
        t.sockets[0].receive({ t: 'kicked' });
        expect(tail(t.events)).toMatchObject({ status: 'idle', reason: 'kicked' });
    });
    it('выход закрывает сокет и гасит таймеры; обрыв старого сокета потом ничего не оживляет', () => {
        const t = setup();
        t.client.join(BASE, 'ABC234', 'Me', '');
        const old = t.sockets[0];
        old.onopen?.({});
        const stale = old.onclose;
        t.client.leave();
        expect(old.closed).toBe(true);
        expect(t.timers.filter((item) => item.live)).toEqual([]);
        stale?.({ code: 1006 });
        expect(t.timers.filter((item) => item.live)).toEqual([]);
        expect(t.client.snapshot()).toEqual([{ type: 'status', status: 'idle' }]);
    });
});
