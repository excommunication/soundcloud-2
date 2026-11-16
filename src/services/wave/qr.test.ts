import { describe, expect, it } from 'vitest';
import { qrMatrix, qrSvg } from './qr';

const QR_URL = 'https://github.com/excommunication/soundcloud-2';

// Независимый разбор матрицы «с другой стороны»: формат, маска, чтение змейкой, проверка кода Рида-Соломона по синдромам,
// разбор байтового режима. Шаблоны служебных мест здесь считаются заново, не из кодировщика
function decode(grid: boolean[][]): { mask: number; text: string; syndromesZero: boolean } {
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
    expect(format >> 13).toBe(0); // уровень M = 00
    const mask = (format >> 10) & 7;
    const reserved = (row: number, col: number): boolean => {
        if (row < 9 && col < 9) return true;
        if (row < 9 && col >= size - 8) return true;
        if (row >= size - 8 && col < 9) return true;
        if (row === 6 || col === 6) return true;
        if (version > 1 && Math.abs(row - (size - 7)) <= 2 && Math.abs(col - (size - 7)) <= 2) return true;
        return false;
    };
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
    const bits: number[] = [];
    let upward = true;
    for (let col = size - 1; col > 0; col -= 2) {
        if (col === 6) col = 5;
        for (let n = 0; n < size; n++) {
            const row = upward ? size - 1 - n : n;
            for (const c of [col, col - 1]) {
                if (!reserved(row, c)) bits.push(grid[row][c] !== maskOn(row, c) ? 1 : 0);
            }
        }
        upward = !upward;
    }
    const words: number[] = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) words.push(parseInt(bits.slice(i, i + 8).join(''), 2));
    const spec = [null, { blocks: 1, ec: 10 }, { blocks: 1, ec: 16 }, { blocks: 1, ec: 26 }, { blocks: 2, ec: 18 }, { blocks: 2, ec: 24 }, { blocks: 4, ec: 16 }][version]!;
    const total = Math.floor((bits.length - (version > 1 ? 7 : 0)) / 8);
    expect(words.length).toBeGreaterThanOrEqual(total);
    const perData = total / spec.blocks - spec.ec;
    const perBlock = perData + spec.ec;
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
    const blocks: number[][] = Array.from({ length: spec.blocks }, () => []);
    for (let i = 0; i < total; i++) {
        const b = i < perData * spec.blocks ? i % spec.blocks : (i - perData * spec.blocks) % spec.blocks;
        blocks[b].push(words[i]);
    }
    let syndromesZero = true;
    const dataOut: number[] = [];
    for (const block of blocks) {
        expect(block.length).toBe(perBlock);
        for (let k = 0; k < spec.ec; k++) {
            // значение многочлена блока в точке α^k по схеме Горнера
            let acc = 0;
            for (const word of block) acc = mul(acc, exp[k]) ^ word;
            if (acc !== 0) syndromesZero = false;
        }
        dataOut.push(...block.slice(0, perData));
    }
    const stream = dataOut.map((w) => w.toString(2).padStart(8, '0')).join('');
    expect(stream.slice(0, 4)).toBe('0100'); // байтовый режим
    const length = parseInt(stream.slice(4, 12), 2);
    const out: number[] = [];
    for (let i = 0; i < length; i++) out.push(parseInt(stream.slice(12 + i * 8, 20 + i * 8), 2));
    return { mask, text: new TextDecoder().decode(new Uint8Array(out)), syndromesZero };
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
    it('SVG с тихой зоной в 4 модуля и светлой плашкой', () => {
        const svg = qrSvg(grid, '#0b0c10');
        expect(svg.startsWith('<svg')).toBe(true);
        expect(svg).toContain('viewBox="0 0 41 41"');
        expect(svg).toContain('fill="#fff"');
        expect(qrSvg([], '#000')).toBe('');
    });
});
