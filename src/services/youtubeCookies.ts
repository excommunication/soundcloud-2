// Вход YouTube для полных треков: человек входит в YouTube в своём браузере (Google не пускает во встроенные окна), копирует
// cookie расширением Cookie-Editor (Export → JSON) или файлом cookies.txt, а клиент кладёт их в yt-cookies.txt в формате
// Netscape для yt-dlp. Берутся только cookie youtube.com и google.com из того, что человек сам положил в буфер.

export interface NetscapeCookie {
    domain: string;
    /** Cookie действует и на поддомены (домен с точкой в начале) */
    subdomains: boolean;
    path: string;
    secure: boolean;
    /** Секунды Unix; 0 у сеансовой */
    expires: number;
    name: string;
    value: string;
}
export type YoutubeCookiesResult = { ok: true; cookies: NetscapeCookie[]; text: string } | { ok: false; reason: 'empty' | 'format' | 'no-login' };

/** Cookie входа: без хотя бы одной из них YouTube считает запрос анонимным */
const LOGIN = ['SID', '__Secure-1PSID', '__Secure-3PSID', 'LOGIN_INFO', 'SAPISID', '__Secure-3PAPISID'];
const ownDomain = (domain: string): boolean => /(^|\.)(youtube\.com|google\.com)$/i.test(domain.replace(/^\./, ''));
const cleanValue = (value: string): boolean => value.length > 0 && value.length <= 4096 && !/[\t\r\n]/.test(value);
const cleanName = (name: string): boolean => /^[\w.$-]{1,256}$/.test(name);

function fromJson(items: unknown[]): NetscapeCookie[] {
    const out: NetscapeCookie[] = [];
    for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        const row = item as Record<string, unknown>;
        const domain = typeof row.domain === 'string' ? row.domain.trim() : '';
        const name = typeof row.name === 'string' ? row.name : '';
        const value = typeof row.value === 'string' ? row.value : '';
        if (!domain || !ownDomain(domain) || !cleanName(name) || !cleanValue(value)) continue;
        const expires = typeof row.expirationDate === 'number' ? row.expirationDate : typeof row.expires === 'number' ? row.expires : 0;
        const hostOnly = row.hostOnly === true;
        out.push({
            domain: hostOnly ? domain.replace(/^\./, '') : domain.startsWith('.') ? domain : '.' + domain,
            subdomains: !hostOnly,
            path: typeof row.path === 'string' && row.path.startsWith('/') ? row.path : '/',
            secure: row.secure === true,
            expires: Number.isFinite(expires) && expires > 0 ? Math.floor(expires) : 0,
            name,
            value,
        });
    }
    return out;
}

function fromNetscape(text: string): NetscapeCookie[] {
    const out: NetscapeCookie[] = [];
    for (const raw of text.split(/\r?\n/)) {
        // Строки HttpOnly в cookies.txt начинаются с #HttpOnly_: это cookie, а не комментарий
        const line = raw.startsWith('#HttpOnly_') ? raw.slice('#HttpOnly_'.length) : raw;
        if (!line.trim() || line.startsWith('#')) continue;
        const parts = line.split('\t');
        if (parts.length < 7) continue;
        const [domain, flag, path, secure, expires, name, ...rest] = parts;
        const value = rest.join('\t');
        if (!ownDomain(domain) || !cleanName(name) || !cleanValue(value)) continue;
        out.push({ domain, subdomains: flag.toUpperCase() === 'TRUE', path: path || '/', secure: secure.toUpperCase() === 'TRUE', expires: Number(expires) > 0 ? Math.floor(Number(expires)) : 0, name, value });
    }
    return out;
}

export function toNetscape(cookies: NetscapeCookie[]): string {
    const lines = cookies.map((c) => [c.domain, c.subdomains ? 'TRUE' : 'FALSE', c.path, c.secure ? 'TRUE' : 'FALSE', String(c.expires), c.name, c.value].join('\t'));
    return '# Netscape HTTP Cookie File\n# Сделано клиентом SoundCloud из cookie YouTube, которые вставил пользователь\n' + lines.join('\n') + '\n';
}

/** Cookie YouTube из буфера: JSON Cookie-Editor (массив) или текст cookies.txt */
export function parseYoutubeCookies(input: string): YoutubeCookiesResult {
    const text = input.trim();
    if (!text) return { ok: false, reason: 'empty' };
    let cookies: NetscapeCookie[];
    if (text.startsWith('[')) {
        try {
            const value: unknown = JSON.parse(text);
            if (!Array.isArray(value)) return { ok: false, reason: 'format' };
            cookies = fromJson(value);
        } catch {
            return { ok: false, reason: 'format' };
        }
    } else if (text.includes('\t')) {
        cookies = fromNetscape(text);
    } else {
        return { ok: false, reason: 'format' };
    }
    if (!cookies.length) return { ok: false, reason: 'format' };
    if (!cookies.some((cookie) => LOGIN.includes(cookie.name) && /youtube\.com$/i.test(cookie.domain))) return { ok: false, reason: 'no-login' };
    return { ok: true, cookies, text: toNetscape(cookies) };
}

export const YOUTUBE_URL = 'https://www.youtube.com/';
