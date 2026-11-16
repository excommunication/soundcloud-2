// QR-код для значка «sc2» в режиме «Для роликов» (2.11.0): ссылка на репозиторий клиента, чтобы по скриншоту ролика его находили.
// Библиотек в клиенте нет, поэтому кодировщик свой и маленький: буквенно-цифровой режим (заглавные, цифры, « $%*+-./:») или
// байтовый, уровни исправления M, Q и H, версии 1–6, все восемь масок с выбором по штрафам. 2.11.1: уровень H держит значок
// клиента посередине кода, а ссылка заглавными идёт буквенно-цифровым режимом и влезает в версию 4 (33×33) даже с ним.
// Обе функции уходят на страницу текстом (pageHelpers в wave.ts): внутри только свои объявления, ничего снаружи.

/** Матрица модулей QR-кода: true — тёмный. Строка за строкой, сверху вниз. Текст, который не влезает в версию 6, даёт пустую матрицу */
export function qrMatrix(text: string, level: 'M' | 'Q' | 'H' = 'M'): boolean[][] {
    const ALNUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
    const alnum = text.length > 0 && Array.from(text).every((ch) => ALNUM.includes(ch));
    const bytes = alnum ? [] : Array.from(new TextEncoder().encode(text));
    // Слов исправления на блок, затем пары «число блоков, слов данных в блоке» (у версии 5 при Q и H блоки двух размеров)
    const TABLE: Record<'M' | 'Q' | 'H', number[][]> = {
        M: [[10, 1, 16], [16, 1, 28], [26, 1, 44], [18, 2, 32], [24, 2, 43], [16, 4, 27]],
        Q: [[13, 1, 13], [22, 1, 22], [18, 2, 17], [26, 2, 24], [18, 2, 15, 2, 16], [24, 4, 19]],
        H: [[17, 1, 9], [28, 1, 16], [22, 2, 13], [16, 4, 9], [22, 2, 11, 2, 12], [28, 4, 15]],
    };
    const need = alnum ? 4 + 9 + Math.floor(text.length / 2) * 11 + (text.length % 2) * 6 : 4 + 8 + bytes.length * 8;
    let version = 0;
    let row: number[] = [];
    for (let i = 0; i < 6; i++) {
        const spec = TABLE[level][i];
        let words = 0;
        for (let j = 1; j < spec.length; j += 2) words += spec[j] * spec[j + 1];
        if (need <= words * 8 && (alnum || bytes.length < 256)) {
            version = i + 1;
            row = spec;
            break;
        }
    }
    if (!version) return [];
    const ec = row[0];
    const sizes: number[] = [];
    for (let j = 1; j < row.length; j += 2) for (let b = 0; b < row[j]; b++) sizes.push(row[j + 1]);
    const dataWords = sizes.reduce((sum, n) => sum + n, 0);
    const size = 17 + 4 * version;

    // Поток битов данных
    const bits: number[] = [];
    const put = (value: number, count: number): void => {
        for (let i = count - 1; i >= 0; i--) bits.push((value >>> i) & 1);
    };
    if (alnum) {
        put(2, 4);
        put(text.length, 9);
        for (let i = 0; i + 1 < text.length; i += 2) put(ALNUM.indexOf(text[i]) * 45 + ALNUM.indexOf(text[i + 1]), 11);
        if (text.length % 2) put(ALNUM.indexOf(text[text.length - 1]), 6);
    } else {
        put(4, 4);
        put(bytes.length, 8);
        for (const byte of bytes) put(byte, 8);
    }
    const capacity = dataWords * 8;
    for (let i = 0; i < 4 && bits.length < capacity; i++) bits.push(0);
    while (bits.length % 8) bits.push(0);
    const words: number[] = [];
    for (let i = 0; i < bits.length; i += 8) {
        let word = 0;
        for (let j = 0; j < 8; j++) word = (word << 1) | bits[i + j];
        words.push(word);
    }
    for (let pad = 0xec; words.length < dataWords; pad ^= 0xec ^ 0x11) words.push(pad);

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
    for (let i = 0; i < ec; i++) {
        const next: number[] = new Array(gen.length + 1).fill(0);
        for (let j = 0; j < gen.length; j++) {
            next[j] ^= gen[j];
            next[j + 1] ^= mul(gen[j], exp[i]);
        }
        gen = next;
    }
    const blocks: number[][] = [];
    const checks: number[][] = [];
    let from = 0;
    for (const count of sizes) {
        const block = words.slice(from, from + count);
        from += count;
        const rem: number[] = new Array(ec).fill(0);
        for (const word of block) {
            const factor = word ^ (rem.shift() as number);
            rem.push(0);
            for (let j = 0; j < ec; j++) rem[j] ^= mul(gen[j + 1], factor);
        }
        blocks.push(block);
        checks.push(rem);
    }
    // Слова блоков вперемешку: сначала данные по очереди из каждого блока (короткие блоки кончаются раньше), потом исправление
    const stream: number[] = [];
    const longest = Math.max(...sizes);
    for (let i = 0; i < longest; i++) for (const block of blocks) if (i < block.length) stream.push(block[i]);
    for (let i = 0; i < ec; i++) for (const check of checks) stream.push(check[i]);
    const data: number[] = [];
    for (const word of stream) for (let i = 7; i >= 0; i--) data.push((word >>> i) & 1);
    // Остаточные биты у версий 2–6 (у первой их нет)
    if (version > 1) for (let i = 0; i < 7; i++) data.push(0);

    // Служебные узоры
    const cells: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));
    const taken: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));
    const set = (col: number, r: number, dark: boolean): void => {
        if (col < 0 || r < 0 || col >= size || r >= size) return;
        cells[r][col] = dark;
        taken[r][col] = true;
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
            const r = up ? size - 1 - step : step;
            for (let j = 0; j < 2; j++) {
                const col = right - j;
                if (!taken[r][col]) place.push([r, col]);
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
    // Уровень в формате: M 00, Q 11, H 10
    const levelBits = level === 'M' ? 0 : level === 'Q' ? 3 : 2;
    const build = (mask: number): boolean[][] => {
        const out = cells.map((line) => line.slice());
        place.forEach(([r, col], n) => {
            out[r][col] = (data[n] === 1) !== MASKS[mask](r, col);
        });
        // Формат: уровень и номер маски, код БЧХ(15,5) и маска 0x5412
        const head = (levelBits << 3) | mask;
        let rem = head;
        for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
        const format = ((head << 10) | rem) ^ 0x5412;
        const bit = (i: number): boolean => ((format >>> i) & 1) === 1;
        const at = (col: number, r: number, dark: boolean): void => {
            out[r][col] = dark;
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

/** Готовый SVG значка в духе визитки Telegram: обычная полярность (тёмное на светлом, так код читают любые сканеры, в том
 * числе со скриншота), тихая зона в 3 модуля, модули сливаются в капли со скруглёнными свободными углами, метки — скруглённые
 * квадраты. hole > 0 — посередине пустой квадрат hole×hole модулей под значок клиента: облако и полоски, полоски с классом
 * scq-b и номером --i (их анимирует страница). Дыру держит только уровень H, тест считает испорченные слова по блокам */
export function qrSvg(grid: boolean[][], dark: string, hole = 0): string {
    const size = grid.length;
    if (!size) return '';
    const quiet = 3;
    const total = size + quiet * 2;
    const lo = hole > 0 ? (size - hole) / 2 : -1;
    const inHole = (r: number, c: number): boolean => hole > 0 && r >= lo && r < lo + hole && c >= lo && c < lo + hole;
    const inFinder = (r: number, c: number): boolean => (r < 7 && c < 7) || (r < 7 && c >= size - 7) || (r >= size - 7 && c < 7);
    const on = (r: number, c: number): boolean => r >= 0 && c >= 0 && r < size && c < size && grid[r][c] && !inFinder(r, c) && !inHole(r, c);
    const n = (v: number): string => String(Math.round(v * 1000) / 1000);
    const R = 0.5;
    // Модуль — квадрат; угол скругляется, только когда обе соседние по нему стороны пусты. Со стороны соседа квадрат чуть
    // заходит на него, чтобы между слитыми модулями не светились швы сглаживания
    let path = '';
    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            if (!on(r, c)) continue;
            const up = on(r - 1, c);
            const down = on(r + 1, c);
            const left = on(r, c - 1);
            const right = on(r, c + 1);
            const x0 = c + quiet - (left ? 0.02 : 0);
            const x1 = c + quiet + 1 + (right ? 0.02 : 0);
            const y0 = r + quiet - (up ? 0.02 : 0);
            const y1 = r + quiet + 1 + (down ? 0.02 : 0);
            const tl = !up && !left ? R : 0;
            const tr = !up && !right ? R : 0;
            const br = !down && !right ? R : 0;
            const bl = !down && !left ? R : 0;
            path += 'M' + n(x0 + tl) + ' ' + n(y0) + 'H' + n(x1 - tr);
            if (tr) path += 'A' + R + ' ' + R + ' 0 0 1 ' + n(x1) + ' ' + n(y0 + tr);
            path += 'V' + n(y1 - br);
            if (br) path += 'A' + R + ' ' + R + ' 0 0 1 ' + n(x1 - br) + ' ' + n(y1);
            path += 'H' + n(x0 + bl);
            if (bl) path += 'A' + R + ' ' + R + ' 0 0 1 ' + n(x0) + ' ' + n(y1 - bl);
            path += 'V' + n(y0 + tl);
            if (tl) path += 'A' + R + ' ' + R + ' 0 0 1 ' + n(x0 + tl) + ' ' + n(y0);
            path += 'Z';
        }
    }
    // Метки: кольцо 7×7 со скруглением и «глаз» 3×3
    const rrect = (x: number, y: number, w: number, rad: number): string =>
        'M' + n(x + rad) + ' ' + n(y) + 'H' + n(x + w - rad) + 'A' + rad + ' ' + rad + ' 0 0 1 ' + n(x + w) + ' ' + n(y + rad) + 'V' + n(y + w - rad) + 'A' + rad + ' ' + rad + ' 0 0 1 ' + n(x + w - rad) + ' ' + n(y + w) +
        'H' + n(x + rad) + 'A' + rad + ' ' + rad + ' 0 0 1 ' + n(x) + ' ' + n(y + w - rad) + 'V' + n(y + rad) + 'A' + rad + ' ' + rad + ' 0 0 1 ' + n(x + rad) + ' ' + n(y) + 'Z';
    let eyes = '';
    for (const [r, c] of [[0, 0], [0, size - 7], [size - 7, 0]]) {
        const x = c + quiet;
        const y = r + quiet;
        eyes += rrect(x, y, 7, 2.1) + rrect(x + 1, y + 1, 5, 1.35) + rrect(x + 2, y + 2, 3, 0.95);
    }
    let logo = '';
    if (hole > 0) {
        // Значок клиента (2.11.2): оранжевый скруглённый квадрат, как у SoundCloud, белое облако и четыре толстые полоски — тонкие
        // на скриншоте сливались. Оранжевый медленно переливается (SMIL внутри SVG, без скрипта). Рисунок в поле 30×26
        const side = hole - 0.5;
        const at = quiet + lo + 0.25;
        const k = (side * 0.84) / 22;
        const ox = at + side / 2 - 14.65 * k;
        const oy = at + side / 2 - 13 * k;
        const HEIGHTS = [5, 7.4, 8.6, 10.2];
        let bars = '';
        HEIGHTS.forEach((h, i) => {
            bars += '<rect class="scq-b" style="--i:' + i + '" x="' + n(4 + i * 2.2) + '" y="' + n(13 - h / 2) + '" width="1.4" height="' + n(h) + '" rx=".7"/>';
        });
        logo =
            '<defs><linearGradient id="scq-o" gradientUnits="objectBoundingBox" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffa03a"/><stop offset=".5" stop-color="#ff5500"/><stop offset="1" stop-color="#ff2d55"/>' +
            '<animateTransform attributeName="gradientTransform" type="rotate" values="0 .5 .5;360 .5 .5" dur="9s" repeatCount="indefinite"/></linearGradient></defs>' +
            '<rect x="' + n(at) + '" y="' + n(at) + '" width="' + n(side) + '" height="' + n(side) + '" rx="' + n(side * 0.27) + '" fill="url(#scq-o)"/>' +
            '<g transform="translate(' + n(ox) + ' ' + n(oy) + ') scale(' + n(k) + ')" fill="#fff">' +
            '<g class="scq-eq">' + bars + '</g>' +
            '<path d="M13.6 18.1Q13 18.1 13 17.5V8.6C13.95 8.15 15 7.95 16.05 7.95 18.65 7.95 20.75 9.75 21.35 12.05 21.85 11.85 22.4 11.75 22.9 11.75 24.8 11.75 25.9 13.15 25.9 14.9 25.9 16.7 24.8 18.1 22.9 18.1Z"/>' +
            '</g>';
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + total + ' ' + total + '" aria-hidden="true"><rect width="' + total + '" height="' + total + '" rx="5.6" fill="#fff"/>' +
        '<path fill="' + dark + '" d="' + eyes + '" fill-rule="evenodd"/><path fill="' + dark + '" d="' + path + '"/>' + logo + '</svg>';
}
