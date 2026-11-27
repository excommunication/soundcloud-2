// Клиент «Джема» в main: держит WebSocket, переподключается, считает смещение часов сервера и хранит состояние комнаты.
// Страница сайта сети не видит: она зовёт узкий soundcloudAPI.jam (preload, jamIpc.ts) и получает готовые события.
// Все внешние зависимости (сокет, HTTP, таймеры) приходят объектом, поэтому в тестах подставляются свои.
import { applyEvent } from './room';
import { cleanAvatar, cleanName, parseCode, parseServerMsg, type JamClientMsg, type JamErrorCode, type JamState } from './protocol';
import { medianOffset, offsetFromPong } from './sync';

/** Узкая форма WebSocket: подходит и браузерному, и из Node (undici) */
export interface JamSocket {
    send(data: string): void;
    close(code?: number, reason?: string): void;
    onopen: ((event: unknown) => void) | null;
    onmessage: ((event: { data: unknown }) => void) | null;
    onclose: ((event: { code: number }) => void) | null;
    onerror: ((event: unknown) => void) | null;
}
export interface JamTimers {
    set(fn: () => void, ms: number): unknown;
    clear(handle: unknown): void;
}
export interface JamClientDeps {
    connect(url: string): JamSocket;
    /** POST без тела: ответ сервера {status, body} или отказ сети */
    post(url: string): Promise<{ status: number; body: unknown }>;
    now(): number;
    random(): number;
    timers: JamTimers;
    /** Запомненная комната на диске (только main: токен хозяина наружу, на страницу, не уходит) */
    saved?: { load(): unknown; save(value: JamSavedSession | null): void };
    /** Отвечает ли сервер вообще (GET корня): отличает «комнаты нет» от «нет сети» при восстановлении */
    reachable?(httpBase: string): Promise<boolean>;
}
/** Что помним между запусками: к какой комнате вернуться и под каким именем */
export interface JamSavedSession {
    code: string;
    /** Токен хозяина; у гостя пустой */
    token: string;
    name: string;
    avatar: string;
    /** Адрес сервера (http-форма): после смены сервера запись не подходит */
    server: string;
    /** Постоянный id клиента; у старых записей пустой */
    cid?: string;
}
/** Запись с диска -> проверенная запись; null — мусор (записи не верим: файл можно было править) */
export function parseSavedSession(value: unknown): JamSavedSession | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const v = value as Record<string, unknown>;
    const code = parseCode(v.code);
    const name = cleanName(v.name);
    const token = typeof v.token === 'string' && (v.token === '' || /^[0-9a-f]{48}$/.test(v.token)) ? v.token : null;
    const server = typeof v.server === 'string' && v.server.length <= 200 ? v.server : null;
    if (!code || !name || token === null || !server) return null;
    const cid = typeof v.cid === 'string' && /^[0-9a-f]{16}$/.test(v.cid) ? v.cid : '';
    return { code, token, name, avatar: cleanAvatar(v.avatar), server, cid };
}

export type JamStatus = 'idle' | 'connecting' | 'open' | 'reconnecting';
/** Событие для страницы */
export type JamUiEvent =
    | { type: 'status'; status: JamStatus; attempt?: number; reason?: JamLeaveReason }
    | { type: 'state'; state: JamState; you: string; offset: number; synced: boolean }
    | { type: 'clock'; offset: number }
    | { type: 'error'; code: JamErrorCode };
/** Почему сессия закончилась сама */
export type JamLeaveReason = 'kicked' | 'expired' | 'full' | 'not-found' | 'unreachable' | 'network';
export type JamStartResult = { ok: true; code: string } | { ok: false; error: JamLeaveReason | 'not-configured' | 'invalid' | 'busy' };

/** Адрес сервера из настройки: https://… (или wss://…), без пути; http только для локальной разработки. null — не годится */
export function jamServerBase(value: unknown): { http: string; ws: string } | null {
    if (typeof value !== 'string' || !value.trim() || value.length > 200) return null;
    let url: URL;
    try { url = new URL(value.trim()); } catch { return null; }
    if (url.username || url.password || url.search || url.hash || !url.hostname) return null;
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
    const secure = url.protocol === 'https:' || url.protocol === 'wss:';
    if (!secure && !(local && (url.protocol === 'http:' || url.protocol === 'ws:'))) return null;
    const path = url.pathname.replace(/\/+$/, '');
    const http = (secure ? 'https://' : 'http://') + url.host + path;
    return { http, ws: (secure ? 'wss://' : 'ws://') + url.host + path };
}
/** Задержка перед попыткой номер attempt (с нуля): 1, 2, 4 … 30 с, с разбросом, чтобы комната не штурмовалась разом */
export function backoffDelay(attempt: number, random: number): number {
    return Math.round(Math.min(30000, 1000 * Math.pow(2, Math.max(0, attempt))) * (0.6 + 0.4 * Math.min(1, Math.max(0, random))));
}

export const JAM_MAX_ATTEMPTS = 8;

function newCid(): string {
    let out = '';
    for (let i = 0; i < 16; i++) out += Math.floor(Math.random() * 16).toString(16);
    return out;
}

interface Session {
    base: { http: string; ws: string };
    code: string;
    token: string;
    name: string;
    avatar: string;
    /** Постоянный id этого клиента в комнате: сервер по нему убирает прежнее (зависшее) соединение того же клиента */
    cid: string;
    /** Поднята с диска при запуске: если комнаты уже нет, молча забываем */
    restoring?: boolean;
}

export class JamClient {
    private session: Session | null = null;
    private socket: JamSocket | null = null;
    private status: JamStatus = 'idle';
    private state: JamState | null = null;
    private you = '';
    private samples: number[] = [];
    private offset = 0;
    private attempt = 0;
    private retryTimer: unknown = null;
    private pingTimer: unknown = null;
    private pings = new Map<number, number>();
    private generation = 0;
    private persisted = false;
    /** Один cid на весь процесс: перезаход в комнату (выход и новый вход, обрыв посреди выхода) вытесняет прежнее соединение, а не множит участника */
    private cid = '';

    constructor(private readonly deps: JamClientDeps, private readonly emit: (event: JamUiEvent) => void) {}

    /** Снимок для страницы, которая загрузилась позже (перезагрузка сайта посреди джема) */
    snapshot(): JamUiEvent[] {
        if (this.status === 'idle') return [{ type: 'status', status: 'idle' }];
        const out: JamUiEvent[] = [{ type: 'status', status: this.status, attempt: this.attempt }];
        if (this.state) out.push({ type: 'state', state: this.state, you: this.you, offset: this.offset, synced: this.samples.length >= 3 });
        return out;
    }
    get serverOffset(): number {
        return this.offset;
    }
    get active(): boolean {
        return this.status !== 'idle';
    }

    async create(base: { http: string; ws: string }, name: string, avatar: string): Promise<JamStartResult> {
        if (this.active) this.leave();
        const generation = ++this.generation;
        this.setStatus('connecting');
        let reply: { status: number; body: unknown };
        try { reply = await this.deps.post(base.http + '/rooms'); } catch { return this.fail(generation, 'unreachable'); }
        if (generation !== this.generation) return { ok: false, error: 'invalid' };
        const body = reply.body as { code?: unknown; hostToken?: unknown } | null;
        const code = parseCode(body?.code);
        if (reply.status === 503) return this.fail(generation, 'busy');
        if (reply.status !== 200 || !code || typeof body?.hostToken !== 'string' || !/^[0-9a-f]{48}$/.test(body.hostToken)) return this.fail(generation, 'unreachable');
        this.session = { base, code, token: body.hostToken, name, avatar, cid: this.clientId() };
        this.open();
        return { ok: true, code };
    }
    join(base: { http: string; ws: string }, code: string, name: string, avatar: string): JamStartResult {
        const clean = parseCode(code);
        if (!clean) return { ok: false, error: 'invalid' };
        if (this.active) this.leave();
        ++this.generation;
        this.session = { base, code: clean, token: '', name, avatar, cid: this.clientId() };
        this.setStatus('connecting');
        this.open();
        return { ok: true, code: clean };
    }
    /** Вернуться в комнату, запомненную с прошлого запуска. false: запоминать нечего, сервер другой или уже идёт сессия */
    restore(base: { http: string; ws: string }): boolean {
        if (this.active || !this.deps.saved) return false;
        let raw: unknown;
        try { raw = this.deps.saved.load(); } catch { return false; }
        if (raw === null || raw === undefined || raw === '') return false;
        const saved = parseSavedSession(raw);
        if (!saved) { this.forget(); return false; }
        if (saved.server !== base.http) return false;
        ++this.generation;
        this.session = { base, code: saved.code, token: saved.token, name: saved.name, avatar: saved.avatar, cid: this.clientId(saved.cid), restoring: true };
        this.persisted = true;
        this.setStatus('connecting');
        this.open();
        return true;
    }
    private clientId(saved?: string): string {
        if (saved) this.cid = saved;
        if (!this.cid) this.cid = newCid();
        return this.cid;
    }
    /** Выход по кнопке: комната забывается и при следующем запуске не поднимается */
    leave(): void {
        this.suspend();
        this.forget();
    }
    /** Остановка без забывания: закрытие приложения. Запись остаётся, при запуске клиент вернётся в комнату */
    suspend(): void {
        this.generation++;
        this.stop();
        this.session = null;
        this.state = null;
        this.you = '';
        this.persisted = false;
        if (this.status !== 'idle') this.setStatus('idle');
    }
    private forget(): void {
        try { this.deps.saved?.save(null); } catch { /* диск недоступен: запись останется до следующей попытки */ }
    }
    private remember(): void {
        const s = this.session;
        if (!s || this.persisted || !this.deps.saved) return;
        this.persisted = true;
        try { this.deps.saved.save({ code: s.code, token: s.token, name: s.name, avatar: s.avatar, server: s.base.http, cid: s.cid }); } catch { /* не критично */ }
    }
    /** Отправка в комнату; false, пока соединения нет */
    send(msg: JamClientMsg): boolean {
        if (this.status !== 'open' || !this.socket) return false;
        try { this.socket.send(JSON.stringify(msg)); return true; } catch { return false; }
    }

    private fail(generation: number, error: JamLeaveReason | 'busy'): JamStartResult {
        if (generation === this.generation) {
            this.generation++;
            this.session = null;
            this.setStatus('idle');
        }
        return { ok: false, error };
    }
    private setStatus(status: JamStatus, reason?: JamLeaveReason): void {
        this.status = status;
        this.emit({ type: 'status', status, attempt: this.attempt || undefined, reason });
    }
    private stop(): void {
        if (this.retryTimer !== null) this.deps.timers.clear(this.retryTimer);
        if (this.pingTimer !== null) this.deps.timers.clear(this.pingTimer);
        this.retryTimer = null;
        this.pingTimer = null;
        const socket = this.socket;
        this.socket = null;
        if (socket) {
            socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
            try { socket.close(1000, 'bye'); } catch { /* уже закрыт */ }
        }
        this.attempt = 0;
        this.samples = [];
        this.pings.clear();
    }
    private url(): string {
        const s = this.session!;
        const query = new URLSearchParams({ name: s.name });
        if (s.avatar) query.set('avatar', s.avatar);
        if (s.token) query.set('token', s.token);
        query.set('cid', s.cid);
        return s.base.ws + '/rooms/' + s.code + '/ws?' + query.toString();
    }
    private open(): void {
        if (!this.session) return;
        const generation = this.generation;
        let socket: JamSocket;
        try { socket = this.deps.connect(this.url()); } catch { this.dropped(generation, 1006); return; }
        this.socket = socket;
        socket.onopen = () => {
            if (generation !== this.generation) return;
            this.attempt = 0;
            this.samples = [];
            this.pings.clear();
            this.burst(5);
        };
        socket.onmessage = (event) => {
            if (generation === this.generation) this.message(event.data);
        };
        socket.onerror = () => undefined;
        socket.onclose = (event) => this.dropped(generation, event.code);
    }
    /** n быстрых пингов подряд для медианы, потом редкие: они же держат соединение живым */
    private burst(left: number): void {
        const generation = this.generation;
        this.ping();
        this.pingTimer = this.deps.timers.set(() => {
            if (generation !== this.generation) return;
            this.pingTimer = null;
            this.burst(left > 1 ? left - 1 : 0);
        }, left > 1 ? 250 : 20000);
    }
    private ping(): void {
        const at = this.deps.now();
        this.pings.set(at, at);
        if (this.pings.size > 8) this.pings.delete(this.pings.keys().next().value as number);
        try { this.socket?.send(JSON.stringify({ t: 'ping', c: at })); } catch { /* закроется само */ }
    }
    private message(raw: unknown): void {
        if (typeof raw !== 'string') return;
        const msg = parseServerMsg(raw);
        if (!msg) return;
        switch (msg.t) {
            case 'hello':
                this.state = msg.state;
                this.you = msg.you;
                // Часы сервера из hello грубо, до первых pong
                if (!this.samples.length) this.offset = msg.serverNow - this.deps.now();
                this.setStatus('open');
                this.remember();
                this.pushState();
                return;
            case 'pong': {
                const sent = this.pings.get(msg.c);
                if (sent === undefined) return;
                this.pings.delete(msg.c);
                this.samples = [...this.samples, offsetFromPong(sent, msg.s, this.deps.now()).offset].slice(-5);
                const next = medianOffset(this.samples);
                const moved = Math.abs(next - this.offset) > 30;
                this.offset = next;
                if (moved) this.emit({ type: 'clock', offset: next });
                return;
            }
            case 'kicked':
                this.end('kicked');
                return;
            case 'error':
                if (msg.code === 'full') this.end('full');
                else this.emit({ type: 'error', code: msg.code });
                return;
            default:
                if (!this.state) return;
                this.state = applyEvent(this.state, msg);
                this.pushState();
        }
    }
    private pushState(): void {
        if (this.state) this.emit({ type: 'state', state: this.state, you: this.you, offset: this.offset, synced: this.samples.length >= 3 });
    }
    /** Сессия закончилась не по просьбе человека */
    private end(reason: JamLeaveReason, keep = false, silent = false): void {
        this.generation++;
        this.stop();
        this.session = null;
        this.state = null;
        this.status = 'idle';
        this.persisted = false;
        // Потеря связи запись не стирает: при следующем запуске вернёмся. Выгнали, комната кончилась: забываем
        if (!keep) this.forget();
        this.emit(silent ? { type: 'status', status: 'idle' } : { type: 'status', status: 'idle', reason });
    }
    /** Попытки кончились. Восстановление при запуске молчит: комнаты нет — запись стирается, сервера нет — остаётся */
    private giveUp(generation: number): void {
        const session = this.session;
        if (this.state) return this.end('network', true);
        if (!session?.restoring) return this.end('not-found');
        const probe = this.deps.reachable ? this.deps.reachable(session.base.http).catch(() => false) : Promise.resolve(true);
        void probe.then((up) => {
            if (generation !== this.generation) return;
            this.end(up ? 'not-found' : 'unreachable', !up, true);
        });
    }
    private dropped(generation: number, code: number): void {
        if (generation !== this.generation || !this.session) return;
        if (code === 4000) return this.end('expired');
        if (code === 4001) return this.end('kicked');
        if (code === 1013) return this.end('full');
        const failed = this.attempt;
        this.socket = null;
        if (this.pingTimer !== null) this.deps.timers.clear(this.pingTimer);
        this.pingTimer = null;
        // Соединение так ни разу и не открылось подряд много раз: комнаты нет или сервер недоступен
        if (failed >= JAM_MAX_ATTEMPTS) return this.giveUp(generation);
        this.attempt = failed + 1;
        this.setStatus('reconnecting');
        const delay = backoffDelay(failed, this.deps.random());
        this.retryTimer = this.deps.timers.set(() => {
            this.retryTimer = null;
            if (generation === this.generation) this.open();
        }, delay);
    }
}
