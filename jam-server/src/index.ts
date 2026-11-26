// Сервер «Джемов» SoundCloud 2: Cloudflare Worker + по одному Durable Object на комнату, WebSocket с гибернацией.
// Вся логика комнаты в ../../src/services/jam/room.ts (чистые функции, там же тесты), протокол в protocol.ts.
// Сервер не знает ни аккаунтов, ни токенов SoundCloud: имя, аватарка, ссылки на треки. Комната живёт, пока в ней
// была активность за последние 7 суток (JAM_LIMITS.idleMs) или есть хоть одно соединение; потом alarm стирает всё хранилище.
import { DurableObject } from 'cloudflare:workers';
import { JAM_LIMITS, cleanAvatar, cleanName, makeCode, parseClientMsg, parseCode, type JamServerMsg, type JamState } from '../../src/services/jam/protocol';
import { addMember, memberOf, newState, pruneMembers, reduce, removeMember, shouldExpire } from '../../src/services/jam/room';

interface Env {
    JAM_ROOM: DurableObjectNamespace<JamRoom>;
}
interface Stored {
    code: string;
    hostToken: string;
    state: Omit<JamState, 'queue'>;
}
interface Attachment {
    id: string;
    cid?: string;
}

function hex(bytes: Uint8Array): string {
    return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
function random(n: number): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(n));
}
function same(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}
function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);
        if (request.method === 'POST' && url.pathname === '/rooms') {
            // Код занят: пробуем другой. Комната создаётся только если её Durable Object ещё пуст
            for (let attempt = 0; attempt < 8; attempt++) {
                const code = makeCode(random);
                const hostToken = hex(random(24));
                const stub = env.JAM_ROOM.get(env.JAM_ROOM.idFromName(code));
                const made = await stub.fetch('https://room/init', { method: 'POST', body: JSON.stringify({ code, hostToken }) });
                if (made.status === 200) return json({ code, hostToken });
            }
            return json({ error: 'busy' }, 503);
        }
        const match = /^\/rooms\/([A-Za-z0-9]{6})\/ws$/.exec(url.pathname);
        if (match && request.method === 'GET') {
            const code = parseCode(match[1]);
            if (!code) return json({ error: 'not-found' }, 404);
            if (request.headers.get('Upgrade') !== 'websocket') return json({ error: 'upgrade-required' }, 426);
            return env.JAM_ROOM.get(env.JAM_ROOM.idFromName(code)).fetch(request);
        }
        if (url.pathname === '/') return new Response('sc2-jam', { headers: { 'content-type': 'text/plain' } });
        return json({ error: 'not-found' }, 404);
    },
};

export class JamRoom extends DurableObject<Env> {
    private stored: Stored | null = null;
    private queue: JamState['queue'] = [];
    private loaded = false;
    /** Окно ограничения частоты по сокету; после пробуждения из гибернации счёт начинается заново */
    private readonly rate = new WeakMap<WebSocket, { from: number; count: number }>();

    private async load(): Promise<void> {
        if (this.loaded) return;
        const got = await this.ctx.storage.get<Stored | JamState['queue']>(['room', 'queue']);
        this.stored = (got.get('room') as Stored | undefined) ?? null;
        this.queue = (got.get('queue') as JamState['queue'] | undefined) ?? [];
        this.loaded = true;
    }
    private state(): JamState {
        return { ...this.stored!.state, queue: this.queue };
    }
    private async save(state: JamState): Promise<void> {
        const { queue, ...rest } = state;
        const queueChanged = queue !== this.queue;
        this.queue = queue;
        this.stored = { ...this.stored!, state: rest };
        await this.ctx.storage.put(queueChanged ? { room: this.stored, queue } : { room: this.stored });
    }
    /** Любая активность отодвигает стирание комнаты на 7 суток */
    private async touch(): Promise<void> {
        await this.ctx.storage.setAlarm(Date.now() + JAM_LIMITS.idleMs);
    }
    private send(ws: WebSocket, msg: JamServerMsg): void {
        try { ws.send(JSON.stringify(msg)); } catch { /* сокет уже закрыт: close уберёт участника */ }
    }
    private broadcast(msgs: JamServerMsg[]): void {
        for (const ws of this.ctx.getWebSockets()) for (const msg of msgs) this.send(ws, msg);
    }

    async fetch(request: Request): Promise<Response> {
        await this.load();
        const url = new URL(request.url);
        if (url.pathname === '/init') {
            if (this.stored) return json({ error: 'exists' }, 409);
            const body = (await request.json()) as { code: string; hostToken: string };
            const code = parseCode(body.code);
            if (!code || typeof body.hostToken !== 'string' || body.hostToken.length !== 48) return json({ error: 'invalid' }, 400);
            const { queue, ...rest } = newState(code);
            this.queue = queue;
            this.stored = { code, hostToken: body.hostToken, state: rest };
            await this.ctx.storage.put({ room: this.stored, queue });
            await this.touch();
            return json({ ok: true });
        }
        if (!this.stored) return json({ error: 'not-found' }, 404);
        const name = cleanName(url.searchParams.get('name'));
        if (!name) return json({ error: 'invalid' }, 400);
        const token = url.searchParams.get('token') ?? '';
        const asHost = token.length === this.stored.hostToken.length && same(token, this.stored.hostToken);
        const id = hex(random(4));
        // После перезапуска объекта (выкладка, сбой) webSocketClose для старых сокетов не приходит: их участники остаются
        // в хранилище. Перед входом убираем всех, у кого нет открытого сокета, иначе комната со временем «полна» призраков
        // Тот же клиент (cid) вернулся по новому сокету: прежний, возможно полуоткрытый, сокет и его участник убираются,
        // иначе в списке слушателей появляются двойники
        const rawCid = url.searchParams.get('cid') ?? '';
        const cid = /^[0-9a-f]{16}$/.test(rawCid) ? rawCid : '';
        const live = new Set<string>();
        const replaced: WebSocket[] = [];
        for (const ws of this.ctx.getWebSockets()) {
            const attached = ws.deserializeAttachment() as Attachment | null;
            if (!attached?.id) continue;
            if (cid && attached.cid === cid) { replaced.push(ws); continue; }
            live.add(attached.id);
        }
        const pruned = pruneMembers(this.state(), live);
        for (const ws of replaced) {
            ws.serializeAttachment({ id: '' } satisfies Attachment);
            try { ws.close(1000, 'replaced'); } catch { /* уже закрыт */ }
        }
        const added = addMember(pruned.state, { id, name, avatar: cleanAvatar(url.searchParams.get('avatar')) }, asHost);

        const pair = new WebSocketPair();
        const [client, server] = [pair[0], pair[1]];
        this.ctx.acceptWebSocket(server);
        if (!added.member) {
            if (pruned.state.members !== this.stored.state.members) {
                await this.save(pruned.state);
                for (const ws of this.ctx.getWebSockets()) if (ws !== server) for (const event of pruned.events) this.send(ws, event);
            }
            this.send(server, { t: 'error', code: 'full' });
            server.close(1013, 'full');
            return new Response(null, { status: 101, webSocket: client });
        }
        server.serializeAttachment({ id, cid } satisfies Attachment);
        // Остальные узнают о новом участнике; ему самому уходит снимок комнаты
        for (const ws of this.ctx.getWebSockets()) if (ws !== server) for (const event of [...pruned.events, ...added.events]) this.send(ws, event);
        await this.save(added.state);
        this.send(server, { t: 'hello', you: id, state: added.state, serverNow: Date.now() });
        await this.touch();
        return new Response(null, { status: 101, webSocket: client });
    }

    async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
        await this.load();
        if (!this.stored) return;
        if (typeof message !== 'string' || message.length > JAM_LIMITS.message) {
            this.send(ws, { t: 'error', code: 'too-big' });
            return;
        }
        const now = Date.now();
        const window = this.rate.get(ws);
        if (!window || now - window.from > JAM_LIMITS.rateWindowMs) this.rate.set(ws, { from: now, count: 1 });
        else if (++window.count > JAM_LIMITS.rate) {
            this.send(ws, { t: 'error', code: 'rate' });
            return;
        }
        const attached = ws.deserializeAttachment() as Attachment | null;
        const state = this.state();
        const sender = attached ? memberOf(state, attached.id) : undefined;
        const msg = parseClientMsg(message);
        if (!sender || !msg) {
            this.send(ws, { t: 'error', code: sender ? 'invalid' : 'forbidden' });
            return;
        }
        const out = reduce(state, sender, msg, now);
        if (out.state !== state) await this.save(out.state);
        this.broadcast(out.events);
        for (const reply of out.reply) this.send(ws, reply);
        for (const id of out.kick) {
            for (const other of this.ctx.getWebSockets()) {
                if ((other.deserializeAttachment() as Attachment | null)?.id !== id) continue;
                this.send(other, { t: 'kicked' });
                other.serializeAttachment({ id: '' } satisfies Attachment);
                other.close(4001, 'kicked');
            }
        }
        if (msg.t !== 'ping') await this.touch();
    }

    private async drop(ws: WebSocket): Promise<void> {
        await this.load();
        if (!this.stored) return;
        const id = (ws.deserializeAttachment() as Attachment | null)?.id;
        if (!id) return;
        const before = this.state();
        const out = removeMember(before, id);
        if (out.state === before) return;
        await this.save(out.state);
        this.broadcast(out.events);
    }
    async webSocketClose(ws: WebSocket, code: number): Promise<void> {
        await this.drop(ws);
        try { ws.close(code === 1005 || code === 1006 ? 1000 : code, 'bye'); } catch { /* уже закрыт */ }
    }
    async webSocketError(ws: WebSocket): Promise<void> {
        await this.drop(ws);
    }

    async alarm(): Promise<void> {
        // Пока в комнате кто-то подключён, она живёт: таймер просто переносится
        if (!shouldExpire(this.ctx.getWebSockets().length)) {
            await this.touch();
            return;
        }
        // Тишина семь суток и никого нет: стираем всё, что комната хранила
        for (const ws of this.ctx.getWebSockets()) {
            try { ws.close(4000, 'expired'); } catch { /* уже закрыт */ }
        }
        await this.ctx.storage.deleteAll();
        this.stored = null;
        this.queue = [];
    }
}
