import { describe, expect, it } from 'vitest';
import { qrMatrix, qrSvg } from './qr';

const QR_URL = 'https://github.com/excommunication/soundcloud-2';

// Независимый разбор матрицы «с другой стороны»: формат, маска, чтение змейкой, проверка кода Рида-Соломона по синдромам,
// разбор байтового режима. Шаблоны служебных мест здесь считаются заново, не из кодировщика
// Таблица стандарта: слов исправления на блок и размеры блоков данных, отдельно от кодировщика
const BLOCKS: Record<'M' | 'Q' | 'H', Array<{ ec: number; sizes: number[] }>> = {
    M: [{ ec: 10, sizes: [16] }, { ec: 16, sizes: [28] }, { ec: 26, sizes: [44] }, { ec: 18, sizes: [32, 32] }, { ec: 24, sizes: [43, 43] }, { ec: 16, sizes: [27, 27, 27, 27] }],
    Q: [{ ec: 13, sizes: [13] }, { ec: 22, sizes: [22] }, { ec: 18, sizes: [17, 17] }, { ec: 26, sizes: [24, 24] }, { ec: 18, sizes: [15, 15, 16, 16] }, { ec: 24, sizes: [19, 19, 19, 19] }],
    H: [{ ec: 17, sizes: [9] }, { ec: 28, sizes: [16] }, { ec: 22, sizes: [13, 13] }, { ec: 16, sizes: [9, 9, 9, 9] }, { ec: 22, sizes: [11, 11, 12, 12] }, { ec: 28, sizes: [15, 15, 15, 15] }],
};
const LEVEL_OF: Record<number, 'M' | 'Q' | 'H'> = { 0: 'M', 3: 'Q', 2: 'H' };

/** Порядок ячеек данных змейкой (строка, столбец) и для каждой ячейки — блок и номер слова в нём */
function layout(size: number, level: 'M' | 'Q' | 'H'): { cells: Array<[number, number]>; owner: Array<{ block: number; word: number }> } {
    const version = (size - 17) / 4;
    const reserved = (row: number, col: number): boolean => {
        if (row < 9 && col < 9) return true;
        if (row < 9 && col >= size - 8) return true;
        if (row >= size - 8 && col < 9) return true;
        if (row === 6 || col === 6) return true;
        if (version > 1 && Math.abs(row - (size - 7)) <= 2 && Math.abs(col - (size - 7)) <= 2) return true;
        return false;
    };
    const cells: Array<[number, number]> = [];
    let upward = true;
    for (let col = size - 1; col > 0; col -= 2) {
        if (col === 6) col = 5;
        for (let n = 0; n < size; n++) {
            const row = upward ? size - 1 - n : n;
            for (const c of [col, col - 1]) if (!reserved(row, c)) cells.push([row, c]);
        }
        upward = !upward;
    }
    const spec = BLOCKS[level][version - 1];
    const order: Array<{ block: number; word: number }> = [];
    const longest = Math.max(...spec.sizes);
    for (let i = 0; i < longest; i++) spec.sizes.forEach((count, b) => i < count && order.push({ block: b, word: i }));
    for (let i = 0; i < spec.ec; i++) spec.sizes.forEach((count, b) => order.push({ block: b, word: count + i }));
    const owner = cells.map((_, n) => order[Math.floor(n / 8)] ?? { block: -1, word: -1 });
    return { cells, owner };
}

function decode(grid: boolean[][]): { mask: number; text: string; syndromesZero: boolean; level: 'M' | 'Q' | 'H' } {
    const size = grid.length;
    const version = (size - 17) / 4;
    // Формат из первой копии, по порядку битов с 14-го к 0-му
    const first: Array<[number, number]> = [];
    for (let i = 0; i <= 5; i++) first.push([i, 8]);
    first.push([7, 8], [8, 8], [8, 7]);
    for (let i = 9; i < 15; i++) first.push([8, 14 - i]);
    let format = 0;
    first.forEach(([row, col], i) => {
        if (grid[row][col]) format |= 1 << i;
    });
    format ^= 0x5412;
    const level = LEVEL_OF[format >> 13];
    expect(level).toBeDefined();
    const mask = (format >> 10) & 7;
    const maskOn = [
        (i: number, j: number) => (i + j) % 2 === 0,
        (i: number) => i % 2 === 0,
        (_i: number, j: number) => j % 3 === 0,
        (i: number, j: number) => (i + j) % 3 === 0,
        (i: number, j: number) => (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0,
        (i: number, j: number) => ((i * j) % 2) + ((i * j) % 3) === 0,
        (i: number, j: number) => (((i * j) % 2) + ((i * j) % 3)) % 2 === 0,
        (i: number, j: number) => (((i + j) % 2) + ((i * j) % 3)) % 2 === 0,
    ][mask];
    const { cells } = layout(size, level);
    const bits = cells.map(([row, c]) => (grid[row][c] !== maskOn(row, c) ? 1 : 0));
    const words: number[] = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) words.push(parseInt(bits.slice(i, i + 8).join(''), 2));
    const spec = BLOCKS[level][version - 1];
    const blocks: number[][] = spec.sizes.map(() => []);
    let next = 0;
    const longest = Math.max(...spec.sizes);
    for (let i = 0; i < longest; i++) spec.sizes.forEach((count, b) => i < count && blocks[b].push(words[next++]));
    for (let i = 0; i < spec.ec; i++) spec.sizes.forEach((_count, b) => blocks[b].push(words[next++]));
    // GF(256)
    const exp: number[] = [];
    const log: number[] = [];
    let v = 1;
    for (let i = 0; i < 255; i++) {
        exp[i] = v;
        log[v] = i;
        v = v << 1 ^ (v & 128 ? 0x11d : 0);
    }
    const mul = (a: number, b: number): number => (a && b ? exp[(log[a] + log[b]) % 255] : 0);
    let syndromesZero = true;
    const dataOut: number[] = [];
    for (const [b, block] of blocks.entries()) {
        const perData = spec.sizes[b];
        expect(block.length).toBe(perData + spec.ec);
        for (let k = 0; k < spec.ec; k++) {
            // значение многочлена блока в точке α^k по схеме Горнера
            let acc = 0;
            for (const word of block) acc = mul(acc, exp[k]) ^ word;
            if (acc !== 0) syndromesZero = false;
        }
        dataOut.push(...block.slice(0, perData));
    }
    const stream = dataOut.map((w) => w.toString(2).padStart(8, '0')).join('');
    const mode = stream.slice(0, 4);
    if (mode === '0010') {
        // буквенно-цифровой режим: пары знаков по 11 бит, хвост 6 бит
        const ALNUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
        const length = parseInt(stream.slice(4, 13), 2);
        let text = '';
        let at = 13;
        for (let i = 0; i + 1 < length; i += 2, at += 11) {
            const v = parseInt(stream.slice(at, at + 11), 2);
            text += ALNUM[Math.floor(v / 45)] + ALNUM[v % 45];
        }
        if (length % 2) text += ALNUM[parseInt(stream.slice(at, at + 6), 2)];
        return { mask, text, syndromesZero, level };
    }
    expect(mode).toBe('0100'); // байтовый режим
    const length = parseInt(stream.slice(4, 12), 2);
    const out: number[] = [];
    for (let i = 0; i < length; i++) out.push(parseInt(stream.slice(12 + i * 8, 20 + i * 8), 2));
    return { mask, text: new TextDecoder().decode(new Uint8Array(out)), syndromesZero, level };
}

describe('QR-код значка', () => {
    const grid = qrMatrix(QR_URL);
    it('ссылка на репозиторий: версия 4, 33×33 модуля', () => {
        expect(QR_URL.length).toBe(47);
        expect(grid.length).toBe(33);
        expect(grid.every((row) => row.length === 33)).toBe(true);
    });
    it('три метки по углам, кроме правого нижнего, и тёмный модуль', () => {
        const finder = (row0: number, col0: number): string[] =>
            Array.from({ length: 7 }, (_, r) => Array.from({ length: 7 }, (_, c) => (grid[row0 + r][col0 + c] ? '#' : '.')).join(''));
        const want = ['#######', '#.....#', '#.###.#', '#.###.#', '#.###.#', '#.....#', '#######'];
        expect(finder(0, 0)).toEqual(want);
        expect(finder(0, 26)).toEqual(want);
        expect(finder(26, 0)).toEqual(want);
        expect(grid[25][8]).toBe(true);
        // разделители вокруг меток светлые
        for (let i = 0; i < 8; i++) {
            expect(grid[7][i]).toBe(false);
            expect(grid[i][7]).toBe(false);
        }
        // выравнивающий узор 5×5 с центром (26, 26)
        expect(grid[26][26]).toBe(true);
        expect(grid[25][25]).toBe(false);
        expect(grid[24][24]).toBe(true);
        // полоса синхронизации чередуется
        for (let i = 8; i < 25; i++) {
            expect(grid[6][i]).toBe(i % 2 === 0);
            expect(grid[i][6]).toBe(i % 2 === 0);
        }
    });
    it('биты формата: уровень M, остаток БЧХ делится без остатка, обе копии совпадают', () => {
        const read = (cells: Array<[number, number]>): number => cells.reduce((acc, [row, col], i) => acc | ((grid[row][col] ? 1 : 0) << i), 0);
        const size = grid.length;
        const first: Array<[number, number]> = [];
        for (let i = 0; i <= 5; i++) first.push([i, 8]);
        first.push([7, 8], [8, 8], [8, 7]);
        for (let i = 9; i < 15; i++) first.push([8, 14 - i]);
        const second: Array<[number, number]> = [];
        for (let i = 0; i < 8; i++) second.push([8, size - 1 - i]);
        for (let i = 8; i < 15; i++) second.push([size - 15 + i, 8]);
        const a = read(first);
        expect(read(second)).toBe(a);
        const plain = a ^ 0x5412;
        // многочлен 0x537 делит код формата
        let rem = plain;
        for (let bit = 14; bit >= 10; bit--) if ((rem >> bit) & 1) rem ^= 0x537 << (bit - 10);
        expect(rem).toBe(0);
        expect(plain >> 13).toBe(0);
    });
    it('независимый разбор возвращает ту же ссылку, код исправления сходится', () => {
        const result = decode(grid);
        expect(result.text).toBe(QR_URL);
        expect(result.syndromesZero).toBe(true);
    });
    it('короткие и длинные тексты других версий тоже разбираются', () => {
        for (const text of ['a', 'https://example.test/x', 'Привет, мир! '.repeat(4), 'z'.repeat(100)]) {
            const matrix = qrMatrix(text);
            const result = decode(matrix);
            expect(result.text).toBe(text);
            expect(result.syndromesZero).toBe(true);
        }
        expect(qrMatrix('x'.repeat(107))).toEqual([]);
    });
    it('формат из таблицы стандарта для маски 0 (101010000010010) выходит из той же формулы', () => {
        let rem = 0;
        for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
        expect((((0 << 10) | rem) ^ 0x5412).toString(2).padStart(15, '0')).toBe('101010000010010');
        let rem1 = 1;
        for (let i = 0; i < 10; i++) rem1 = (rem1 << 1) ^ ((rem1 >>> 9) * 0x537);
        expect((((1 << 10) | rem1) ^ 0x5412).toString(2).padStart(15, '0')).toBe('101000100100101');
    });
    it('SVG с тихой зоной в 3 модуля и светлой плашкой', () => {
        const svg = qrSvg(grid, '#0b0c10');
        expect(svg.startsWith('<svg')).toBe(true);
        expect(svg).toContain('viewBox="0 0 39 39"');
        expect(svg).not.toContain('scq-b');
        expect(svg).toContain('fill="#fff"');
        expect(qrSvg([], '#000')).toBe('');
    });
});

// Значок в режиме роликов (2.11.1): ссылка заглавными, уровень H и значок клиента посередине
describe('QR-код значка со значком клиента', () => {
    const BADGE = 'HTTPS://GITHUB.COM/EXCOMMUNICATION/SOUNDCLOUD-2';
    const HOLE = 9;
    const grid = qrMatrix(BADGE, 'H');
    it('буквенно-цифровой режим на уровне H влезает в версию 4, 33×33', () => {
        expect(grid.length).toBe(33);
        const result = decode(grid);
        expect(result.level).toBe('H');
        expect(result.text).toBe(BADGE);
        expect(result.syndromesZero).toBe(true);
    });
    it('уровни Q и H, блоки разного размера у версии 5 тоже разбираются', () => {
        for (const level of ['Q', 'H'] as const) {
            for (const text of ['A', 'HELLO WORLD', 'x'.repeat(40), 'HTTPS://EXAMPLE.TEST/' + 'A'.repeat(40)]) {
                const matrix = qrMatrix(text, level);
                const result = decode(matrix);
                expect(result.level).toBe(level);
                expect(result.text).toBe(text);
                expect(result.syndromesZero).toBe(true);
            }
        }
        expect((qrMatrix('x'.repeat(40), 'H').length - 17) / 4).toBe(5);
    });
    it('дыра под значок портит в каждом блоке меньше половины запаса исправления, с запасом в 3 слова', () => {
        const size = grid.length;
        const lo = (size - HOLE) / 2;
        const { cells, owner } = layout(size, 'H');
        const spec = BLOCKS.H[3];
        const hit = spec.sizes.map(() => new Set<number>());
        cells.forEach(([row, col], n) => {
            if (row >= lo && row < lo + HOLE && col >= lo && col < lo + HOLE && owner[n].block >= 0) hit[owner[n].block].add(owner[n].word);
        });
        // H версии 4: 16 слов исправления на блок, то есть до 8 ошибочных слов в блоке
        for (const words of hit) expect(words.size).toBeLessThanOrEqual(spec.ec / 2 - 3);
        expect(hit.reduce((sum, words) => sum + words.size, 0)).toBeGreaterThan(0);
    });
    it('SVG: скруглённые метки, дыра пуста, значок с четырьмя полосками', () => {
        const svg = qrSvg(grid, '#0b0c10', HOLE);
        expect(svg).toContain('viewBox="0 0 39 39"');
        expect(svg.match(/class="scq-b"/g)?.length).toBe(4);
        expect(svg).toContain('fill-rule="evenodd"');
        // ни один модуль данных не начинается внутри дыры (в координатах SVG дыра 15..24)
        const data = svg.match(/<path fill="#0b0c10" d="([^"]*)"\/>/g)?.[1] ?? '';
        for (const [, x, y] of data.matchAll(/M([\d.]+) ([\d.]+)/g)) {
            const inside = Number(x) > 15.1 && Number(x) < 23.9 && Number(y) > 15.1 && Number(y) < 23.9;
            expect(inside).toBe(false);
        }
    });
});
