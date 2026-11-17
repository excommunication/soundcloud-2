// «Джем» (2.12.0): узкий мост между страницей сайта и клиентом комнаты в main (src/services/jam/client.ts).
// WebSocket живёт в main, страница сети не касается: адрес сервера берётся из настройки jamServer (или JAM_SERVER_DEFAULT),
// страница не выбирает хост. Любое сообщение страницы проходит ту же проверку, что на сервере (parseClientMsg).
import type { IpcRegistry, SenderCheck } from './ipcTypes';
import { jamServerBase, type JamClient, type JamStartResult, type JamUiEvent } from '../services/jam/client';
import { cleanAvatar, cleanName, codeFromInput, parseClientMsg } from '../services/jam/protocol';

/** Адрес сервера джемов, вшитый в сборку. Пусто, пока сервер не развёрнут: после `npx wrangler deploy` впиши сюда
 *  адрес вида https://sc2-jam.<аккаунт>.workers.dev, и настройка «Сервер джемов» в F1 останется только для смены */
export const JAM_SERVER_DEFAULT = 'https://sc2-jam.sc2-prada.workers.dev';

export interface JamIpcDeps {
    trustedSite: SenderCheck;
    client: JamClient;
    /** Значение настройки jamServer */
    setting(): unknown;
    /** Вшитый адрес; по умолчанию JAM_SERVER_DEFAULT (в тестах подменяется) */
    fallback?: string;
}

/** Какой сервер использовать: настройка важнее вшитого адреса; null — не настроен или адрес негодный */
export function jamServerOf(setting: unknown, fallback: string = JAM_SERVER_DEFAULT): { http: string; ws: string } | null {
    return jamServerBase(typeof setting === 'string' && setting.trim() ? setting : fallback);
}

export function registerJamIpc(ipc: IpcRegistry, deps: JamIpcDeps): void {
    for (const channel of ['jam:create', 'jam:join', 'jam:leave', 'jam:send', 'jam:snapshot']) ipc.removeHandler(channel);
    const who = (name: unknown, avatar: unknown): { name: string; avatar: string } => ({ name: cleanName(name) ?? 'SoundCloud', avatar: cleanAvatar(avatar) });

    ipc.handle('jam:create', async (event, name: unknown, avatar: unknown): Promise<JamStartResult> => {
        if (!deps.trustedSite(event)) return { ok: false, error: 'invalid' };
        const base = jamServerOf(deps.setting(), deps.fallback);
        if (!base) return { ok: false, error: 'not-configured' };
        const me = who(name, avatar);
        return deps.client.create(base, me.name, me.avatar);
    });
    ipc.handle('jam:join', (event, code: unknown, name: unknown, avatar: unknown): JamStartResult => {
        if (!deps.trustedSite(event)) return { ok: false, error: 'invalid' };
        const base = jamServerOf(deps.setting(), deps.fallback);
        if (!base) return { ok: false, error: 'not-configured' };
        const clean = codeFromInput(code);
        if (!clean) return { ok: false, error: 'invalid' };
        const me = who(name, avatar);
        return deps.client.join(base, clean, me.name, me.avatar);
    });
    ipc.handle('jam:leave', (event) => {
        if (!deps.trustedSite(event)) return false;
        deps.client.leave();
        return true;
    });
    ipc.handle('jam:send', (event, msg: unknown) => {
        if (!deps.trustedSite(event)) return false;
        const clean = parseClientMsg(typeof msg === 'string' ? msg : JSON.stringify(msg ?? null));
        // ping считает сам клиент: страница им часы не трогает
        return !!clean && clean.t !== 'ping' && deps.client.send(clean);
    });
    // Страница открылась (или перезагрузилась) посреди джема: текущее состояние и настроен ли сервер
    ipc.handle('jam:snapshot', (event): { configured: boolean; events: JamUiEvent[] } | null => {
        if (!deps.trustedSite(event)) return null;
        return { configured: !!jamServerOf(deps.setting(), deps.fallback), events: deps.client.snapshot() };
    });
}
