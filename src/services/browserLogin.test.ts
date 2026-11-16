import { describe, expect, it, vi } from 'vitest';
import { importBrowserSession, loginCookieDetails, parseBrowserSession, runBrowserLogin, type BrowserLoginDeps, type BrowserLoginTexts } from './browserLogin';

const TOKEN = 'eyJraWQiOiJ0ZXN0IiwiYWxnIjoiUlMyNTYifQ.eyJzdWIiOiJ1c2VyIn0.c2lnbmF0dXJlLXRlc3Q';
const REFRESH = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';

describe('вход через браузер: разбор буфера', () => {
    it('JSON из Cookie-Editor: берёт только cookie входа сайта, чужие домены и прочие cookie отбрасывает', () => {
        const json = JSON.stringify([
            { name: 'oauth_token', value: TOKEN, domain: 'soundcloud.com', expirationDate: 1900000000 },
            { name: 'oauth_refresh_token', value: REFRESH, domain: '.soundcloud.com', httpOnly: true },
            { name: 'datadome', value: 'x'.repeat(40), domain: '.soundcloud.com' },
            { name: 'oauth_token', value: 'чужой', domain: 'evil.example' },
        ]);
        const result = parseBrowserSession(json);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.cookies.map((cookie) => cookie.name).sort()).toEqual(['oauth_refresh_token', 'oauth_token']);
        expect(result.cookies.find((cookie) => cookie.name === 'oauth_token')?.value).toBe(TOKEN);
        expect(result.refresh).toBe(true);
    });
    it('чужой домен не подменяет токен, даже если он единственный', () => {
        const json = JSON.stringify([{ name: 'oauth_token', value: TOKEN, domain: 'soundcloud.com.evil.example' }]);
        expect(parseBrowserSession(json)).toEqual({ ok: false, reason: 'no-token' });
    });
    it('строка заголовка Cookie и объект с полем cookies', () => {
        const header = parseBrowserSession(`Cookie: sc_anonymous_id=1; oauth_token=${TOKEN}; oauth_refresh_token=${REFRESH}`);
        expect(header.ok && header.refresh).toBe(true);
        const wrapped = parseBrowserSession(JSON.stringify({ cookies: [{ name: 'oauth_token', value: TOKEN }] }));
        expect(wrapped.ok && !wrapped.refresh).toBe(true);
    });
    it('одиночный токен: входит, но без refresh (сутки)', () => {
        const result = parseBrowserSession('  ' + TOKEN + '\n');
        expect(result).toEqual({ ok: true, cookies: [{ name: 'oauth_token', value: TOKEN }], refresh: false });
    });
    it('мусор, пустота и порченые значения отклоняются с причиной', () => {
        expect(parseBrowserSession('')).toEqual({ ok: false, reason: 'empty' });
        expect(parseBrowserSession('привет, как дела')).toEqual({ ok: false, reason: 'format' });
        expect(parseBrowserSession('[{oops')).toEqual({ ok: false, reason: 'format' });
        expect(parseBrowserSession(JSON.stringify([{ name: 'sc_session', value: 'x'.repeat(30) }]))).toEqual({ ok: false, reason: 'no-token' });
        expect(parseBrowserSession(JSON.stringify([{ name: 'oauth_token', value: 'короткий токен с пробелом' }]))).toEqual({ ok: false, reason: 'bad-value' });
    });
});

describe('вход через браузер: cookie', () => {
    it('ставятся как у сайта: Secure, host-only, токен Lax, refresh HttpOnly, срок не сеансовый', () => {
        const now = Date.UTC(2026, 10, 16);
        const token = loginCookieDetails({ name: 'oauth_token', value: TOKEN }, now);
        expect(token).toMatchObject({ url: 'https://soundcloud.com/', path: '/', secure: true, httpOnly: false, sameSite: 'lax' });
        expect(token.domain).toBeUndefined();
        expect(token.expirationDate).toBeGreaterThan(now / 1000 + 300 * 86400);
        const refresh = loginCookieDetails({ name: 'oauth_refresh_token', value: REFRESH, expirationDate: 1 }, now);
        expect(refresh.httpOnly).toBe(true);
        expect(refresh.expirationDate).toBeGreaterThan(now / 1000 + 170 * 86400);
    });
    it('importBrowserSession кладёт cookie в сессию и сбрасывает их на диск, при ошибке ничего не трогает', async () => {
        const set = vi.fn().mockResolvedValue(undefined);
        const flushStore = vi.fn().mockResolvedValue(undefined);
        const jar = { cookies: { set, flushStore, get: vi.fn() } };
        const bad = await importBrowserSession(jar, 'мусор');
        expect(bad.ok).toBe(false);
        expect(set).not.toHaveBeenCalled();
        const ok = await importBrowserSession(jar, JSON.stringify([{ name: 'oauth_token', value: TOKEN }, { name: 'oauth_refresh_token', value: REFRESH }]));
        expect(ok).toMatchObject({ ok: true, stored: 2, refresh: true });
        expect(set).toHaveBeenCalledTimes(2);
        expect(flushStore).toHaveBeenCalledOnce();
    });
});

const texts: BrowserLoginTexts = {
    title: 'Вход', message: 'm', detail: 'd', open: 'Открыть', extension: 'Расширение', paste: 'Из буфера', cancel: 'Отмена', badTitle: 'Не вышло',
    bad: { empty: 'пусто', format: 'формат', 'no-token': 'нет токена', 'bad-value': 'порча' }, noRefresh: 'сутки',
};
function setup(answers: number[], clipboard: string, imported: Awaited<ReturnType<BrowserLoginDeps['importSession']>>) {
    const log = { opened: [] as string[], asked: [] as string[], steps: [] as string[], done: 0 };
    const queue = [...answers];
    const value: BrowserLoginDeps = {
        texts,
        openExternal: async (url) => { log.opened.push(url); },
        readClipboard: () => clipboard,
        ask: async (options) => { log.asked.push(options.title); return queue.shift() ?? 3; },
        importSession: async () => imported,
        done: () => { log.done++; },
        record: (step) => { log.steps.push(step); },
    };
    return { value, log };
}

describe('вход через браузер: диалог', () => {
    it('открывает SoundCloud и расширение, потом принимает сессию из буфера', async () => {
        const { value, log } = setup([0, 1, 2], TOKEN, { ok: true, cookies: [], refresh: true, stored: 2 });
        expect(await runBrowserLogin(value)).toBe('done');
        expect(log.opened).toEqual(['https://soundcloud.com/signin', 'https://cookie-editor.com/']);
        expect(log.done).toBe(1);
        expect(log.steps).toContain('browser-login-done');
    });
    it('буфер не подошёл: объясняет причину и остаётся в диалоге, отмена закрывает', async () => {
        const { value, log } = setup([2, 3], 'мусор', { ok: false, reason: 'format' });
        expect(await runBrowserLogin(value)).toBe('cancel');
        expect(log.asked).toEqual(['Вход', 'Не вышло', 'Вход']);
        expect(log.done).toBe(0);
        expect(log.steps).toEqual(['browser-login-start', 'browser-login-failed', 'browser-login-cancel']);
    });
});
