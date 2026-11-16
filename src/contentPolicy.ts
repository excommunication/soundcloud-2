import type { WebContents } from 'electron';

export function isSoundCloudUrl(value: string): boolean {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && !url.username && !url.password &&
            (url.hostname === 'soundcloud.com' || url.hostname.endsWith('.soundcloud.com'));
    } catch { return false; }
}
/** Окно входа сначала открывается пустым (window.open('') или about:blank), и только потом ему задаётся адрес провайдера.
 *  Раньше такое окно отклонялось, и сайт писал «Please enable popup windows and try again» */
export function isBlankPopup(value: string): boolean {
    return value === '' || value === 'about:blank';
}
export function isWebUrl(value: string): boolean {
    try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; }
    catch { return false; }
}

// Где сайт сам просит полную загрузку: вход, выход, привязка аккаунтов
const FULL_LOAD_ROUTES = new Set(['logout', 'signin', 'signup', 'login', 'connect', 'oauth', 'oauth2', 'email-preferences']);
const PAGE_PATH = /^\/([a-z0-9_-]{1,100})(?:\/(?:sets\/)?[a-z0-9_-]{1,255})?$/;
const PAGE_QUERY = /^(?:\?[A-Za-z0-9_.~%&=+/-]{1,500})?$/;

// Путь страницы пользователя, трека или плейлиста, если полную загрузку этой страницы можно заменить переходом
// внутри сайта. null значит «пусть грузится как просили»: другой адрес, служебный маршрут или повтор текущей страницы
export function sitePagePath(target: string, current: string): string | null {
    let to: URL;
    let from: URL;
    try {
        to = new URL(target);
        from = new URL(current);
    } catch {
        return null;
    }
    if (to.protocol !== 'https:' || to.hostname !== 'soundcloud.com' || to.username || to.password || to.port) return null;
    if (from.protocol !== 'https:' || from.hostname !== 'soundcloud.com') return null;
    if (to.pathname === from.pathname && to.search === from.search) return null;
    const page = PAGE_PATH.exec(to.pathname);
    if (!page || FULL_LOAD_ROUTES.has(page[1]) || !PAGE_QUERY.test(to.search)) return null;
    return to.pathname + to.search;
}

// Короткая ссылка из мобильного «Поделиться»: on.soundcloud.com/<ключ>
export function isShortLink(value: string): boolean {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && url.hostname === 'on.soundcloud.com' && !url.username && !url.password && !url.port &&
            /^\/[a-z0-9]{1,64}\/?$/i.test(url.pathname);
    } catch { return false; }
}

// Куда ведёт короткая ссылка: страница soundcloud.com без меток шаринга (ref, si, utm). Другой адрес не принимается
export function shortLinkTarget(location: string): string | null {
    try {
        const url = new URL(location, 'https://on.soundcloud.com/');
        if (url.protocol !== 'https:' || url.hostname !== 'soundcloud.com' || url.username || url.password || url.port) return null;
        const path = url.pathname.replace(/\/+$/, '');
        return path ? url.origin + path : null;
    } catch { return null; }
}

/** Профиль настоящего Chrome для окна входа (2.8.5). Google пускает «Войти через Google» только в обычный браузер и
 *  узнаёт встроенный не по строке User-Agent (она у клиента и так как у Chrome), а по client hints: заголовкам Sec-CH-UA
 *  и navigator.userAgentData, где у Electron нет бренда «Google Chrome». Здесь всё вместе, как у Chrome той же версии */
export interface ChromeProfile {
    userAgent: string;
    userAgentMetadata: {
        brands: Array<{ brand: string; version: string }>;
        fullVersionList: Array<{ brand: string; version: string }>;
        fullVersion: string;
        platform: string;
        platformVersion: string;
        architecture: string;
        model: string;
        mobile: boolean;
        bitness: string;
        wow64: boolean;
    };
}
export function chromeProfile(chromeVersion: string, platform: string): ChromeProfile {
    const full = /^\d+(\.\d+){0,3}$/.test(chromeVersion) ? chromeVersion : '140.0.0.0';
    const major = full.split('.')[0];
    const mac = platform === 'darwin';
    const os = mac ? 'Macintosh; Intel Mac OS X 10_15_7' : 'Windows NT 10.0; Win64; x64';
    // Порядок и «мусорный» бренд как у Chrome: по нему сайты отличают настоящий браузер от подделки без бренда
    const brands = [{ brand: 'Google Chrome', version: major }, { brand: 'Chromium', version: major }, { brand: 'Not_A Brand', version: '24' }];
    return {
        userAgent: 'Mozilla/5.0 (' + os + ') AppleWebKit/537.36 (KHTML, like Gecko) Chrome/' + major + '.0.0.0 Safari/537.36',
        userAgentMetadata: {
            brands,
            fullVersionList: [{ brand: 'Google Chrome', version: full }, { brand: 'Chromium', version: full }, { brand: 'Not_A Brand', version: '24.0.0.0' }],
            fullVersion: full,
            platform: mac ? 'macOS' : 'Windows',
            platformVersion: mac ? '15.0.0' : '15.0.0',
            architecture: mac ? 'arm' : 'x86',
            model: '',
            mobile: false,
            bitness: '64',
            wow64: false,
        },
    };
}
/** Адрес Google, где проверяется браузер: вход и его служебные страницы */
export function isGoogleUrl(value: string): boolean {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && (url.hostname === 'google.com' || url.hostname.endsWith('.google.com'));
    } catch { return false; }
}
const brandList = (list: Array<{ brand: string; version: string }>): string => list.map((item) => '"' + item.brand + '";v="' + item.version + '"').join(', ');
/** Заголовки client hints запроса к Google под профиль Chrome: самый первый запрос окна уходит раньше, чем профиль
 *  встанет через отладчик. Подменяются только уже отправленные браузером подсказки, новых не добавляется */
export function chromeHintHeaders(headers: Record<string, string | string[]>, profile: ChromeProfile): Record<string, string | string[]> {
    const meta = profile.userAgentMetadata;
    const values: Record<string, string> = {
        'user-agent': profile.userAgent,
        'sec-ch-ua': brandList(meta.brands),
        'sec-ch-ua-full-version-list': brandList(meta.fullVersionList),
        'sec-ch-ua-full-version': '"' + meta.fullVersion + '"',
        'sec-ch-ua-platform': '"' + meta.platform + '"',
        'sec-ch-ua-mobile': '?0',
    };
    const next: Record<string, string | string[]> = {};
    for (const [key, value] of Object.entries(headers)) next[key] = values[key.toLowerCase()] ?? value;
    return next;
}
/** Отладчик окна, через который ставится профиль Chrome: только то, что нужно, чтобы проверить код без Electron */
export interface ProfileTarget {
    debugger: {
        isAttached(): boolean;
        attach(version?: string): void;
        sendCommand(method: string, params?: Record<string, unknown>): Promise<unknown>;
    };
}
/** Поставить окну профиль Chrome до первой загрузки. Не вышло (отладчик занят): окно работает как раньше */
export async function applyChromeProfile(target: ProfileTarget, profile: ChromeProfile): Promise<boolean> {
    try {
        if (!target.debugger.isAttached()) target.debugger.attach('1.3');
        await target.debugger.sendCommand('Emulation.setUserAgentOverride', { userAgent: profile.userAgent, acceptLanguage: '', userAgentMetadata: profile.userAgentMetadata });
        return true;
    } catch (error) {
        console.warn('Окно входа: профиль Chrome не поставлен', error);
        return false;
    }
}

export function protectContent(contents: WebContents, openExternal: (url: string) => Promise<void>): void {
    contents.session.setPermissionCheckHandler((_contents, permission, origin) =>
        permission === 'mediaKeySystem' && isSoundCloudUrl(origin));
    contents.session.setPermissionRequestHandler((_contents, permission, callback, details) =>
        callback(permission === 'mediaKeySystem' && isSoundCloudUrl(details.requestingUrl)));
    contents.on('will-navigate', (event, url) => {
        if (isSoundCloudUrl(url)) return;
        event.preventDefault();
        if (isWebUrl(url)) void openExternal(url).catch(console.error);
    });
    contents.on('will-redirect', (event, url) => {
        if (!isSoundCloudUrl(url)) event.preventDefault();
    });
    // Запросы к Google с подсказками браузера как у Chrome: окно входа делит сессию с сайтом
    const profile = chromeProfile(process.versions.chrome, process.platform);
    contents.session.webRequest.onBeforeSendHeaders({ urls: ['https://*.google.com/*', 'https://google.com/*'] }, (details, callback) =>
        callback({ requestHeaders: isGoogleUrl(details.url) ? chromeHintHeaders(details.requestHeaders, profile) : details.requestHeaders }));
    // Вход через внешнего провайдера сохраняет opener и сессию, но не получает preload клиента.
    contents.setWindowOpenHandler(({ url }) => isWebUrl(url) || isBlankPopup(url) ? {
        action: 'allow',
        overrideBrowserWindowOptions: {
            autoHideMenuBar: true,
            webPreferences: { sandbox: true, nodeIntegration: false, contextIsolation: true, preload: '', webSecurity: true },
        },
    } : { action: 'deny' });
    contents.on('did-create-window', (window) => {
        // Окно входа выглядит для провайдера как обычный Chrome, иначе Google пишет «Этот браузер небезопасен»
        void applyChromeProfile(window.webContents, profile);
        window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
        window.webContents.on('will-navigate', (event, url) => { if (!isWebUrl(url)) event.preventDefault(); });
        window.webContents.on('will-redirect', (event, url) => { if (!isWebUrl(url)) event.preventDefault(); });
    });
}
