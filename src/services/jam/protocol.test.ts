import { describe, expect, it } from 'vitest';
import { JAM_ALPHABET, JAM_LIMITS, cleanAvatar, cleanName, codeFromInput, makeCode, parseClientMsg, parseCode, parseServerMsg, parseTrack } from './protocol';
import { addMember, newState } from './room';

const track = { id: 5, url: 'https://soundcloud.com/artist/song-1', title: 'Song', artist: 'Artist', artwork: 'https://i1.sndcdn.com/artworks-x-t500x500.jpg', durationMs: 123456 };

describe('код комнаты', () => {
    it('алфавит без похожих знаков', () => {
        expect(JAM_ALPHABET).toHaveLength(31);
        for (const bad of '01OIL') expect(JAM_ALPHABET).not.toContain(bad);
    });
    it('сгенерированный код: 6 знаков алфавита, без смещения (байты выше предела отбрасываются)', () => {
        const code = makeCode((n) => Uint8Array.from({ length: n }, (_, i) => (i * 37 + 250) % 256));
        expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
        // 248 и больше отбрасываются: из одних таких байтов код не получится, пока не придёт годный
        let calls = 0;
        const out = makeCode((n) => (calls++ < 2 ? new Uint8Array(n).fill(255) : new Uint8Array(n).fill(0)));
        expect(out).toBe('AAAAAA');
        expect(calls).toBe(3);
    });
    it('разбор кода и ссылки', () => {
        expect(parseCode(' abc234 ')).toBe('ABC234');
        expect(parseCode('ABC23')).toBeNull();
        expect(parseCode('ABC230')).toBeNull();
        expect(parseCode(5)).toBeNull();
        expect(codeFromInput('sc2://jam/abc234')).toBe('ABC234');
        expect(codeFromInput('sc2://jam/abc234/')).toBe('ABC234');
        expect(codeFromInput('https://evil/abc234')).toBeNull();
        expect(codeFromInput('sc2://jam/ABC234?x=1')).toBeNull();
    });
});

describe('имя и аватарка', () => {
    it('имя: сжимается, режется по лимиту, пустое и длинное отклоняются', () => {
        expect(cleanName('  Вася \n  Пупкин ')).toBe('Вася Пупкин');
        expect(cleanName('')).toBeNull();
        expect(cleanName('   ')).toBeNull();
        expect(cleanName('x'.repeat(JAM_LIMITS.name))).not.toBeNull();
        expect(cleanName('x'.repeat(JAM_LIMITS.name + 1))).toBeNull();
        expect(cleanName(5)).toBeNull();
    });
    it('аватарка: только sndcdn по https', () => {
        expect(cleanAvatar('https://i1.sndcdn.com/avatars-1-large.jpg')).toBe('https://i1.sndcdn.com/avatars-1-large.jpg');
        for (const bad of ['http://i1.sndcdn.com/a.jpg', 'https://evil.com/a.jpg', 'https://sndcdn.com.evil.com/a.jpg', 'javascript:alert(1)', 'https://x.sndcdn.com/' + 'a'.repeat(200), 7]) expect(cleanAvatar(bad)).toBe('');
    });
});

describe('трек', () => {
    it('нормальный проходит и округляется', () => {
        expect(parseTrack({ ...track, durationMs: 1.6 })?.durationMs).toBe(2);
        expect(parseTrack({ ...track, artwork: undefined })?.artwork).toBe('');
    });
    it('отклоняются чужой хост, не https, лишний путь, длинные поля, плохой id, чужая картинка', () => {
        for (const patch of [
            { url: 'https://evil.com/a/b' }, { url: 'http://soundcloud.com/a/b' }, { url: 'https://soundcloud.com/a' }, { url: 'https://soundcloud.com/a/b/c' }, { url: 'https://soundcloud.com/a/b?x=1' },
            { url: 'https://soundcloud.com.evil.com/a/b' }, { title: 'x'.repeat(101) }, { artist: 'x'.repeat(61) }, { id: 0 }, { id: 1.5 }, { id: '5' }, { durationMs: -1 }, { durationMs: Infinity },
            { artwork: 'https://evil.com/a.jpg' }, { title: 'a\nb' }, { artwork: 'x'.repeat(200) },
        ]) expect(parseTrack({ ...track, ...patch }), JSON.stringify(patch)).toBeNull();
        expect(parseTrack(null)).toBeNull();
        expect(parseTrack([])).toBeNull();
    });
});

describe('сообщения клиента', () => {
    const ok = (msg: unknown) => parseClientMsg(JSON.stringify(msg));
    it('допустимые проходят', () => {
        expect(ok({ t: 'ping', c: 1 })).toEqual({ t: 'ping', c: 1 });
        expect(ok({ t: 'play', track, positionMs: 5 })).toMatchObject({ t: 'play', positionMs: 5 });
        expect(ok({ t: 'play', track, positionMs: 5, qid: 'a' })).toMatchObject({ qid: 'a' });
        expect(ok({ t: 'pause' })).toEqual({ t: 'pause' });
        expect(ok({ t: 'resume' })).toEqual({ t: 'resume' });
        expect(ok({ t: 'seek', positionMs: 10 })).toEqual({ t: 'seek', positionMs: 10 });
        expect(ok({ t: 'next' })).toEqual({ t: 'next' });
        expect(ok({ t: 'next', from: 5 })).toEqual({ t: 'next', from: 5 });
        expect(ok({ t: 'add', track })).toMatchObject({ t: 'add' });
        expect(ok({ t: 'remove', qid: 'a' })).toEqual({ t: 'remove', qid: 'a' });
        expect(ok({ t: 'move', qid: 'a', to: 3 })).toEqual({ t: 'move', qid: 'a', to: 3 });
        expect(ok({ t: 'grant', id: 'x', on: true })).toEqual({ t: 'grant', id: 'x', on: true });
        expect(ok({ t: 'kick', id: 'x' })).toEqual({ t: 'kick', id: 'x' });
        expect(ok({ t: 'settings', everyoneCanAdd: true })).toEqual({ t: 'settings', everyoneCanAdd: true });
    });
    it('мусор отклоняется', () => {
        for (const bad of [
            'не json', '[]', '"x"', 'null', { t: 'nope' }, {}, { t: 'ping', c: 'x' }, { t: 'play', track, positionMs: -1 }, { t: 'play', track: { ...track, url: 'https://a.b/c/d' }, positionMs: 0 },
            { t: 'seek', positionMs: NaN }, { t: 'seek', positionMs: 1e12 }, { t: 'next', from: 'x' }, { t: 'remove' }, { t: 'move', qid: 'a', to: 1.5 }, { t: 'move', qid: 'a', to: -1 },
            { t: 'grant', id: 'x', on: 'yes' }, { t: 'kick', id: '' }, { t: 'settings' }, { t: 'settings', everyoneCanAdd: 1 }, { t: 'add', track: null },
        ]) expect(parseClientMsg(typeof bad === 'string' ? bad : JSON.stringify(bad)), JSON.stringify(bad)).toBeNull();
    });
    it('сообщение крупнее 8 КБ отклоняется до разбора', () => {
        expect(parseClientMsg('{"t":"pause","pad":"' + 'x'.repeat(JAM_LIMITS.message) + '"}')).toBeNull();
    });
    it('принимает и готовый объект; не строку и не объект: нет', () => {
        expect(parseClientMsg({ t: 'pause' })).toEqual({ t: 'pause' });
        expect(parseClientMsg(5)).toBeNull();
    });
});

describe('сообщения сервера', () => {
    const state = addMember(newState('ABC234'), { id: 'h', name: 'H', avatar: '' }, true).state;
    it('hello со снимком проходит туда и обратно', () => {
        const hello = { t: 'hello', you: 'h', state, serverNow: 1234 };
        expect(parseServerMsg(JSON.stringify(hello))).toEqual(hello);
    });
    it('события, pong, ошибки', () => {
        const member = { id: 'a', name: 'A', avatar: '', isHost: false, canControl: false };
        for (const msg of [
            { t: 'join', member }, { t: 'member', member }, { t: 'leave', id: 'a', hostId: 'h' }, { t: 'host', id: 'a' }, { t: 'now', now: null },
            { t: 'now', now: { track, startedAt: 1, positionMs: 0, paused: false } }, { t: 'qadd', item: { ...track, qid: '1', addedBy: 'A' }, seq: 1 }, { t: 'qrm', qid: '1' },
            { t: 'qmove', qid: '1', to: 0 }, { t: 'settings', settings: { everyoneCanAdd: true, everyoneCanControl: false } }, { t: 'pong', c: 1, s: 2 }, { t: 'kicked' }, { t: 'error', code: 'rate' },
        ]) expect(parseServerMsg(JSON.stringify(msg)), msg.t).toEqual(msg);
    });
    it('клиент не верит сети: чужая картинка в снимке, неизвестное, лишнее', () => {
        const poisoned = { t: 'hello', you: 'h', serverNow: 1, state: { ...state, queue: [{ ...track, artwork: 'https://evil.com/x.jpg', qid: '1', addedBy: 'A' }] } };
        expect(parseServerMsg(JSON.stringify(poisoned))).toBeNull();
        expect(parseServerMsg('{"t":"boom"}')).toBeNull();
        expect(parseServerMsg('{"t":"error","code":"hax"}')).toBeNull();
        expect(parseServerMsg('x'.repeat(500000))).toBeNull();
        expect(parseServerMsg(JSON.stringify({ t: 'hello', you: 'h', serverNow: 1, state: { ...state, members: Array.from({ length: 51 }, () => state.members[0]) } }))).toBeNull();
    });
});
