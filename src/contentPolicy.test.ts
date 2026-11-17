import { describe, expect, it } from 'vitest';
import { isAllowedPermission, FIREFOX_VERSION, firefoxHeaders, firefoxUserAgent, isBlankPopup, isGoogleRejection, isGoogleUrl, isShortLink, isSoundCloudUrl, isWebUrl, shortLinkTarget, sitePagePath } from './contentPolicy';
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
describe('вход через Google: окно входа как Firefox', () => {
    it('User-Agent Firefox без Electron и имени клиента под каждую систему', () => {
        const win = firefoxUserAgent('win32');
        expect(win).toBe('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:' + FIREFOX_VERSION + ') Gecko/20100101 Firefox/' + FIREFOX_VERSION);
        expect(win).not.toMatch(/Electron|SoundCloud|Chrome/i);
        expect(firefoxUserAgent('darwin')).toContain('Macintosh');
        expect(firefoxUserAgent('linux')).toContain('Linux');
    });
    it('client hints Chromium убираются, User-Agent подменяется, прочие заголовки как были', () => {
        const ua = firefoxUserAgent('win32');
        const next = firefoxHeaders({ 'sec-ch-ua': '"Chromium";v="146"', 'Sec-CH-UA-Platform': '"Windows"', 'sec-ch-ua-mobile': '?0', Accept: 'text/html', 'User-Agent': 'x Electron/43' }, ua);
        expect(next).toEqual({ Accept: 'text/html', 'User-Agent': ua });
        expect(firefoxHeaders({ Accept: '*/*' }, ua)['User-Agent']).toBe(ua);
    });
    it('Google узнаётся только по своим адресам', () => {
        for (const url of ['https://accounts.google.com/v3/signin', 'https://google.com/', 'https://ssl.gstatic.google.com/x']) expect(isGoogleUrl(url)).toBe(true);
        for (const url of ['https://google.com.evil.test/', 'http://accounts.google.com/', 'https://notgoogle.com/', 'https://soundcloud.com/']) expect(isGoogleUrl(url)).toBe(false);
    });
    it('страница отказа Google узнаётся, обычный вход нет', () => {
        expect(isGoogleRejection('https://accounts.google.com/v3/signin/rejected?continue=x')).toBe(true);
        expect(isGoogleRejection('https://accounts.google.com/signin/v2/disallowed')).toBe(true);
        expect(isGoogleRejection('https://accounts.google.com/v3/signin/identifier?flowName=GlifWebSignIn')).toBe(false);
        expect(isGoogleRejection('https://evil.test/signin/rejected')).toBe(false);
    });
});

describe('разрешения страницы сайта', () => {
    it('DRM и захват окна только для SoundCloud, остальное отказ', () => {
        expect(isAllowedPermission('mediaKeySystem', 'https://soundcloud.com/')).toBe(true);
        expect(isAllowedPermission('display-capture', 'https://soundcloud.com/discover')).toBe(true);
        expect(isAllowedPermission('display-capture', 'https://evil.example/')).toBe(false);
        expect(isAllowedPermission('media', 'https://soundcloud.com/')).toBe(false);
        expect(isAllowedPermission('geolocation', 'https://soundcloud.com/')).toBe(false);
    });
});
