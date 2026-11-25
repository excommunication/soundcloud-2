// Логика комнаты «Джема»: чистые функции без сети и времени (время приходит аргументом), поэтому тестируются без Workers.
// reduce(state, member, msg, now) возвращает новое состояние, события для всех, ответы отправителю и тех, кого выгнали.
// applyEvent применяет то же событие на клиенте: состояние клиента всегда сходится с серверным.
import { JAM_LIMITS, type JamClientMsg, type JamErrorCode, type JamEvent, type JamMember, type JamNow, type JamQueueItem, type JamServerMsg, type JamSettings, type JamState } from './protocol';
import { expectedPosition } from './sync';

export interface Outcome {
    state: JamState;
    /** Всем в комнате, в этом порядке */
    events: JamEvent[];
    /** Только отправителю */
    reply: JamServerMsg[];
    /** Id участников, которых нужно отключить */
    kick: string[];
}

export function newState(code: string): JamState {
    return { code, members: [], queue: [], now: null, settings: { everyoneCanAdd: false, everyoneCanControl: false }, seq: 0 };
}

export function memberOf(state: JamState, id: string): JamMember | undefined {
    return state.members.find((member) => member.id === id);
}
export function hostOf(state: JamState): JamMember | undefined {
    return state.members.find((member) => member.isHost);
}
/** Может ли участник ставить, останавливать и перематывать */
export function canControl(state: JamState, id: string): boolean {
    const member = memberOf(state, id);
    return !!member && (member.isHost || member.canControl || state.settings.everyoneCanControl);
}
/** Может ли участник добавлять в очередь */
export function canAdd(state: JamState, id: string): boolean {
    return canControl(state, id) || (!!memberOf(state, id) && state.settings.everyoneCanAdd);
}

/** Пора ли стереть комнату по таймеру простоя: пока есть хотя бы одно соединение, нет */
export function shouldExpire(openConnections: number): boolean {
    return openConnections <= 0;
}

/** Новый участник. Первый в комнате становится хозяином, если хозяина ещё нет. Полная комната: error 'full' */
export function addMember(state: JamState, member: Omit<JamMember, 'isHost' | 'canControl'>, asHost = false): Outcome & { member?: JamMember } {
    if (state.members.length >= JAM_LIMITS.members) return { state, events: [], reply: [{ t: 'error', code: 'full' }], kick: [] };
    const events: JamEvent[] = [];
    let members = state.members;
    const host = asHost || !hostOf(state);
    if (host && hostOf(state)) {
        // Владелец вернулся по токену: прежний (назначенный по очереди) хозяин снова обычный участник
        members = members.map((item) => (item.isHost ? { ...item, isHost: false } : item));
    }
    const added: JamMember = { ...member, isHost: host, canControl: false };
    members = [...members, added];
    events.push({ t: 'join', member: added });
    if (host && members.length > 1) events.push({ t: 'host', id: added.id });
    return { state: { ...state, members }, events, reply: [], kick: [], member: added };
}

/** Участник ушёл или отключился. Хозяин ушёл: хозяином становится самый давний из оставшихся. Повторный вызов ничего не делает */
export function removeMember(state: JamState, id: string): Outcome {
    const gone = memberOf(state, id);
    if (!gone) return { state, events: [], reply: [], kick: [] };
    let members = state.members.filter((member) => member.id !== id);
    if (gone.isHost && members.length) members = members.map((member, index) => (index === 0 ? { ...member, isHost: true } : member));
    const hostId = members.find((member) => member.isHost)?.id ?? '';
    return { state: { ...state, members }, events: [{ t: 'leave', id, hostId }], reply: [], kick: [] };
}

/** Участники без живого соединения (сервер перезапустился, и webSocketClose для их сокетов так и не пришёл): убираются,
 *  иначе такие призраки копятся в хранилище и комната упирается в предел участников. live: id всех открытых сокетов */
export function pruneMembers(state: JamState, live: ReadonlySet<string>): Outcome {
    let current = state;
    const events: JamEvent[] = [];
    for (const member of state.members) {
        if (live.has(member.id)) continue;
        const out = removeMember(current, member.id);
        current = out.state;
        events.push(...out.events);
    }
    return { state: current, events, reply: [], kick: [] };
}

function refuse(state: JamState, code: JamErrorCode): Outcome {
    return { state, events: [], reply: [{ t: 'error', code }], kick: [] };
}
function done(state: JamState, events: JamEvent[]): Outcome {
    return { state, events, reply: [], kick: [] };
}
function playing(track: JamNow['track'], positionMs: number, now: number): JamNow {
    return { track, startedAt: now, positionMs: Math.max(0, Math.round(positionMs)), paused: false };
}
function queueBytes(queue: JamQueueItem[]): number {
    return JSON.stringify(queue).length;
}

/** Одно сообщение участника. member берётся из state по id отправителя: чужие права подделать нельзя */
export function reduce(state: JamState, sender: JamMember, msg: JamClientMsg, now: number): Outcome {
    const me = memberOf(state, sender.id);
    if (!me) return refuse(state, 'forbidden');
    if (msg.t === 'ping') return { state, events: [], reply: [{ t: 'pong', c: msg.c, s: now }], kick: [] };
    const control = canControl(state, me.id);
    switch (msg.t) {
        case 'play': {
            if (!control) return refuse(state, 'forbidden');
            let queue = state.queue;
            const events: JamEvent[] = [];
            if (msg.qid && queue.some((item) => item.qid === msg.qid)) {
                queue = queue.filter((item) => item.qid !== msg.qid);
                events.push({ t: 'qrm', qid: msg.qid });
            }
            const next = playing(msg.track, msg.positionMs, now);
            events.push({ t: 'now', now: next });
            return done({ ...state, queue, now: next }, events);
        }
        case 'pause': {
            if (!control) return refuse(state, 'forbidden');
            if (!state.now || state.now.paused) return done(state, []);
            const next: JamNow = { ...state.now, positionMs: Math.round(expectedPosition(state.now, now)), startedAt: now, paused: true };
            return done({ ...state, now: next }, [{ t: 'now', now: next }]);
        }
        case 'resume': {
            if (!control) return refuse(state, 'forbidden');
            if (!state.now || !state.now.paused) return done(state, []);
            const next: JamNow = { ...state.now, startedAt: now, paused: false };
            return done({ ...state, now: next }, [{ t: 'now', now: next }]);
        }
        case 'seek': {
            if (!control) return refuse(state, 'forbidden');
            if (!state.now) return done(state, []);
            const limit = state.now.track.durationMs > 0 ? state.now.track.durationMs : JAM_LIMITS.durationMs;
            const next: JamNow = { ...state.now, positionMs: Math.round(Math.max(0, Math.min(msg.positionMs, limit))), startedAt: now };
            return done({ ...state, now: next }, [{ t: 'now', now: next }]);
        }
        case 'next': {
            if (!control) return refuse(state, 'forbidden');
            // Второй «закончился» от другого клиента про уже сменившийся трек
            if (msg.from !== undefined && state.now && state.now.track.id !== msg.from) return done(state, []);
            const head = state.queue[0];
            if (!head) return state.now ? done({ ...state, now: null }, [{ t: 'now', now: null }]) : done(state, []);
            const next = playing(head, 0, now);
            return done({ ...state, queue: state.queue.slice(1), now: next }, [{ t: 'qrm', qid: head.qid }, { t: 'now', now: next }]);
        }
        case 'add': {
            if (!canAdd(state, me.id)) return refuse(state, 'forbidden');
            if (state.queue.length >= JAM_LIMITS.queue) return refuse(state, 'queue-full');
            const seq = state.seq + 1;
            const item: JamQueueItem = { ...msg.track, qid: seq.toString(36), addedBy: me.name, ...(me.avatar ? { addedAvatar: me.avatar } : {}) };
            const queue = [...state.queue, item];
            if (queueBytes(queue) > JAM_LIMITS.queueBytes) return refuse(state, 'queue-full');
            return done({ ...state, queue, seq }, [{ t: 'qadd', item, seq }]);
        }
        case 'remove': {
            const item = state.queue.find((entry) => entry.qid === msg.qid);
            if (!item) return refuse(state, 'not-found');
            // Свою запись убирает сам добавивший (по имени), любую: управляющий
            if (!control && item.addedBy !== me.name) return refuse(state, 'forbidden');
            return done({ ...state, queue: state.queue.filter((entry) => entry.qid !== msg.qid) }, [{ t: 'qrm', qid: msg.qid }]);
        }
        case 'move': {
            if (!control) return refuse(state, 'forbidden');
            const from = state.queue.findIndex((entry) => entry.qid === msg.qid);
            if (from < 0) return refuse(state, 'not-found');
            const to = Math.max(0, Math.min(msg.to, state.queue.length - 1));
            if (to === from) return done(state, []);
            const queue = state.queue.slice();
            const [item] = queue.splice(from, 1);
            queue.splice(to, 0, item);
            return done({ ...state, queue }, [{ t: 'qmove', qid: msg.qid, to }]);
        }
        case 'grant': {
            if (!me.isHost) return refuse(state, 'forbidden');
            const target = memberOf(state, msg.id);
            if (!target) return refuse(state, 'not-found');
            if (target.isHost || target.canControl === msg.on) return done(state, []);
            const updated = { ...target, canControl: msg.on };
            return done({ ...state, members: state.members.map((item) => (item.id === target.id ? updated : item)) }, [{ t: 'member', member: updated }]);
        }
        case 'kick': {
            if (!me.isHost) return refuse(state, 'forbidden');
            const target = memberOf(state, msg.id);
            if (!target) return refuse(state, 'not-found');
            if (target.id === me.id) return refuse(state, 'invalid');
            const removed = removeMember(state, target.id);
            return { ...removed, kick: [target.id] };
        }
        case 'settings': {
            if (!me.isHost) return refuse(state, 'forbidden');
            const settings: JamSettings = {
                everyoneCanAdd: msg.everyoneCanAdd ?? state.settings.everyoneCanAdd,
                everyoneCanControl: msg.everyoneCanControl ?? state.settings.everyoneCanControl,
            };
            if (settings.everyoneCanAdd === state.settings.everyoneCanAdd && settings.everyoneCanControl === state.settings.everyoneCanControl) return done(state, []);
            return done({ ...state, settings }, [{ t: 'settings', settings }]);
        }
    }
}

/** То же событие на клиенте */
export function applyEvent(state: JamState, event: JamEvent): JamState {
    switch (event.t) {
        case 'join': return { ...state, members: [...state.members.filter((member) => member.id !== event.member.id), event.member] };
        case 'member': return { ...state, members: state.members.map((member) => (member.id === event.member.id ? event.member : member)) };
        case 'leave': return { ...state, members: state.members.filter((member) => member.id !== event.id).map((member) => ({ ...member, isHost: member.id === event.hostId })) };
        case 'host': return { ...state, members: state.members.map((member) => ({ ...member, isHost: member.id === event.id })) };
        case 'now': return { ...state, now: event.now };
        case 'qadd': return { ...state, queue: [...state.queue, event.item], seq: Math.max(state.seq, event.seq) };
        case 'qrm': return { ...state, queue: state.queue.filter((item) => item.qid !== event.qid) };
        case 'qmove': {
            const from = state.queue.findIndex((item) => item.qid === event.qid);
            if (from < 0) return state;
            const queue = state.queue.slice();
            const [item] = queue.splice(from, 1);
            queue.splice(Math.max(0, Math.min(event.to, queue.length)), 0, item);
            return { ...state, queue };
        }
        case 'settings': return { ...state, settings: event.settings };
    }
}
