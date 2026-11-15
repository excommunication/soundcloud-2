import { describe, expect, it, vi } from 'vitest';
import { FakeIpc, type FakeEvent } from './fakeIpc.helper.test';
import { readAiConfig, registerVibeIpc, type SecretBox } from './vibeIpc';
import type { Settings } from './ipcTypes';

class MemoryStore implements Settings {
    data = new Map<string, unknown>();
    get(key: string, fallback?: unknown) {
        return this.data.has(key) ? this.data.get(key) : fallback;
    }
    set(key: string, value: unknown) {
        this.data.set(key, value);
    }
    delete(key: string) {
        this.data.delete(key);
    }
}
const secrets = (available: boolean): SecretBox => ({
    isEncryptionAvailable: () => available,
    encryptString: (text) => Buffer.from('enc:' + text),
    decryptString: (data) => data.toString().replace(/^enc:/, ''),
});
const event = {} as FakeEvent;

function setup(available = true, trusted = true) {
    const ipc = new FakeIpc();
    const store = new MemoryStore();
    const applySettingChange = vi.fn();
    const notifyPage = vi.fn();
    const fetcher = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"title":"Ночь","tracks":["A - B"]}' } }] }) }));
    registerVibeIpc(ipc, { trustedSite: () => trusted, trustedLocal: () => trusted, store, secrets: secrets(available), fetcher, applySettingChange, notifyPage });
    return { ipc, store, applySettingChange, notifyPage, fetcher };
}

describe('vibeIpc', () => {
    it('без модели план локальный и сеть не трогается', async () => {
        const { ipc, fetcher } = setup();
        const result = (await ipc.invoke('soundcloud:vibe:plan', event, 'фонк для зала', { genres: [], noRussian: true })) as { plan: { source: string; lang: string } };
        expect(result.plan.source).toBe('local');
        expect(result.plan.lang).toBe('noRu');
        expect(fetcher).not.toHaveBeenCalled();
    });
    it('ключ шифруется, в F1 уходит только подсказка', async () => {
        const { ipc, store, notifyPage } = setup();
        expect(await ipc.invoke('ai-config:set', event, { provider: 'openai', key: 'sk-secret-1234' })).toBe(true);
        expect(store.get('aiKeySealed')).toBe(Buffer.from('enc:sk-secret-1234').toString('base64'));
        expect(store.get('aiKeyPlain')).toBeUndefined();
        const view = (await ipc.invoke('ai-config:get', event)) as { hasKey: boolean; keyHint: string };
        expect(view).toMatchObject({ hasKey: true, keyHint: '…1234' });
        expect(JSON.stringify(view)).not.toContain('sk-secret');
        expect(notifyPage).toHaveBeenCalled();
        expect(readAiConfig(store, secrets(true)).key).toBe('sk-secret-1234');
    });
    it('без системного хранилища ключ лежит открыто', async () => {
        const { ipc, store } = setup(false);
        await ipc.invoke('ai-config:set', event, { provider: 'groq', key: 'k' });
        expect(store.get('aiKeyPlain')).toBe('k');
    });
    it('с моделью план от модели', async () => {
        const { ipc, fetcher } = setup();
        await ipc.invoke('ai-config:set', event, { provider: 'openai', key: 'k' });
        const result = (await ipc.invoke('soundcloud:vibe:plan', event, 'ночь', {})) as { plan: { source: string; tracks: string[] } };
        expect(fetcher).toHaveBeenCalledOnce();
        expect(result.plan.source).toBe('ai');
        expect(result.plan.tracks).toEqual(['A - B']);
        expect(await ipc.invoke('soundcloud:vibe:status', event)).toBe(true);
    });
    it('проверяет ввод и отправителя', async () => {
        const { ipc, applySettingChange } = setup();
        expect(await ipc.invoke('ai-config:set', event, { provider: 'custom', baseUrl: 'file:///x' })).toBe(false);
        expect(await ipc.invoke('soundcloud:wave-option:set', event, 'waveNoRussian', 'yes')).toBe(false);
        expect(await ipc.invoke('soundcloud:wave-option:set', event, 'waveNoRussian', true)).toBe(true);
        expect(applySettingChange).toHaveBeenCalledWith({ key: 'waveNoRussian', value: true });
        const untrusted = setup(true, false);
        expect(await untrusted.ipc.invoke('soundcloud:vibe:plan', event, 'x', {})).toBeNull();
        await expect(untrusted.ipc.invoke('ai-config:get', event)).rejects.toThrow();
    });
});
