// QR-код для значка «sc2» в режиме «Для роликов» (2.11.0): ссылка на репозиторий клиента, чтобы по скриншоту ролика его находили.
// Библиотек в клиенте нет, поэтому кодировщик свой и маленький: байтовый режим, уровень исправления M, версии 1–6 (до 106 байт),
// все восемь масок с выбором по штрафам. Обе функции уходят на страницу текстом (pageHelpers в wave.ts): внутри только свои
// объявления, ничего снаружи.

/** Матрица модулей QR-кода: true — тёмный. Строка за строкой, сверху вниз. Текст длиннее 106 байт даёт пустую матрицу */
export function qrMatrix(text: string): boolean[][] {
    const bytes = Array.from(new TextEncoder().encode(text));
    // Уровень M: всего слов данных, слов исправления на блок и число блоков (блоки в этих версиях равные)
    const SPEC = [
        { data: 16, ec: 10, blocks: 1 },
        { data: 28, ec: 16, blocks: 1 },
        { data: 44, ec: 26, blocks: 1 },
        { data: 64, ec: 18, blocks: 2 },
        { data: 86, ec: 24, blocks: 2 },
        { data: 108, ec: 16, blocks: 4 },
    ];
    let version = 0;
    for (let i = 0; i < SPEC.length; i++) {
        // 4 бита режима, 8 бит длины и сами байты
        if (12 + bytes.length * 8 <= SPEC[i].data * 8) {
            version = i + 1;
            break;
        }
    }
    if (!version) return [];
    const spec = SPEC[version - 1];
    const size = 17 + 4 * version;

    // Поток битов данных
    const bits: number[] = [];
    const put = (value: number, count: number): void => {
        for (let i = count - 1; i >= 0; i--) bits.push((value >>> i) & 1);
    };
    put(4, 4);
    put(bytes.length, 8);
    for (const byte of bytes) put(byte, 8);
    const capacity = spec.data * 8;
    for (let i = 0; i < 4 && bits.length < capacity; i++) bits.push(0);
    while (bits.length % 8) bits.push(0);
    const words: number[] = [];
    for (let i = 0; i < bits.length; i += 8) {
        let word = 0;
        for (let j = 0; j < 8; j++) word = (word << 1) | bits[i + j];
        words.push(word);
    }
    for (let pad = 0xec; words.length < spec.data; pad ^= 0xec ^ 0x11) words.push(pad);

    // Поле GF(256) с многочленом 0x11D и слова исправления Рида-Соломона
    const exp: number[] = new Array(512).fill(0);
    const log: number[] = new Array(256).fill(0);
    let x = 1;
    for (let i = 0; i < 255; i++) {
        exp[i] = x;
        log[x] = i;
        x <<= 1;
        if (x & 256) x ^= 0x11d;
    }
    for (let i = 255; i < 512; i++) exp[i] = exp[i - 255];
    const mul = (a: number, b: number): number => (a && b ? exp[log[a] + log[b]] : 0);
    let gen = [1];
    for (let i = 0; i < spec.ec; i++) {
        const next: number[] = new Array(gen.length + 1).fill(0);
        for (let j = 0; j < gen.length; j++) {
            next[j] ^= gen[j];
            next[j + 1] ^= mul(gen[j], exp[i]);
        }
        gen = next;
    }
    const per = spec.data / spec.blocks;
    const blocks: number[][] = [];
    const checks: number[][] = [];
    for (let b = 0; b < spec.blocks; b++) {
        const block = words.slice(b * per, (b + 1) * per);
        const rem: number[] = new Array(spec.ec).fill(0);
        for (const word of block) {
            const factor = word ^ (rem.shift() as number);
            rem.push(0);
            for (let j = 0; j < spec.ec; j++) rem[j] ^= mul(gen[j + 1], factor);
        }
        blocks.push(block);
        checks.push(rem);
    }
    // Слова блоков вперемешку: сначала данные по очереди из каждого блока, потом исправление
    const stream: number[] = [];
    for (let i = 0; i < per; i++) for (const block of blocks) stream.push(block[i]);
    for (let i = 0; i < spec.ec; i++) for (const check of checks) stream.push(check[i]);
    const data: number[] = [];
    for (const word of stream) for (let i = 7; i >= 0; i--) data.push((word >>> i) & 1);
    // Остаточные биты у версий 2–6 (у первой их нет)
    if (version > 1) for (let i = 0; i < 7; i++) data.push(0);

    // Служебные узоры
    const cells: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));
    const taken: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));
    const set = (col: number, row: number, dark: boolean): void => {
        if (col < 0 || row < 0 || col >= size || row >= size) return;
        cells[row][col] = dark;
        taken[row][col] = true;
    };
    for (let i = 8; i < size - 8; i++) {
        set(i, 6, i % 2 === 0);
        set(6, i, i % 2 === 0);
    }
    const finder = (cx: number, cy: number): void => {
        for (let dy = -1; dy <= 7; dy++) {
            for (let dx = -1; dx <= 7; dx++) {
                const inside = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6;
                const ring = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
                set(cx + dx, cy + dy, inside && ring !== 2);
            }
        }
    };
    finder(0, 0);
    finder(size - 7, 0);
    finder(0, size - 7);
    if (version > 1) {
        for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) set(size - 7 + dx, size - 7 + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
    }
    // Места под формат (рисуются после выбора маски) и тёмный модуль
    for (let i = 0; i < 9; i++) {
        taken[8][i] = true;
        taken[i][8] = true;
    }
    for (let i = 0; i < 8; i++) {
        taken[8][size - 1 - i] = true;
        taken[size - 1 - i][8] = true;
    }
    set(8, size - 8, true);

    // Данные змейкой снизу вверх по парам столбцов, шестой столбец пропускается
    const place: Array<[number, number]> = [];
    for (let right = size - 1, up = true; right >= 1; right -= 2, up = !up) {
        if (right === 6) right = 5;
        for (let step = 0; step < size; step++) {
            const row = up ? size - 1 - step : step;
            for (let j = 0; j < 2; j++) {
                const col = right - j;
                if (!taken[row][col]) place.push([row, col]);
            }
        }
    }
    const MASKS: Array<(i: number, j: number) => boolean> = [
        (i, j) => (i + j) % 2 === 0,
        (i) => i % 2 === 0,
        (_i, j) => j % 3 === 0,
        (i, j) => (i + j) % 3 === 0,
        (i, j) => (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0,
        (i, j) => ((i * j) % 2) + ((i * j) % 3) === 0,
        (i, j) => (((i * j) % 2) + ((i * j) % 3)) % 2 === 0,
        (i, j) => (((i + j) % 2) + ((i * j) % 3)) % 2 === 0,
    ];
    const build = (mask: number): boolean[][] => {
        const out = cells.map((row) => row.slice());
        place.forEach(([row, col], n) => {
            out[row][col] = (data[n] === 1) !== MASKS[mask](row, col);
        });
        // Формат: уровень M (00) и номер маски, код БЧХ(15,5) и маска 0x5412
        let rem = mask;
        for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
        const format = ((mask << 10) | rem) ^ 0x5412;
        const bit = (i: number): boolean => ((format >>> i) & 1) === 1;
        const at = (col: number, row: number, dark: boolean): void => {
            out[row][col] = dark;
        };
        for (let i = 0; i <= 5; i++) at(8, i, bit(i));
        at(8, 7, bit(6));
        at(8, 8, bit(7));
        at(7, 8, bit(8));
        for (let i = 9; i < 15; i++) at(14 - i, 8, bit(i));
        for (let i = 0; i < 8; i++) at(size - 1 - i, 8, bit(i));
        for (let i = 8; i < 15; i++) at(8, size - 15 + i, bit(i));
        at(8, size - 8, true);
        return out;
    };
    // Штрафы за длинные серии, квадраты одного цвета, узоры, похожие на метки, и перекос темноты
    const penalty = (grid: boolean[][]): number => {
        let score = 0;
        for (let pass = 0; pass < 2; pass++) {
            for (let a = 0; a < size; a++) {
                let line = '';
                let run = 1;
                for (let b = 0; b < size; b++) {
                    const dark = pass === 0 ? grid[a][b] : grid[b][a];
                    line += dark ? '1' : '0';
                    if (b > 0) {
                        const before = pass === 0 ? grid[a][b - 1] : grid[b - 1][a];
                        if (before === dark) {
                            run++;
                            if (run === 5) score += 3;
                            else if (run > 5) score++;
                        } else run = 1;
                    }
                }
                for (const pattern of ['10111010000', '00001011101']) {
                    for (let at = line.indexOf(pattern); at >= 0; at = line.indexOf(pattern, at + 1)) score += 40;
                }
            }
        }
        let dark = 0;
        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                if (grid[r][c]) dark++;
                if (r > 0 && c > 0 && grid[r][c] === grid[r - 1][c] && grid[r][c] === grid[r][c - 1] && grid[r][c] === grid[r - 1][c - 1]) score += 3;
            }
        }
        const total = size * size;
        score += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
        return score;
    };
    let best: boolean[][] = [];
    let bestScore = Infinity;
    for (let mask = 0; mask < 8; mask++) {
        const grid = build(mask);
        const score = penalty(grid);
        if (score < bestScore) {
            bestScore = score;
            best = grid;
        }
    }
    return best;
}

/** Готовый SVG значка: светлая плашка с тихой зоной в 4 модуля, тёмные модули с лёгким скруглением. Обычная полярность
 * (тёмное на светлом), чтобы код читали любые сканеры, в том числе со скриншота */
export function qrSvg(grid: boolean[][], dark: string): string {
    const size = grid.length;
    if (!size) return '';
    const quiet = 4;
    const total = size + quiet * 2;
    const r = 0.2;
    const s = 1 - 2 * r;
    const mod = (c: number, rw: number): string =>
        'M' + (c + r) + ' ' + rw + 'h' + s + 'a' + r + ' ' + r + ' 0 0 1 ' + r + ' ' + r + 'v' + s + 'a' + r + ' ' + r + ' 0 0 1 -' + r + ' ' + r + 'h-' + s + 'a' + r + ' ' + r + ' 0 0 1 -' + r + ' -' + r + 'v-' + s + 'a' + r + ' ' + r + ' 0 0 1 ' + r + ' -' + r + 'z';
    let path = '';
    for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) if (grid[row][col]) path += mod(col + quiet, row + quiet);
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + total + ' ' + total + '" aria-hidden="true"><rect width="' + total + '" height="' + total + '" rx="3" fill="#fff"/><path fill="' + dark + '" d="' + path + '"/></svg>';
}
