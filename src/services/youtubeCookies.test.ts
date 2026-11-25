import { describe, expect, it } from 'vitest';
import { parseYoutubeCookies } from './youtubeCookies';

const editor = [
    { domain: '.youtube.com', hostOnly: false, name: '__Secure-3PSID', value: 'g.a000abc', path: '/', secure: true, expirationDate: 1829744773.5 },
    { domain: '.youtube.com', hostOnly: false, name: 'PREF', value: 'f6=40000000', path: '/', secure: true, expirationDate: 1830004372 },
    { domain: 'www.youtube.com', hostOnly: true, name: 'YSC', value: 'abc', path: '/', secure: true },
    { domain: '.soundcloud.com', hostOnly: false, name: 'oauth_token', value: 'secret', path: '/', secure: true },
];

describe('parseYoutubeCookies', () => {
    it('берёт JSON Cookie-Editor и отбрасывает чужие домены', () => {
        const result = parseYoutubeCookies(JSON.stringify(editor));
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.cookies.map((c) => c.name)).toEqual(['__Secure-3PSID', 'PREF', 'YSC']);
        expect(result.text).toContain('.youtube.com\tTRUE\t/\tTRUE\t1829744773\t__Secure-3PSID\tg.a000abc');
        expect(result.text).toContain('www.youtube.com\tFALSE\t/\tTRUE\t0\tYSC\tabc');
        expect(result.text).not.toContain('oauth_token');
    });

    it('принимает cookies.txt со строками #HttpOnly_', () => {
        const text = '# Netscape HTTP Cookie File\n#HttpOnly_.youtube.com\tTRUE\t/\tTRUE\t1829744773\tSID\tvalue1\n.youtube.com\tTRUE\t/\tFALSE\t0\tVISITOR\tv2\n';
        const result = parseYoutubeCookies(text);
        expect(result.ok && result.cookies.map((c) => c.name)).toEqual(['SID', 'VISITOR']);
    });

    it('без cookie входа просит войти', () => {
        expect(parseYoutubeCookies(JSON.stringify([editor[1]]))).toEqual({ ok: false, reason: 'no-login' });
    });

    it('пустой буфер и мусор', () => {
        expect(parseYoutubeCookies('  ')).toEqual({ ok: false, reason: 'empty' });
        expect(parseYoutubeCookies('[oops')).toEqual({ ok: false, reason: 'format' });
        expect(parseYoutubeCookies('просто текст')).toEqual({ ok: false, reason: 'format' });
    });

    it('значение с табуляцией или переводом строки не пропускается в файл', () => {
        const bad = [{ ...editor[0], value: 'a\nb' }];
        expect(parseYoutubeCookies(JSON.stringify(bad))).toEqual({ ok: false, reason: 'format' });
    });
});
