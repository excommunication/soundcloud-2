import { describe, expect, it } from 'vitest';
import { WINDOW_MIN, contentLayout, fitWindowBounds } from './windowBounds';

const work = { x: 0, y: 0, width: 1920, height: 1040 };
describe('размер окна', () => {
    it('сохранённый размер меньше минимума растёт до минимума', () => {
        expect(fitWindowBounds({ x: 10, y: 10, width: 300, height: 120 }, work)).toEqual({ x: 10, y: 10, width: WINDOW_MIN.width, height: WINDOW_MIN.height });
    });
    it('окно больше экрана ужимается до рабочей области', () => {
        expect(fitWindowBounds({ width: 4000, height: 3000 }, work)).toEqual({ width: 1920, height: 1040 });
    });
    it('окно за краем экрана теряет позицию и встаёт по центру', () => {
        expect(fitWindowBounds({ x: 3000, y: 200, width: 1200, height: 800 }, work)).toEqual({ width: 1200, height: 800 });
    });
    it('маленький экран: минимум не больше экрана', () => {
        expect(fitWindowBounds({ width: 1200, height: 900 }, { x: 0, y: 0, width: 800, height: 560 })).toEqual({ width: 800, height: 560 });
    });
    it('кривые числа из файла состояния не ломают окно', () => {
        expect(fitWindowBounds({ x: NaN, y: 0, width: NaN, height: Infinity }, work)).toEqual({ width: 1920, height: 1040 });
    });
});
describe('виды под шапкой', () => {
    it('шапка сверху, страница под ней', () => {
        expect(contentLayout({ width: 1200, height: 800 }, 32)).toEqual({ header: { x: 0, y: 0, width: 1200, height: 32 }, page: { x: 0, y: 32, width: 1200, height: 768 } });
    });
    it('высота не уходит в минус', () => {
        expect(contentLayout({ width: 100, height: 10 }, 32).page.height).toBe(0);
    });
});
