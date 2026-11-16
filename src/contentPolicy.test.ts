import { describe, expect, it } from 'vitest';
import { applyChromeProfile, chromeHintHeaders, chromeProfile, isBlankPopup, isGoogleUrl, isShortLink, isSoundCloudUrl, isWebUrl, shortLinkTarget, sitePagePath } from './contentPolicy';
describe('короткая ссылка on.soundcloud.com', () => {
    it('узнаётся только сама короткая ссылка', () => {
        expect(isShortLink('https://on.soundcloud.com/9BWtqT2nIcIiAubq3X')).toBe(true);
        expect(isShortLink('https://on.soundcloud.com/9BWtqT2nIcIiAubq3X/')).toBe(true);
        for (const url of ['https://on.soundcloud.com/', 'https://on.soundcloud.com/a/b', 'http://on.soundcloud.com/abc', 'https://x@on.soundcloud.com/abc',
            'https://on.soundcloud.com.evil.test/abc', 'https://soundcloud.com/abc', 'not a url']) expect(isShortLink(url)).toBe(false);
    });
    it('ведёт на страницу soundcloud.com без меток шаринга, другой адрес отбрасывается', () => {
        expect(shortLinkTarget('https://soundcloud.com/harleyvexx?ref=clipboard&p=a&c=1&si=0ef6&utm_source=clipboard')).toBe('https://soundcloud.com/harleyvexx');
        expect(shortLinkTarget('/griffith_lifts/anabolic-rage-broly/')).toBeNull();
        for (const url of ['https://evil.test/a', 'http://soundcloud.com/a', 'https://soundcloud.com/', 'https://on.soundcloud.com/abc', 'https://a@soundcloud.com/x', 'https://soundcloud.com:8443/a'])
            expect(shortLinkTarget(url)).toBeNull();
    });
});
describe('полная загрузка страницы сайта вместо перехода внутри него', () => {
    const here = 'https://soundcloud.com/discover';
    it('страницы пользователя, трека и плейлиста ведёт роутер сайта', () => {
        expect(sitePagePath('https://soundcloud.com/oslated', here)).toBe('/oslated');
        expect(sitePagePath('https://soundcloud.com/oslated/epsilon-concord', here)).toBe('/oslated/epsilon-concord');
        expect(sitePagePath('https://soundcloud.com/oslated/sets/presence-ii#top', here)).toBe('/oslated/sets/presence-ii');
        expect(sitePagePath('https://soundcloud.com/oslated/epsilon-concord?in=oslated/sets/presence-ii', here)).toBe('/oslated/epsilon-concord?in=oslated/sets/presence-ii');
    });
    it('служебные маршруты, чужие адреса, повтор текущей страницы и странные пути грузятся как просили', () => {
        for (const target of [
            'https://soundcloud.com/logout', 'https://soundcloud.com/signin/callback', 'https://soundcloud.com/connect',
            'https://secure.soundcloud.com/web-auth', 'https://soundcloud.com.evil.test/a', 'http://soundcloud.com/a', 'https://user@soundcloud.com/a', 'https://soundcloud.com:8443/a',
            'https://soundcloud.com/', 'https://soundcloud.com/a/b/download', 'https://soundcloud.com/A/b', 'https://soundcloud.com/a?q=(x)', 'https://soundcloud.com/discover', 'not a url',
        ]) expect(sitePagePath(target, here)).toBeNull();
        expect(sitePagePath('https://soundcloud.com/a', 'https://secure.soundcloud.com/web-auth')).toBeNull();
        expect(sitePagePath('https://soundcloud.com/a', 'about:blank')).toBeNull();
    });
});
describe('окно входа через провайдера', () => {
    it('пустое окно под адрес провайдера разрешено, прочие схемы нет', () => {
        expect(isBlankPopup('about:blank')).toBe(true);
        expect(isBlankPopup('')).toBe(true);
        for (const url of ['javascript:alert(1)', 'file:///C:/x', 'data:text/html,x', 'https://accounts.google.com']) expect(isBlankPopup(url)).toBe(false);
    });
});
describe('navigation boundaries', () => {
    it('accepts real HTTPS origins only', () => {
        for (const url of ['https://soundcloud.com/a/b', 'https://secure.soundcloud.com/']) expect(isSoundCloudUrl(url)).toBe(true);
        for (const url of ['https://soundcloud.com.evil.test', 'https://soundcloud.com@evil.test', 'http://soundcloud.com', 'file:///C:/test', 'javascript:alert(1)', 'https://user:pass@soundcloud.com']) expect(isSoundCloudUrl(url)).toBe(false);
        expect(isWebUrl('https://accounts.google.com')).toBe(true);
        expect(isWebUrl('ms-settings:')).toBe(false);
    });
});
describe('вход через Google: окно как обычный Chrome', () => {
    it('профиль с брендом Google Chrome, версией Electron и платформой', () => {
        const win = chromeProfile('146.0.7680.31', 'win32');
        expect(win.userAgent).toBe('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36');
        expect(win.userAgent).not.toMatch(/Electron|SoundCloud/i);
        expect(win.userAgentMetadata.brands.map((item) => item.brand)).toContain('Google Chrome');
        expect(win.userAgentMetadata.fullVersion).toBe('146.0.7680.31');
        expect(win.userAgentMetadata.platform).toBe('Windows');
        expect(chromeProfile('146.0.7680.31', 'darwin').userAgentMetadata.platform).toBe('macOS');
        expect(chromeProfile('кривая', 'win32').userAgent).toContain('Chrome/140.0.0.0');
    });
    it('подсказки браузера переписываются только у уже отправленных заголовков', () => {
        const profile = chromeProfile('146.0.7680.31', 'win32');
        const next = chromeHintHeaders({ 'sec-ch-ua': '"Chromium";v="146", "Not.A/Brand";v="99"', 'Sec-CH-UA-Platform': '"Windows"', Accept: 'text/html', 'User-Agent': 'x Electron/43' }, profile);
        expect(next['sec-ch-ua']).toBe('"Google Chrome";v="146", "Chromium";v="146", "Not_A Brand";v="24"');
        expect(next['Sec-CH-UA-Platform']).toBe('"Windows"');
        expect(next['User-Agent']).toBe(profile.userAgent);
        expect(next.Accept).toBe('text/html');
        expect(Object.keys(next)).toHaveLength(4);
    });
    it('Google узнаётся только по своим адресам', () => {
        for (const url of ['https://accounts.google.com/v3/signin', 'https://google.com/', 'https://ssl.gstatic.google.com/x']) expect(isGoogleUrl(url)).toBe(true);
        for (const url of ['https://google.com.evil.test/', 'http://accounts.google.com/', 'https://notgoogle.com/', 'https://soundcloud.com/']) expect(isGoogleUrl(url)).toBe(false);
    });
    it('профиль ставится через отладчик окна, а занятый отладчик окно не ломает', async () => {
        const calls: string[] = [];
        let attached = false;
        const target = { debugger: { isAttached: () => attached, attach: () => { attached = true; calls.push('attach'); }, sendCommand: async (method: string) => { calls.push(method); return {}; } } };
        expect(await applyChromeProfile(target, chromeProfile('146.0.0.0', 'win32'))).toBe(true);
        expect(calls).toEqual(['attach', 'Emulation.setUserAgentOverride']);
        const busy = { debugger: { isAttached: () => false, attach: () => { throw new Error('занят'); }, sendCommand: async () => ({}) } };
        expect(await applyChromeProfile(busy, chromeProfile('146.0.0.0', 'win32'))).toBe(false);
    });
});
