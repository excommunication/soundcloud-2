import { expect, it } from 'vitest';
import { buildThumbarSpecs, THUMBAR_LIMIT } from './thumbarButtons';

it('набор кнопок: предыдущий, пауза/играть, следующий, лайк', () => {
    const specs = buildThumbarSpecs(true, false);
    expect(specs.map((s) => s.command)).toEqual(['previous', 'toggle', 'next', 'like']);
    expect(specs[1]).toMatchObject({ icon: 'pause', tooltip: 'thumbPause' });
    expect(specs[3]).toMatchObject({ icon: 'heart', tooltip: 'thumbLike' });
});

it('иконки и подсказки меняются по состоянию, число кнопок в пределе Windows', () => {
    const specs = buildThumbarSpecs(false, true);
    expect(specs[1]).toMatchObject({ icon: 'play', tooltip: 'thumbPlay' });
    expect(specs[3]).toMatchObject({ icon: 'heart-filled', tooltip: 'thumbUnlike' });
    expect(specs.length).toBeLessThanOrEqual(THUMBAR_LIMIT);
});
