// Вход через обычный браузер (2.10.2). Google не пускает во встроенные браузеры и приложения (страница «signin/rejected»
// ещё до ввода пароля), обойти это честно нельзя. Поэтому человек входит на soundcloud.com в своём браузере, где Google
// работает, а клиент забирает сессию: две cookie сайта, которые человек сам копирует из браузера.
//   oauth_token         JWT доступа на 24 часа, читается из консоли браузера
//   oauth_refresh_token закрытая (HttpOnly) cookie на полгода, которой сайт продлевает токен; из консоли её не прочитать,
//                       но её вместе с первой отдаёт расширение Cookie-Editor (Export → JSON в буфер обмена)
// Без второй вход держался бы сутки. Принимаются: JSON из Cookie-Editor, строка «имя=значение; …» и одиночный токен.
// Ничего чужого не читается: ни профиль браузера, ни его хранилище паролей и cookie, только то, что человек положил в буфер.
import type { Cookie, CookiesSetDetails } from 'electron';

export const SITE_URL = 'https://soundcloud.com/';
/** Только эти cookie входа: остальные (datadome, согласия) привязаны к тому браузеру и тут лишь мешали бы */
export const LOGIN_COOKIES = ['oauth_token', 'oauth_refresh_token'] as const;
type LoginCookie = (typeof LOGIN_COOKIES)[number];

export interface ImportCookie {
    name: LoginCookie;
    value: string;
    /** Секунды Unix; нет у сеансовой cookie */
    expirationDate?: number;
}
export type ParseResult =
    | { ok: true; cookies: ImportCookie[]; refresh: boolean }
    | { ok: false; reason: 'empty' | 'format' | 'no-token' | 'bad-value' };

const VALUE = /^[\w.~+/=%-]{20,4096}$/;
const isLoginCookie = (name: unknown): name is LoginCookie => typeof name === 'string' && (LOGIN_COOKIES as readonly string[]).includes(name);
const onSite = (domain: unknown): boolean => domain === undefined || (typeof domain === 'string' && /(^|\.)soundcloud\.com$/i.test(domain.replace(/^\./, '')));

function fromList(items: unknown[]): ImportCookie[] {
    const found = new Map<LoginCookie, ImportCookie>();
    for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        const row = item as Record<string, unknown>;
        if (!isLoginCookie(row.name) || typeof row.value !== 'string' || !onSite(row.domain)) continue;
        const expires = typeof row.expirationDate === 'number' ? row.expirationDate : typeof row.expires === 'number' ? row.expires : undefined;
        found.set(row.name, { name: row.name, value: row.value.trim(), ...(expires && Number.isFinite(expires) ? { expirationDate: expires } : {}) });
    }
    return [...found.values()];
}

/** Разбор того, что лежит в буфере: JSON из Cookie-Editor, строка заголовка Cookie или один токен */
export function parseBrowserSession(input: string): ParseResult {
    const text = (input ?? '').trim();
    if (!text) return { ok: false, reason: 'empty' };
    let cookies: ImportCookie[];
    if (text.startsWith('[') || text.startsWith('{')) {
        try {
            const data: unknown = JSON.parse(text);
            const list = Array.isArray(data) ? data : data && typeof data === 'object' && Array.isArray((data as { cookies?: unknown }).cookies) ? (data as { cookies: unknown[] }).cookies : null;
            if (!list) return { ok: false, reason: 'format' };
            cookies = fromList(list);
        } catch {
            return { ok: false, reason: 'format' };
        }
    } else if (/^[\w-]+=/.test(text) || text.includes('; ')) {
        // Заголовок «Cookie: a=1; b=2» или просто «a=1; b=2»
        const pairs = text.replace(/^cookie:\s*/i, '').split(/;\s*/).map((part) => {
            const at = part.indexOf('=');
            return at > 0 ? { name: part.slice(0, at).trim(), value: part.slice(at + 1).trim() } : null;
        });
        cookies = fromList(pairs.filter((pair): pair is { name: string; value: string } => !!pair));
    } else if (VALUE.test(text)) {
        cookies = [{ name: 'oauth_token', value: text }];
    } else {
        return { ok: false, reason: 'format' };
    }
    const token = cookies.find((cookie) => cookie.name === 'oauth_token');
    if (!token) return { ok: false, reason: 'no-token' };
    if (cookies.some((cookie) => !VALUE.test(cookie.value))) return { ok: false, reason: 'bad-value' };
    return { ok: true, cookies, refresh: cookies.some((cookie) => cookie.name === 'oauth_refresh_token') };
}

/** Описание cookie для session.cookies.set: как их ставит сам сайт (замер: host-only, Secure, токен Lax, refresh HttpOnly) */
export function loginCookieDetails(cookie: ImportCookie, now = Date.now()): CookiesSetDetails {
    const refresh = cookie.name === 'oauth_refresh_token';
    // Сеансовая cookie в нашу сессию не прижилась бы: ставим срок как у сайта (токен год, refresh полгода)
    const fallback = now / 1000 + (refresh ? 180 : 365) * 86400;
    return {
        url: SITE_URL,
        name: cookie.name,
        value: cookie.value,
        path: '/',
        secure: true,
        httpOnly: refresh,
        sameSite: refresh ? 'unspecified' : 'lax',
        expirationDate: cookie.expirationDate && cookie.expirationDate > now / 1000 ? cookie.expirationDate : fallback,
    };
}

export interface CookieJar {
    cookies: {
        set(details: CookiesSetDetails): Promise<void>;
        flushStore(): Promise<void>;
        get(filter: { url: string; name: string }): Promise<Cookie[]>;
    };
}
export type ImportResult = ParseResult & { stored?: number };

/** Кладёт cookie входа в сессию клиента и сбрасывает их на диск; страницу перезагружает вызывающий */
export async function importBrowserSession(jar: CookieJar, input: string, now = Date.now()): Promise<ImportResult> {
    const parsed = parseBrowserSession(input);
    if (!parsed.ok) return parsed;
    for (const cookie of parsed.cookies) await jar.cookies.set(loginCookieDetails(cookie, now));
    await jar.cookies.flushStore().catch(() => undefined);
    return { ...parsed, stored: parsed.cookies.length };
}

export interface BrowserLoginTexts {
    title: string;
    message: string;
    detail: string;
    open: string;
    extension: string;
    paste: string;
    cancel: string;
    badTitle: string;
    /** Подпись причины: ключи совпадают с ParseResult.reason */
    bad: Record<'empty' | 'format' | 'no-token' | 'bad-value', string>;
    noRefresh: string;
}
export interface BrowserLoginDeps {
    texts: BrowserLoginTexts;
    openExternal(url: string): Promise<void>;
    readClipboard(): string;
    /** Индекс нажатой кнопки; закрытие окна даёт индекс последней (отмена) */
    ask(options: { title: string; message: string; detail: string; buttons: string[] }): Promise<number>;
    importSession(text: string): Promise<ImportResult>;
    /** Вход принят: страницу перезагрузить, окна Google закрыть */
    done(result: ImportResult): void;
    record(step: string, data?: Record<string, string | number | boolean>): void;
}
export const SIGNIN_URL = 'https://soundcloud.com/signin';
export const COOKIE_EDITOR_URL = 'https://cookie-editor.com/';

/** Диалог «Войти через браузер»: открыть SoundCloud и расширение, потом забрать сессию из буфера. Крутится, пока человек не
 *  вошёл или не отменил: сначала он идёт в браузер, потом возвращается и жмёт «Войти из буфера» */
export async function runBrowserLogin(deps: BrowserLoginDeps): Promise<'done' | 'cancel'> {
    const { texts } = deps;
    const buttons = [texts.open, texts.extension, texts.paste, texts.cancel];
    deps.record('browser-login-start');
    for (let round = 0; round < 12; round++) {
        const choice = await deps.ask({ title: texts.title, message: texts.message, detail: texts.detail, buttons });
        if (choice === 0) {
            await deps.openExternal(SIGNIN_URL).catch(() => undefined);
            deps.record('browser-login-open');
        } else if (choice === 1) {
            await deps.openExternal(COOKIE_EDITOR_URL).catch(() => undefined);
        } else if (choice === 2) {
            const result = await deps.importSession(deps.readClipboard());
            if (result.ok) {
                deps.record('browser-login-done', { cookies: result.stored ?? 0, refresh: result.refresh });
                deps.done(result);
                return 'done';
            }
            deps.record('browser-login-failed', { reason: result.reason });
            await deps.ask({ title: texts.badTitle, message: texts.bad[result.reason], detail: '', buttons: ['OK'] });
        } else {
            deps.record('browser-login-cancel');
            return 'cancel';
        }
    }
    return 'cancel';
}
