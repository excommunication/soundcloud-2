import { expect, it } from 'vitest';
import { dropAt, scoutStart } from './scout';

// 200 отсчётов на 200 с: отсчёт на секунду, форма уже сглажена (0,1-1)
const shape = (quiet: number, loudFrom: number, length = 200): number[] => Array.from({ length }, (_, i) => (i >= loudFrom ? 1 : quiet));

it('scoutStart: первое громкое место за секунду до подъёма, хвост на 20 с остаётся', () => {
    expect(scoutStart(shape(0.2, 120), 200000)).toBe(119000);
    // Подъём в последние секунды: окно не выходит за конец
    expect(scoutStart(shape(0.2, 195), 200000)).toBe(178000);
    // Громко с самого начала: место не раньше 8% трека
    expect(scoutStart(shape(1, 0), 200000)).toBe(15000);
    // Короткий трек и пустая форма играют с начала
    expect(scoutStart(shape(0.2, 20, 60), 30000)).toBe(0);
    expect(scoutStart([], 200000)).toBe(0);
});

it('dropAt: подъём впереди позиции, на полторы секунды раньше', () => {
    // Тихо до 60 с, громко 60-100, тихо 100-140, снова громко со 140 с
    const samples = Array.from({ length: 200 }, (_, i) => ((i >= 60 && i < 100) || i >= 140 ? 1 : 0.2));
    expect(dropAt(samples, 200000, 0)).toBe(58500);
    // Первый дроп уже прошёл: следующий
    expect(dropAt(samples, 200000, 70000)).toBe(138500);
    // Формы нет
    expect(dropAt([], 200000, 0)).toBe(-1);
});
