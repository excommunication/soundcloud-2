// «Волна по описанию»: план запроса для страницы, настройки языковой модели для F1 и «Без русского» из блока волны.
// Ключ модели хранится зашифрованным средствами системы (safeStorage); в F1 и на страницу он не возвращается
import { AI_DEFAULTS, AI_PROVIDERS, isAiConfig, planVibe, type AiConfig, type AiProvider, type FetchLike, type VibeContext } from '../services/vibeSearch';
import type { SettingChange } from '../settings/validateSetting';
import type { IpcRegistry, SenderCheck, Settings } from './ipcTypes';

export interface SecretBox {
    isEncryptionAvailable(): boolean;
    encryptString(text: string): Buffer;
    decryptString(data: Buffer): string;
}
export interface VibeIpcDeps {
    trustedSite: SenderCheck;
    trustedLocal: SenderCheck;
    store: Settings;
    secrets: SecretBox;
    fetcher: FetchLike;
    applySettingChange(change: SettingChange): void;
    /** Страница перечитывает, подключена ли модель */
    notifyPage(): void;
}

/** Что F1 видит о модели: ключ только признаком и последними четырьмя знаками */
export interface AiConfigView {
    provider: AiProvider;
    baseUrl: string;
    model: string;
    hasKey: boolean;
    keyHint: string;
    encrypted: boolean;
    defaults: typeof AI_DEFAULTS;
}

export function readAiKey(store: Settings, secrets: SecretBox): string {
    const sealed = store.get('aiKeySealed');
    if (typeof sealed === 'string' && sealed) {
        try {
            return secrets.isEncryptionAvailable() ? secrets.decryptString(Buffer.from(sealed, 'base64')) : '';
        } catch (error) {
            console.warn('Ключ модели не расшифрован:', error);
            return '';
        }
    }
    const plain = store.get('aiKeyPlain');
    return typeof plain === 'string' ? plain : '';
}
function writeAiKey(store: Settings, secrets: SecretBox, key: string): void {
    store.delete('aiKeySealed');
    store.delete('aiKeyPlain');
    if (!key) return;
    if (secrets.isEncryptionAvailable()) store.set('aiKeySealed', secrets.encryptString(key).toString('base64'));
    // Без системного хранилища (Linux без keyring) ключ лежит открыто, F1 об этом предупреждает
    else store.set('aiKeyPlain', key);
}
export function readAiConfig(store: Settings, secrets: SecretBox): AiConfig {
    const provider = AI_PROVIDERS.find((item) => item === store.get('aiProvider')) ?? 'off';
    const text = (key: string): string => {
        const value = store.get(key);
        return typeof value === 'string' ? value : '';
    };
    return { provider, baseUrl: text('aiBaseUrl'), model: text('aiModel'), key: readAiKey(store, secrets) };
}
const ready = (config: AiConfig): boolean => config.provider !== 'off' && (!!config.key || config.provider === 'ollama' || config.provider === 'custom');

function cleanContext(input: unknown): VibeContext {
    const value = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
    const genres = Array.isArray(value.genres) ? value.genres.filter((item): item is string => typeof item === 'string' && item.length <= 60).slice(0, 10) : [];
    return { genres, noRussian: value.noRussian === true };
}

export function registerVibeIpc(ipc: IpcRegistry, deps: VibeIpcDeps): void {
    const { trustedSite, trustedLocal, store, secrets } = deps;
    for (const channel of ['soundcloud:vibe:plan', 'soundcloud:vibe:status', 'soundcloud:wave-option:set', 'ai-config:get', 'ai-config:set', 'ai-config:test']) ipc.removeHandler(channel);
    ipc.handle('soundcloud:vibe:plan', async (event, text: unknown, context: unknown) => {
        if (!trustedSite(event) || typeof text !== 'string' || !text.trim() || text.length > 300) return null;
        const config = readAiConfig(store, secrets);
        return planVibe(text, cleanContext(context), ready(config) ? config : null, deps.fetcher);
    });
    ipc.handle('soundcloud:vibe:status', (event) => trustedSite(event) && ready(readAiConfig(store, secrets)));
    // Настройки волны из блока: пока только «Без русского», ввод проверяется как смена в F1
    ipc.handle('soundcloud:wave-option:set', (event, key: unknown, value: unknown) => {
        if (!trustedSite(event) || key !== 'waveNoRussian' || typeof value !== 'boolean') return false;
        deps.applySettingChange({ key: 'waveNoRussian', value });
        return true;
    });
    ipc.handle('ai-config:get', (event): AiConfigView => {
        if (!trustedLocal(event)) throw new Error('Недопустимый отправитель IPC');
        const config = readAiConfig(store, secrets);
        return {
            provider: config.provider,
            baseUrl: config.baseUrl,
            model: config.model,
            hasKey: !!config.key,
            keyHint: config.key ? '…' + config.key.slice(-4) : '',
            encrypted: secrets.isEncryptionAvailable(),
            defaults: AI_DEFAULTS,
        };
    });
    // key: undefined оставляет прежний ключ, пустая строка стирает
    ipc.handle('ai-config:set', (event, input: unknown) => {
        if (!trustedLocal(event) || !input || typeof input !== 'object') return false;
        const value = input as Record<string, unknown>;
        const current = readAiConfig(store, secrets);
        const next: AiConfig = {
            provider: (value.provider ?? current.provider) as AiProvider,
            baseUrl: typeof value.baseUrl === 'string' ? value.baseUrl.trim() : current.baseUrl,
            model: typeof value.model === 'string' ? value.model.trim() : current.model,
            key: typeof value.key === 'string' ? value.key.trim() : current.key,
        };
        if (!isAiConfig(next)) return false;
        store.set('aiProvider', next.provider);
        store.set('aiBaseUrl', next.baseUrl);
        store.set('aiModel', next.model);
        if (next.key !== current.key) writeAiKey(store, secrets, next.key);
        deps.notifyPage();
        return true;
    });
    // «Проверить»: пробный запрос к модели, ответ это подпись плана или ошибка
    ipc.handle('ai-config:test', async (event) => {
        if (!trustedLocal(event)) throw new Error('Недопустимый отправитель IPC');
        const config = readAiConfig(store, secrets);
        if (!ready(config)) return { ok: false, error: config.provider === 'off' ? 'Модель выключена' : 'Не указан ключ' };
        const result = await planVibe('ночной драйв под дождь, без русского', { genres: [], noRussian: false }, config, deps.fetcher);
        return result.error ? { ok: false, error: result.error } : { ok: true, title: result.plan.title, tracks: result.plan.tracks.slice(0, 3) };
    });
}
