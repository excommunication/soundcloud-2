// «Джем» (2.12.0): общие лобби для совместного прослушивания. Протокол JSON поверх WebSocket, один файл на клиент и сервер.
// Этот же файл импортирует jam-server (Cloudflare Worker): wrangler собирает его вместе с сервером, копий нет.
// Файл самодостаточен: ни Electron, ни Node, ни DOM. Всё, что приходит из сети (в обе стороны), проходит parseClientMsg/parseServerMsg.
//
// Время: now.startedAt в часах сервера (мс). Позиция трека в момент t: paused ? positionMs : positionMs + (t - startedAt).
// Права: хозяин всегда; участник с canControl; все, если settings.everyoneCanControl. Добавлять в очередь: управляющие или everyoneCanAdd.

export const JAM_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // без 0 O 1 I L
export const JAM_CODE_LENGTH = 6;
export const JAM_LIMITS = {
    name: 32,
    title: 100,
    artist: 60,
    url: 160,
    artwork: 160,
    queue: 200,
    /** Запас под значение в хранилище Durable Object (128 КиБ) */
    queueBytes: 110000,
    members: 50,
    message: 8192,
    /** Сообщений в окно на один сокет */
    rate: 30,
    rateWindowMs: 10000,
    idleMs: 6 * 60 * 60 * 1000,
    durationMs: 24 * 60 * 60 * 1000,
} as const;

export interface JamTrack {
    /** id трека SoundCloud */
    id: number;
    /** https://soundcloud.com/<артист>/<трек> */
    url: string;
    title: string;
    artist: string;
    artwork: string;
    durationMs: number;
}
export interface JamQueueItem extends JamTrack {
    /** Номер записи в очереди: уникален в комнате */
    qid: string;
    /** Имя того, кто добавил */
    addedBy: string;
}
export interface JamMember {
    id: string;
    name: string;
    /** Пустая строка — без аватарки */
    avatar: string;
    isHost: boolean;
    /** Выданное хозяином право управлять */
    canControl: boolean;
}
export interface JamNow {
    track: JamTrack;
    /** Время сервера (мс), когда позиция была positionMs */
    startedAt: number;
    positionMs: number;
    paused: boolean;
}
export interface JamSettings {
    everyoneCanAdd: boolean;
    everyoneCanControl: boolean;
}
export interface JamState {
    code: string;
    members: JamMember[];
    queue: JamQueueItem[];
    now: JamNow | null;
    settings: JamSettings;
    /** Счётчик для qid */
    seq: number;
}

// Клиент -> сервер
export type JamClientMsg =
    | { t: 'ping'; c: number }
    | { t: 'play'; track: JamTrack; positionMs: number; qid?: string }
    | { t: 'pause' }
    | { t: 'resume' }
    | { t: 'seek'; positionMs: number }
    /** from: id трека, который закончился; повтор от второго клиента не пропустит лишний трек */
    | { t: 'next'; from?: number }
    | { t: 'add'; track: JamTrack }
    | { t: 'remove'; qid: string }
    | { t: 'move'; qid: string; to: number }
    | { t: 'grant'; id: string; on: boolean }
    | { t: 'kick'; id: string }
    | { t: 'settings'; everyoneCanAdd?: boolean; everyoneCanControl?: boolean };

// Сервер -> клиент: события меняют состояние (applyEvent), остальное разовое
export type JamEvent =
    | { t: 'join'; member: JamMember }
    | { t: 'leave'; id: string; hostId: string }
    | { t: 'member'; member: JamMember }
    | { t: 'host'; id: string }
    | { t: 'now'; now: JamNow | null }
    | { t: 'qadd'; item: JamQueueItem; seq: number }
    | { t: 'qrm'; qid: string }
    | { t: 'qmove'; qid: string; to: number }
    | { t: 'settings'; settings: JamSettings };
export type JamServerMsg =
    | JamEvent
    | { t: 'hello'; you: string; state: JamState; serverNow: number }
    | { t: 'pong'; c: number; s: number }
    | { t: 'kicked' }
    | { t: 'error'; code: JamErrorCode };
export type JamErrorCode = 'invalid' | 'forbidden' | 'full' | 'rate' | 'queue-full' | 'not-found' | 'too-big';
export const JAM_ERROR_CODES: readonly JamErrorCode[] = ['invalid', 'forbidden', 'full', 'rate', 'queue-full', 'not-found', 'too-big'];

// ---- Проверка ввода ----

function isObject(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}
function str(value: unknown, max: number, min = 0): string | null {
    // eslint-disable-next-line no-control-regex
    return typeof value === 'string' && value.length >= min && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value) ? value : null;
}
function num(value: unknown, min: number, max: number): number | null {
    return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : null;
}

const TRACK_URL = /^https:\/\/soundcloud\.com\/[a-z0-9_-]{1,100}\/[a-z0-9_-]{1,255}$/i;
const ART_URL = /^https:\/\/[a-z0-9.-]+\.sndcdn\.com\/[A-Za-z0-9_./%?&=+~-]*$/;

/** Имя участника: без управляющих знаков и крайних пробелов, 1..32; иначе null */
export function cleanName(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    // eslint-disable-next-line no-control-regex
    const text = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
    return text && text.length <= JAM_LIMITS.name ? text : null;
}
/** Аватарка: только картинка sndcdn.com по https, иначе пустая строка */
export function cleanAvatar(value: unknown): string {
    return typeof value === 'string' && value.length <= JAM_LIMITS.artwork && ART_URL.test(value) ? value : '';
}
export function parseTrack(value: unknown): JamTrack | null {
    if (!isObject(value)) return null;
    const id = value.id;
    const url = str(value.url, JAM_LIMITS.url, 1);
    const title = str(value.title, JAM_LIMITS.title);
    const artist = str(value.artist, JAM_LIMITS.artist);
    const durationMs = num(value.durationMs, 0, JAM_LIMITS.durationMs);
    const artwork = value.artwork === '' || value.artwork === undefined ? '' : str(value.artwork, JAM_LIMITS.artwork);
    if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) return null;
    if (url === null || !TRACK_URL.test(url) || title === null || artist === null || durationMs === null || artwork === null) return null;
    if (artwork && !ART_URL.test(artwork)) return null;
    return { id, url, title, artist, artwork, durationMs: Math.round(durationMs) };
}
function parseMember(value: unknown): JamMember | null {
    if (!isObject(value)) return null;
    const id = str(value.id, 40, 1);
    const name = cleanName(value.name);
    if (id === null || name === null || typeof value.isHost !== 'boolean' || typeof value.canControl !== 'boolean') return null;
    return { id, name, avatar: cleanAvatar(value.avatar), isHost: value.isHost, canControl: value.canControl };
}
function parseNow(value: unknown): JamNow | null {
    if (!isObject(value)) return null;
    const track = parseTrack(value.track);
    const startedAt = num(value.startedAt, 0, 1e15);
    const positionMs = num(value.positionMs, 0, JAM_LIMITS.durationMs);
    if (!track || startedAt === null || positionMs === null || typeof value.paused !== 'boolean') return null;
    return { track, startedAt, positionMs, paused: value.paused };
}
function parseItem(value: unknown): JamQueueItem | null {
    if (!isObject(value)) return null;
    const track = parseTrack(value);
    const qid = str(value.qid, 16, 1);
    const addedBy = cleanName(value.addedBy);
    return track && qid !== null && addedBy !== null ? { ...track, qid, addedBy } : null;
}
function parseSettings(value: unknown): JamSettings | null {
    if (!isObject(value) || typeof value.everyoneCanAdd !== 'boolean' || typeof value.everyoneCanControl !== 'boolean') return null;
    return { everyoneCanAdd: value.everyoneCanAdd, everyoneCanControl: value.everyoneCanControl };
}
function parseState(value: unknown): JamState | null {
    if (!isObject(value) || !Array.isArray(value.members) || !Array.isArray(value.queue)) return null;
    if (value.members.length > JAM_LIMITS.members || value.queue.length > JAM_LIMITS.queue) return null;
    const code = parseCode(value.code);
    const settings = parseSettings(value.settings);
    const seq = num(value.seq, 0, 1e9);
    const members: JamMember[] = [];
    for (const raw of value.members) {
        const member = parseMember(raw);
        if (!member) return null;
        members.push(member);
    }
    const queue: JamQueueItem[] = [];
    for (const raw of value.queue) {
        const item = parseItem(raw);
        if (!item) return null;
        queue.push(item);
    }
    const now = value.now === null ? null : parseNow(value.now);
    if (!code || !settings || seq === null || (value.now !== null && !now)) return null;
    return { code, members, queue, now, settings, seq };
}

/** Код комнаты: 6 знаков алфавита, регистр не важен; null — не код */
export function parseCode(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const code = value.trim().toUpperCase();
    return new RegExp('^[' + JAM_ALPHABET + ']{' + JAM_CODE_LENGTH + '}$').test(code) ? code : null;
}
/** Код из того, что вставил человек: сам код или ссылка sc2://jam/КОД */
export function codeFromInput(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const text = value.trim();
    const link = /^sc2:\/\/jam\/([^/?#\s]+)\/?$/i.exec(text);
    return parseCode(link ? link[1] : text);
}
/** Новый код из случайных байтов (crypto.getRandomValues снаружи), без смещения по модулю */
export function makeCode(random: (n: number) => Uint8Array): string {
    let out = '';
    const limit = 256 - (256 % JAM_ALPHABET.length);
    while (out.length < JAM_CODE_LENGTH) {
        for (const byte of random(JAM_CODE_LENGTH * 2)) {
            if (byte < limit && out.length < JAM_CODE_LENGTH) out += JAM_ALPHABET[byte % JAM_ALPHABET.length];
        }
    }
    return out;
}

/** Сообщение клиента из текста кадра; null: не принимать. Длина проверяется до разбора */
export function parseClientMsg(raw: unknown): JamClientMsg | null {
    let value: unknown = raw;
    if (typeof raw === 'string') {
        if (raw.length > JAM_LIMITS.message) return null;
        try { value = JSON.parse(raw); } catch { return null; }
    }
    if (!isObject(value)) return null;
    switch (value.t) {
        case 'ping': {
            const c = num(value.c, 0, 1e15);
            return c === null ? null : { t: 'ping', c };
        }
        case 'play': {
            const track = parseTrack(value.track);
            const positionMs = num(value.positionMs, 0, JAM_LIMITS.durationMs);
            if (!track || positionMs === null) return null;
            if (value.qid === undefined) return { t: 'play', track, positionMs };
            const qid = str(value.qid, 16, 1);
            return qid === null ? null : { t: 'play', track, positionMs, qid };
        }
        case 'pause': return { t: 'pause' };
        case 'resume': return { t: 'resume' };
        case 'seek': {
            const positionMs = num(value.positionMs, 0, JAM_LIMITS.durationMs);
            return positionMs === null ? null : { t: 'seek', positionMs };
        }
        case 'next': {
            if (value.from === undefined) return { t: 'next' };
            return typeof value.from === 'number' && Number.isSafeInteger(value.from) ? { t: 'next', from: value.from } : null;
        }
        case 'add': {
            const track = parseTrack(value.track);
            return track ? { t: 'add', track } : null;
        }
        case 'remove': {
            const qid = str(value.qid, 16, 1);
            return qid === null ? null : { t: 'remove', qid };
        }
        case 'move': {
            const qid = str(value.qid, 16, 1);
            const to = num(value.to, 0, JAM_LIMITS.queue);
            return qid === null || to === null || !Number.isInteger(to) ? null : { t: 'move', qid, to };
        }
        case 'grant': {
            const id = str(value.id, 40, 1);
            return id === null || typeof value.on !== 'boolean' ? null : { t: 'grant', id, on: value.on };
        }
        case 'kick': {
            const id = str(value.id, 40, 1);
            return id === null ? null : { t: 'kick', id };
        }
        case 'settings': {
            const out: { t: 'settings'; everyoneCanAdd?: boolean; everyoneCanControl?: boolean } = { t: 'settings' };
            for (const key of ['everyoneCanAdd', 'everyoneCanControl'] as const) {
                if (value[key] === undefined) continue;
                if (typeof value[key] !== 'boolean') return null;
                out[key] = value[key] as boolean;
            }
            return out.everyoneCanAdd === undefined && out.everyoneCanControl === undefined ? null : out;
        }
        default: return null;
    }
}

/** Сообщение сервера; клиент не верит сети: тот же разбор, что на сервере */
export function parseServerMsg(raw: unknown): JamServerMsg | null {
    let value: unknown = raw;
    if (typeof raw === 'string') {
        // Снимок комнаты с очередью крупнее обычного сообщения
        if (raw.length > 400000) return null;
        try { value = JSON.parse(raw); } catch { return null; }
    }
    if (!isObject(value)) return null;
    switch (value.t) {
        case 'hello': {
            const state = parseState(value.state);
            const you = str(value.you, 40, 1);
            const serverNow = num(value.serverNow, 0, 1e15);
            return state && you !== null && serverNow !== null ? { t: 'hello', you, state, serverNow } : null;
        }
        case 'pong': {
            const c = num(value.c, 0, 1e15);
            const s = num(value.s, 0, 1e15);
            return c === null || s === null ? null : { t: 'pong', c, s };
        }
        case 'kicked': return { t: 'kicked' };
        case 'error': return JAM_ERROR_CODES.includes(value.code as JamErrorCode) ? { t: 'error', code: value.code as JamErrorCode } : null;
        case 'join':
        case 'member': {
            const member = parseMember(value.member);
            return member ? { t: value.t, member } : null;
        }
        case 'leave': {
            const id = str(value.id, 40, 1);
            const hostId = str(value.hostId, 40);
            return id === null || hostId === null ? null : { t: 'leave', id, hostId };
        }
        case 'host': {
            const id = str(value.id, 40, 1);
            return id === null ? null : { t: 'host', id };
        }
        case 'now': {
            if (value.now === null) return { t: 'now', now: null };
            const now = parseNow(value.now);
            return now ? { t: 'now', now } : null;
        }
        case 'qadd': {
            const item = parseItem(value.item);
            const seq = num(value.seq, 0, 1e9);
            return item && seq !== null ? { t: 'qadd', item, seq } : null;
        }
        case 'qrm': {
            const qid = str(value.qid, 16, 1);
            return qid === null ? null : { t: 'qrm', qid };
        }
        case 'qmove': {
            const qid = str(value.qid, 16, 1);
            const to = num(value.to, 0, JAM_LIMITS.queue);
            return qid === null || to === null ? null : { t: 'qmove', qid, to };
        }
        case 'settings': {
            const settings = parseSettings(value.settings);
            return settings ? { t: 'settings', settings } : null;
        }
        default: return null;
    }
}
