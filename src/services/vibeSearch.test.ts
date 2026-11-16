import { describe, expect, it, vi } from 'vitest';
import { askModel, coreText, extractJson, isAiConfig, planLocal, planVibe, sanitizePlan, translit, vibeTitle, type FetchLike } from './vibeSearch';

describe('planLocal', () => {
    it('разбирает сцену, жанр и настроение по-русски', () => {
        const plan = planLocal('грустный инди на ночь под дождь');
        expect(plan.tags).toEqual(expect.arrayContaining(['indie', 'night', 'rain', 'sad']));
        expect(plan.queries[0]).toBe('indie night');
        expect(plan.words).toEqual(expect.arrayContaining(['sad', 'rain', 'night']));
        expect(plan.lang).toBe('any');
        expect(plan.source).toBe('local');
        expect(plan.title).toBe('Грустный инди на ночь под дождь');
    });
    it('фонк для зала: хиты и без русского', () => {
        const plan = planLocal('фонк для зала без русского');
        expect(plan.tags[0]).toBe('phonk');
        expect(plan.popularity).toBe('hits');
        expect(plan.lang).toBe('noRu');
    });
    it('«на русском» и «андеграунд»', () => {
        const plan = planLocal('андеграунд рэп на русском');
        expect(plan.lang).toBe('ru');
        expect(plan.popularity).toBe('underground');
        expect(plan.tags).toContain('rap');
    });
    it('настройка «Без русского» действует, если запрос не просит русское', () => {
        expect(planLocal('chill lofi', { genres: [], noRussian: true }).lang).toBe('noRu');
        expect(planLocal('русский рок', { genres: [], noRussian: true }).lang).toBe('ru');
    });
    it('«в стиле X» даёт артиста и поиск по нему', () => {
        const plan = planLocal('что-то в стиле Cigarettes After Sex, но повеселее');
        expect(plan.artists).toEqual(['Cigarettes After Sex']);
        expect(plan.queries).toContain('Cigarettes After Sex');
    });
    it('«без slowed» и «без ремиксов» уходят в avoid', () => {
        const plan = planLocal('sad rap без slowed и без ремиксов');
        expect(plan.avoid).toEqual(expect.arrayContaining(['slowed', 'remix']));
    });
    it('свежее и короткие корни не ловят чужие слова', () => {
        expect(planLocal('новые треки techno').fresh).toBe(true);
        expect(planLocal('песни персонажей').tags).not.toContain('sleep');
        expect(planLocal('музыка для сна').tags).toContain('sleep');
        expect(planLocal('музыка в зал').tags).toContain('workout');
        expect(planLocal('музыка 1990').tags).not.toContain('90s');
    });
    it('без жанра берёт любимые жанры как подсказку', () => {
        const plan = planLocal('для ночной поездки', { genres: ['synthwave'], noRussian: false });
        expect(plan.queries.some((query) => query.includes('synthwave'))).toBe(true);
    });
});

describe('vibeTitle', () => {
    it('обрезает длинное по слову', () => {
        expect(vibeTitle('a'.repeat(10) + ' ' + 'b'.repeat(50))).toBe('A'.toUpperCase() + 'a'.repeat(9) + '…');
    });
});

describe('модель', () => {
    const local = planLocal('sad indie');
    it('sanitizePlan отбрасывает мусор и держит «Без русского»', () => {
        const plan = sanitizePlan({ title: 'Ночь', queries: ['sad indie night', 5, ''], tracks: ['Artist - Song'], lang: 'ru', popularity: 'nope' }, { ...local, lang: 'noRu' });
        expect(plan.queries[0]).toBe('sad indie night');
        expect(plan.tracks).toEqual(['Artist - Song']);
        expect(plan.lang).toBe('noRu');
        expect(plan.popularity).toBe(local.popularity);
        expect(plan.source).toBe('ai');
    });
    it('extractJson достаёт объект из ```json и текста', () => {
        expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
        expect(extractJson('Вот план: {"b":2} готово')).toEqual({ b: 2 });
        expect(extractJson('нет')).toBeNull();
    });
    it('isAiConfig проверяет провайдера и адрес', () => {
        expect(isAiConfig({ provider: 'openai', baseUrl: '', model: '', key: 'k' })).toBe(true);
        expect(isAiConfig({ provider: 'evil', baseUrl: '', model: '', key: '' })).toBe(false);
        expect(isAiConfig({ provider: 'custom', baseUrl: 'file:///etc', model: '', key: '' })).toBe(false);
        expect(isAiConfig({ provider: 'custom', baseUrl: 'https://u:p@x.y', model: '', key: '' })).toBe(false);
    });
    it('OpenAI-совместимый запрос', async () => {
        const fetcher = vi.fn<FetchLike>(async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"title":"x"}' } }] }) }));
        const text = await askModel({ provider: 'groq', baseUrl: '', model: '', key: 'k' }, 'hi', fetcher);
        expect(text).toBe('{"title":"x"}');
        const [url, init] = fetcher.mock.calls[0];
        expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
        expect(init.headers.authorization).toBe('Bearer k');
    });
    it('Anthropic messages', async () => {
        const fetcher = vi.fn<FetchLike>(async () => ({ ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: '{}' }] }) }));
        await askModel({ provider: 'anthropic', baseUrl: '', model: '', key: 'k' }, 'hi', fetcher);
        expect(fetcher.mock.calls[0][0]).toBe('https://api.anthropic.com/v1/messages');
        expect(fetcher.mock.calls[0][1].headers['x-api-key']).toBe('k');
    });
    it('сбой модели возвращает локальный план с ошибкой', async () => {
        const fetcher: FetchLike = async () => ({ ok: false, status: 401, json: async () => ({}) });
        const result = await planVibe('chill', { genres: [], noRussian: false }, { provider: 'openai', baseUrl: '', model: '', key: 'k' }, fetcher);
        expect(result.plan.source).toBe('local');
        expect(result.error).toContain('401');
    });
    it('без ключа у облачного провайдера не ходит в сеть', async () => {
        const fetcher = vi.fn<FetchLike>();
        const result = await planVibe('chill', { genres: [], noRussian: false }, { provider: 'openai', baseUrl: '', model: '', key: '' }, fetcher);
        expect(fetcher).not.toHaveBeenCalled();
        expect(result.error).toBeTruthy();
    });
});

describe('разговорные запросы (2.8.1)', () => {
    it('«чёт хайповое го» даёт поиски, а не пустой план', () => {
        const plan = planLocal('чёт хайповое го');
        expect(plan.queries.length).toBeGreaterThan(2);
        expect(plan.tags).toContain('viral');
        expect(plan.popularity).toBe('hits');
        expect(plan.queries).toContain('tiktok viral');
    });
    it('слова-связки убираются, остаётся суть', () => {
        expect(coreText('чёт хайповое го')).toBe('хайповое');
        expect(coreText('включи мне что-нибудь грустное')).toBe('грустное');
        expect(coreText('го')).toBe('го');
    });
    it('имя артиста ищется и по-русски, и латиницей', () => {
        const plan = planLocal('кай ангел');
        expect(plan.queries).toContain('кай ангел');
        expect(plan.queries).toContain(translit('кай ангел'));
        expect(translit('кай ангел')).toBe('kai angel');
    });
    it('«тикток 2026» по-прежнему просит свежее и популярное', () => {
        const plan = planLocal('тикток 2026');
        expect(plan.fresh).toBe(true);
        expect(plan.popularity).toBe('hits');
    });
});
