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

/** Окно входа через провайдера (2.9.0). Google не пускал «Войти через Google» во встроенное окно ни с User-Agent Chrome,
 *  ни с полным профилем Chrome через отладчик (2.8.5): встроенный Chromium без бренда Google Chrome он узнаёт по
 *  поведению движка, а подключённый отладчик сам по себе признак автоматизации. Окно входа теперь представляется
 *  Firefox: у Firefox нет client hints, и Google проверяет его по другим правилам, которые Chromium проходит.
 *  Окна Apple и Facebook получают тот же профиль, у них Firefox поддерживается наравне с Chrome */
export function firefoxUserAgent(platform: string): string {
    const os = platform === 'darwin' ? 'Macintosh; Intel Mac OS X 10.15' : platform === 'linux' ? 'X11; Linux x86_64' : 'Windows NT 10.0; Win64; x64';
    return 'Mozilla/5.0 (' + os + '; rv:' + FIREFOX_VERSION + ') Gecko/20100101 Firefox/' + FIREFOX_VERSION;
}
/** Версия ESR: Google не просит обновить браузер ещё год с лишним */
export const FIREFOX_VERSION = '140.0';
/** Адрес Google, где проверяется браузер: вход и его служебные страницы */
export function isGoogleUrl(value: string): boolean {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && (url.hostname === 'google.com' || url.hostname.endsWith('.google.com'));
    } catch { return false; }
}
/** Страница Google «Не удалось войти, этот браузер или приложение небезопасны» */
export function isGoogleRejection(value: string): boolean {
    if (!isGoogleUrl(value)) return false;
    try {
        const path = new URL(value).pathname;
        return /\/signin\/(?:[a-z0-9]+\/)*(?:rejected|disallowed)\b/i.test(path);
    } catch { return false; }
}
/** Заголовки запроса окна входа как у Firefox: свой User-Agent, без client hints Chromium (Sec-CH-UA*), которых Firefox не шлёт */
export function firefoxHeaders(headers: Record<string, string | string[]>, userAgent: string): Record<string, string | string[]> {
    const next: Record<string, string | string[]> = {};
    for (const [key, value] of Object.entries(headers)) {
        const name = key.toLowerCase();
        if (name.startsWith('sec-ch-ua')) continue;
        next[key] = name === 'user-agent' ? userAgent : value;
    }
    if (!Object.keys(next).some((key) => key.toLowerCase() === 'user-agent')) next['User-Agent'] = userAgent;
    return next;
}

export interface ProtectOptions {
    openExternal(url: string): Promise<void>;
    /** Google отказал во входе: клиент подсказывает другие способы */
    onAuthRejected?(): void;
}

export function protectContent(contents: WebContents, options: ProtectOptions | ((url: string) => Promise<void>)): void {
    const opts: ProtectOptions = typeof options === 'function' ? { openExternal: options } : options;
    const { openExternal } = opts;
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
    const userAgent = firefoxUserAgent(process.platform);
    // Окна входа по id: заголовки как у Firefox получают только их запросы, сайт и его reCAPTCHA остаются Chrome
    const authWindows = new Set<number>();
    contents.session.webRequest.onBeforeSendHeaders((details, callback) => {
        const id = details.webContentsId;
        callback({ requestHeaders: id !== undefined && authWindows.has(id) ? firefoxHeaders(details.requestHeaders, userAgent) : details.requestHeaders });
    });
    // Вход через внешнего провайдера: окно делит сессию и opener с сайтом (так SoundCloud получает ответ провайдера
    // и cookies входа сразу видны основному окну), но без preload клиента и с профилем Firefox до первой загрузки
    contents.setWindowOpenHandler(({ url }) => isWebUrl(url) || isBlankPopup(url) ? {
        action: 'allow',
        overrideBrowserWindowOptions: {
            width: 520,
            height: 720,
            minWidth: 380,
            minHeight: 520,
            autoHideMenuBar: true,
            backgroundColor: '#ffffff',
            webPreferences: { sandbox: true, nodeIntegration: false, contextIsolation: true, preload: '', webSecurity: true, devTools: false },
        },
    } : { action: 'deny' });
    contents.on('did-create-window', (window) => {
        const popup = window.webContents;
        const id = popup.id;
        authWindows.add(id);
        popup.setUserAgent(userAgent);
        popup.setWindowOpenHandler(({ url }) => {
            // Ссылки «Справка», «Политика» и прочие из окна входа открываются в браузере
            if (isWebUrl(url)) void openExternal(url).catch(console.error);
            return { action: 'deny' };
        });
        popup.on('will-navigate', (event, url) => { if (!isWebUrl(url)) event.preventDefault(); });
        popup.on('will-redirect', (event, url) => { if (!isWebUrl(url)) event.preventDefault(); });
        let rejected = false;
        popup.on('did-navigate', (_event, url) => {
            if (rejected || !isGoogleRejection(url)) return;
            rejected = true;
            opts.onAuthRejected?.();
        });
        window.once('closed', () => {
            authWindows.delete(id);
            // Вход прошёл в общей сессии: cookies сразу на диск, чтобы перезапуск клиента не разлогинил
            void contents.session.cookies.flushStore().catch(() => undefined);
        });
    });
}
