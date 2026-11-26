import { describe, expect, it } from 'vitest';
import { JAM_LIMITS, type JamClientMsg, type JamMember, type JamState, type JamTrack } from './protocol';
import { addMember, applyEvent, canAdd, canControl, memberOf, newState, pruneMembers, reduce, removeMember, shouldExpire, type Outcome } from './room';

const track = (id: number, extra: Partial<JamTrack> = {}): JamTrack => ({ id, url: 'https://soundcloud.com/a/t' + id, title: 'T' + id, artist: 'A', artwork: '', durationMs: 200000, ...extra });

/** Комната с хозяином h и участниками a, b, как они зашли по порядку */
function room(): JamState {
    let state = newState('ABC234');
    for (const [id, host] of [['h', true], ['a', false], ['b', false]] as const) state = addMember(state, { id, name: id.toUpperCase(), avatar: '' }, host).state;
    return state;
}
function run(state: JamState, id: string, msg: JamClientMsg, now = 1000): Outcome {
    return reduce(state, memberOf(state, id) ?? ({ id } as JamMember), msg, now);
}
/** Клиент, получивший все события подряд, сходится с сервером */
function replay(from: JamState, outcome: Outcome): JamState {
    return outcome.events.reduce(applyEvent, from);
}

describe('участники', () => {
    it('первый становится хозяином, остальные нет', () => {
        const state = room();
        expect(state.members.map((member) => [member.id, member.isHost])).toEqual([['h', true], ['a', false], ['b', false]]);
    });
    it('пятьдесят первого не пускают', () => {
        let state = newState('ABC234');
        for (let i = 0; i < JAM_LIMITS.members; i++) state = addMember(state, { id: 'm' + i, name: 'M', avatar: '' }).state;
        const out = addMember(state, { id: 'x', name: 'X', avatar: '' });
        expect(out.member).toBeUndefined();
        expect(out.reply).toEqual([{ t: 'error', code: 'full' }]);
        expect(out.state.members).toHaveLength(JAM_LIMITS.members);
    });
    it('призраки без сокета убираются, хозяин переходит живому, клиент сходится', () => {
        const before = room();
        const out = pruneMembers(before, new Set(['b']));
        expect(out.state.members.map((member) => [member.id, member.isHost])).toEqual([['b', true]]);
        expect(replay(before, out).members).toEqual(out.state.members);
        const kept = pruneMembers(before, new Set(['h', 'a', 'b']));
        expect(kept.state).toBe(before);
        expect(kept.events).toEqual([]);
    });
    it('полная призраками комната снова пускает после чистки', () => {
        let state = newState('ABC234');
        for (let i = 0; i < JAM_LIMITS.members; i++) state = addMember(state, { id: 'm' + i, name: 'M', avatar: '' }).state;
        const out = addMember(pruneMembers(state, new Set()).state, { id: 'x', name: 'X', avatar: '' });
        expect(out.member?.isHost).toBe(true);
    });
    it('хозяин вышел: самый давний становится хозяином, повторный выход ничего не делает', () => {
        const out = removeMember(room(), 'h');
        expect(out.state.members.map((member) => [member.id, member.isHost])).toEqual([['a', true], ['b', false]]);
        expect(out.events).toEqual([{ t: 'leave', id: 'h', hostId: 'a' }]);
        expect(removeMember(out.state, 'h').events).toEqual([]);
    });
    it('участник вышел: хозяин прежний; последний вышел: комната пуста', () => {
        expect(removeMember(room(), 'b').state.members.find((member) => member.isHost)?.id).toBe('h');
        let state = removeMember(removeMember(room(), 'b').state, 'a').state;
        state = removeMember(state, 'h').state;
        expect(state.members).toEqual([]);
    });
    it('хозяин вернулся по токену и забирает права у назначенного', () => {
        let state = removeMember(room(), 'h').state;
        const back = addMember(state, { id: 'h2', name: 'H', avatar: '' }, true);
        state = back.state;
        expect(state.members.filter((member) => member.isHost).map((member) => member.id)).toEqual(['h2']);
        expect(replay(removeMember(room(), 'h').state, back).members.filter((member) => member.isHost).map((member) => member.id)).toEqual(['h2']);
    });
});

describe('права', () => {
    it('посторонний или не участник ничего не может', () => {
        const state = room();
        expect(reduce(state, { id: 'ghost' } as JamMember, { t: 'pause' }, 1).reply).toEqual([{ t: 'error', code: 'forbidden' }]);
    });
    it('играть, паузить, перематывать, переключать: хозяин и управляющие', () => {
        const state = room();
        for (const msg of [{ t: 'play', track: track(1), positionMs: 0 }, { t: 'pause' }, { t: 'resume' }, { t: 'seek', positionMs: 1 }, { t: 'next' }, { t: 'move', qid: 'x', to: 0 }] as JamClientMsg[]) {
            expect(run(state, 'a', msg).reply, msg.t).toEqual([{ t: 'error', code: 'forbidden' }]);
        }
        expect(run(state, 'h', { t: 'play', track: track(1), positionMs: 0 }).events).toHaveLength(1);
        const granted = run(state, 'h', { t: 'grant', id: 'a', on: true }).state;
        expect(canControl(granted, 'a')).toBe(true);
        expect(run(granted, 'a', { t: 'play', track: track(2), positionMs: 5 }).state.now?.track.id).toBe(2);
        expect(canControl(granted, 'b')).toBe(false);
    });
    it('«все управляют» открывает управление всем, «все добавляют» только очередь', () => {
        let state = run(room(), 'h', { t: 'settings', everyoneCanAdd: true }).state;
        expect(canAdd(state, 'a')).toBe(true);
        expect(canControl(state, 'a')).toBe(false);
        state = run(state, 'h', { t: 'settings', everyoneCanControl: true }).state;
        expect(canControl(state, 'b')).toBe(true);
    });
    it('добавлять без разрешения нельзя, а выдача и выгон только у хозяина', () => {
        const state = room();
        expect(run(state, 'a', { t: 'add', track: track(1) }).reply[0]).toEqual({ t: 'error', code: 'forbidden' });
        expect(run(state, 'a', { t: 'grant', id: 'b', on: true }).reply[0]).toEqual({ t: 'error', code: 'forbidden' });
        expect(run(state, 'a', { t: 'kick', id: 'b' }).reply[0]).toEqual({ t: 'error', code: 'forbidden' });
        expect(run(state, 'a', { t: 'settings', everyoneCanAdd: true }).reply[0]).toEqual({ t: 'error', code: 'forbidden' });
    });
    it('управляющий не может выдать права или выгнать', () => {
        const state = run(room(), 'h', { t: 'grant', id: 'a', on: true }).state;
        expect(run(state, 'a', { t: 'kick', id: 'b' }).kick).toEqual([]);
    });
    it('хозяину нельзя выдать право, себя выгнать тоже', () => {
        const state = room();
        expect(run(state, 'h', { t: 'grant', id: 'h', on: true }).events).toEqual([]);
        expect(run(state, 'h', { t: 'kick', id: 'h' }).reply[0]).toEqual({ t: 'error', code: 'invalid' });
        expect(run(state, 'h', { t: 'grant', id: 'zzz', on: true }).reply[0]).toEqual({ t: 'error', code: 'not-found' });
    });
});

describe('воспроизведение по часам сервера', () => {
    it('play ставит трек со временем сервера', () => {
        const out = run(room(), 'h', { t: 'play', track: track(1), positionMs: 30000 }, 5000);
        expect(out.state.now).toEqual({ track: track(1), startedAt: 5000, positionMs: 30000, paused: false });
    });
    it('пауза запоминает позицию на момент паузы, resume идёт дальше с неё', () => {
        let state = run(room(), 'h', { t: 'play', track: track(1), positionMs: 1000 }, 5000).state;
        state = run(state, 'h', { t: 'pause' }, 9000).state;
        expect(state.now).toMatchObject({ paused: true, positionMs: 5000, startedAt: 9000 });
        state = run(state, 'h', { t: 'resume' }, 20000).state;
        expect(state.now).toMatchObject({ paused: false, positionMs: 5000, startedAt: 20000 });
        // повторная пауза и повторное возобновление ничего не рассылают
        expect(run(state, 'h', { t: 'resume' }, 21000).events).toEqual([]);
        expect(run(run(state, 'h', { t: 'pause' }, 22000).state, 'h', { t: 'pause' }, 23000).events).toEqual([]);
    });
    it('перемотка в пределах трека, на паузе остаётся на паузе', () => {
        let state = run(room(), 'h', { t: 'play', track: track(1), positionMs: 0 }, 1).state;
        expect(run(state, 'h', { t: 'seek', positionMs: 999999999 }, 2).state.now?.positionMs).toBe(200000);
        state = run(state, 'h', { t: 'pause' }, 3).state;
        expect(run(state, 'h', { t: 'seek', positionMs: 5 }, 4).state.now).toMatchObject({ paused: true, positionMs: 5 });
        expect(run(newState('ABC234'), 'h', { t: 'seek', positionMs: 1 }).reply[0]).toEqual({ t: 'error', code: 'forbidden' });
    });
    it('next берёт голову очереди, пустая очередь останавливает джем', () => {
        let state = run(run(room(), 'h', { t: 'add', track: track(7) }).state, 'h', { t: 'add', track: track(8) }).state;
        const first = run(state, 'h', { t: 'next' }, 100);
        expect(first.state.now).toMatchObject({ track: { id: 7 }, startedAt: 100, positionMs: 0 });
        expect(first.events.map((event) => event.t)).toEqual(['qrm', 'now']);
        state = run(first.state, 'h', { t: 'next' }).state;
        expect(state.now?.track.id).toBe(8);
        state = run(state, 'h', { t: 'next' }).state;
        expect(state.now).toBeNull();
    });
    it('add с next ставит трек первым, клиент по событию сходится с сервером', () => {
        const before = run(run(room(), 'h', { t: 'add', track: track(7) }).state, 'h', { t: 'add', track: track(8) }).state;
        const out = run(before, 'h', { t: 'add', track: track(9), next: true });
        expect(out.state.queue.map((item) => item.id)).toEqual([9, 7, 8]);
        expect(out.events[0]).toMatchObject({ t: 'qadd', at: 0 });
        expect(replay(before, out).queue).toEqual(out.state.queue);
        const last = run(before, 'h', { t: 'add', track: track(9) });
        expect(last.state.queue.map((item) => item.id)).toEqual([7, 8, 9]);
        expect(replay(before, last).queue).toEqual(last.state.queue);
        expect(run(room(), 'a', { t: 'add', track: track(1), next: true }).reply[0]).toEqual({ t: 'error', code: 'forbidden' });
    });
    it('next от закончившегося чужого трека (from) не пропускает лишнее', () => {
        let state = run(room(), 'h', { t: 'add', track: track(7) }).state;
        state = run(state, 'h', { t: 'play', track: track(1), positionMs: 0 }).state;
        expect(run(state, 'h', { t: 'next', from: 99 }).events).toEqual([]);
        expect(run(state, 'h', { t: 'next', from: 1 }).state.now?.track.id).toBe(7);
    });
    it('play из очереди убирает запись', () => {
        let state = run(room(), 'h', { t: 'add', track: track(7) }).state;
        const qid = state.queue[0].qid;
        const out = run(state, 'h', { t: 'play', track: track(7), positionMs: 0, qid });
        state = out.state;
        expect(state.queue).toEqual([]);
        expect(out.events.map((event) => event.t)).toEqual(['qrm', 'now']);
    });
});

describe('очередь', () => {
    it('добавление помечает добавившего именем и даёт уникальные номера', () => {
        let state = run(room(), 'h', { t: 'settings', everyoneCanAdd: true }).state;
        state = run(state, 'a', { t: 'add', track: track(1) }).state;
        state = run(state, 'b', { t: 'add', track: track(2) }).state;
        expect(state.queue.map((item) => [item.id, item.addedBy])).toEqual([[1, 'A'], [2, 'B']]);
        expect(new Set(state.queue.map((item) => item.qid)).size).toBe(2);
    });
    it('двести треков, двести первый отклонён', () => {
        let state = room();
        for (let i = 1; i <= JAM_LIMITS.queue; i++) state = run(state, 'h', { t: 'add', track: track(i) }).state;
        expect(state.queue).toHaveLength(JAM_LIMITS.queue);
        expect(run(state, 'h', { t: 'add', track: track(999) }).reply[0]).toEqual({ t: 'error', code: 'queue-full' });
    });
    it('очередь не раздувает хранилище выше лимита байт', () => {
        let state = room();
        const fat = (id: number): JamTrack => track(id, { title: 'x'.repeat(100), artist: 'y'.repeat(60), artwork: 'https://i1.sndcdn.com/' + 'z'.repeat(130) });
        for (let i = 1; i <= JAM_LIMITS.queue; i++) state = run(state, 'h', { t: 'add', track: fat(i) }).state;
        expect(JSON.stringify(state.queue).length).toBeLessThanOrEqual(JAM_LIMITS.queueBytes);
    });
    it('убрать: управляющий любую, участник только свою, чужую нельзя', () => {
        let state = run(room(), 'h', { t: 'settings', everyoneCanAdd: true }).state;
        state = run(state, 'a', { t: 'add', track: track(1) }).state;
        state = run(state, 'b', { t: 'add', track: track(2) }).state;
        const [first, second] = state.queue.map((item) => item.qid);
        expect(run(state, 'a', { t: 'remove', qid: second }).reply[0]).toEqual({ t: 'error', code: 'forbidden' });
        expect(run(state, 'a', { t: 'remove', qid: first }).state.queue.map((item) => item.id)).toEqual([2]);
        expect(run(state, 'h', { t: 'remove', qid: second }).state.queue.map((item) => item.id)).toEqual([1]);
        expect(run(state, 'h', { t: 'remove', qid: 'nope' }).reply[0]).toEqual({ t: 'error', code: 'not-found' });
    });
    it('переставить', () => {
        let state = room();
        for (const id of [1, 2, 3]) state = run(state, 'h', { t: 'add', track: track(id) }).state;
        const out = run(state, 'h', { t: 'move', qid: state.queue[2].qid, to: 0 });
        expect(out.state.queue.map((item) => item.id)).toEqual([3, 1, 2]);
        expect(run(state, 'h', { t: 'move', qid: state.queue[0].qid, to: 99 }).state.queue.map((item) => item.id)).toEqual([2, 3, 1]);
    });
});

describe('состояние клиента сходится с сервером', () => {
    it('любая цепочка сообщений даёт то же состояние, что собрали события', () => {
        let server = room();
        let client = room();
        const steps: Array<[string, JamClientMsg]> = [
            ['h', { t: 'settings', everyoneCanAdd: true }], ['a', { t: 'add', track: track(1) }], ['b', { t: 'add', track: track(2) }], ['h', { t: 'add', track: track(3) }],
            ['h', { t: 'move', qid: '3', to: 0 }], ['h', { t: 'next' }], ['h', { t: 'grant', id: 'a', on: true }], ['a', { t: 'pause' }], ['h', { t: 'remove', qid: '2' }],
            ['h', { t: 'play', track: track(9), positionMs: 10 }], ['h', { t: 'next' }], ['h', { t: 'next' }],
        ];
        for (const [id, msg] of steps) {
            const out = run(server, id, msg, 1000);
            server = out.state;
            client = replay(client, out);
        }
        const leave = removeMember(server, 'h');
        server = leave.state;
        client = replay(client, leave);
        const late = addMember(server, { id: 'c', name: 'C', avatar: '' });
        server = late.state;
        client = replay(client, late);
        expect(client).toEqual(server);
    });
    it('переупорядочение и перезаход идемпотентны', () => {
        const state = room();
        const again = applyEvent(state, { t: 'join', member: { id: 'a', name: 'A2', avatar: '', isHost: false, canControl: false } });
        expect(again.members.filter((member) => member.id === 'a')).toHaveLength(1);
        expect(applyEvent(state, { t: 'qmove', qid: 'none', to: 0 })).toBe(state);
    });
});

describe('ping', () => {
    it('сервер отвечает своим временем', () => {
        expect(run(room(), 'a', { t: 'ping', c: 42 }, 777).reply).toEqual([{ t: 'pong', c: 42, s: 777 }]);
    });
});

describe('кто добавил и стирание комнаты', () => {
    it('добавленный трек несёт имя и аватарку добавившего', () => {
        let state = newState('ABC234');
        state = addMember(state, { id: 'h', name: 'H', avatar: 'https://i1.sndcdn.com/h.jpg' }, true).state;
        state = addMember(state, { id: 'a', name: 'A', avatar: '' }).state;
        state = reduce(state, memberOf(state, 'h')!, { t: 'settings', everyoneCanAdd: true }, 1).state;
        const mine = reduce(state, memberOf(state, 'h')!, { t: 'add', track: track(1) }, 2).state;
        const theirs = reduce(mine, memberOf(mine, 'a')!, { t: 'add', track: track(2) }, 3).state;
        expect(theirs.queue[0]).toMatchObject({ addedBy: 'H', addedAvatar: 'https://i1.sndcdn.com/h.jpg' });
        expect(theirs.queue[1].addedBy).toBe('A');
        expect('addedAvatar' in theirs.queue[1]).toBe(false);
    });
    it('комната не стирается, пока есть хотя бы одно соединение', () => {
        expect(shouldExpire(0)).toBe(true);
        expect(shouldExpire(1)).toBe(false);
        expect(shouldExpire(5)).toBe(false);
    });
});
