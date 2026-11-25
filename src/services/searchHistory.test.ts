import { describe, expect, it } from 'vitest';
import { readHistory, rememberQuery, searchHistoryScript, searchPath } from './searchHistory';

describe('rememberQuery', () => {
    it('ставит запрос в начало и убирает дубль без учёта регистра и пробелов', () => {
        const list = [
            { q: 'travis scott', at: 1 },
            { q: 'don toliver', at: 2 },
        ];
        expect(rememberQuery(list, '  Don   Toliver ', 5, 12)).toEqual([
            { q: 'Don Toliver', at: 5 },
            { q: 'travis scott', at: 1 },
        ]);
    });

    it('пустой запрос не сохраняется, длина истории ограничена', () => {
        const list = Array.from({ length: 12 }, (_, i) => ({ q: 'q' + i, at: i }));
        expect(rememberQuery(list, '   ', 99, 12)).toHaveLength(12);
        const next = rememberQuery(list, 'new', 99, 12);
        expect(next).toHaveLength(12);
        expect(next[0].q).toBe('new');
        expect(next[next.length - 1].q).toBe('q10');
    });
});

describe('readHistory', () => {
    it('битое хранилище даёт пустую историю', () => {
        expect(readHistory(null, 12)).toEqual([]);
        expect(readHistory('{oops', 12)).toEqual([]);
        expect(readHistory('{"q":"x"}', 12)).toEqual([]);
    });

    it('отбрасывает записи без текста или даты', () => {
        expect(readHistory(JSON.stringify([{ q: 'ok', at: 1 }, { q: '', at: 2 }, { q: 5, at: 3 }, null, { q: 'no date' }]), 12)).toEqual([{ q: 'ok', at: 1 }]);
    });
});

describe('searchPath', () => {
    it('кодирует кириллицу, пробелы и скобки так, что путь проходит переход внутри сайта', () => {
        const path = searchPath("фонк (slowed) it's");
        expect(path).toBe('/search?q=%D1%84%D0%BE%D0%BD%D0%BA%20%28slowed%29%20it%27s');
        expect(/^\/[a-z0-9_-]{1,100}(\/(sets\/)?[a-z0-9_-]{1,255})?(\?[A-Za-z0-9_.~%&=+/-]{1,500})?$/.test(path)).toBe(true);
    });
});

describe('searchHistoryScript', () => {
    it('собирается в разбираемый текст страницы', () => {
        expect(() => new Function(searchHistoryScript('ru'))).not.toThrow();
    });
});
