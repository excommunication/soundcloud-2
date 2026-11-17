import { join } from 'path';
import { deflateSync } from 'zlib';

export type ThumbarIconName = 'backward' | 'play' | 'pause' | 'forward' | 'heart' | 'heart-filled';
export const THUMBAR_ICON_NAMES: ThumbarIconName[] = ['backward', 'play', 'pause', 'forward', 'heart', 'heart-filled'];

/** Каталоги иконок по порядку: заданный main, resources/assets/icons упакованной сборки, внутри asar, рядом со сборкой */
export function iconDirectories(resources: string, resourcesPath: string | undefined, appPath: string | undefined, dirname: string): string[] {
    const list = [
        join(resources, 'icons'),
        resourcesPath ? join(resourcesPath, 'assets', 'icons') : '',
        appPath ? join(appPath, 'assets', 'icons') : '',
        join(dirname, '..', 'assets', 'icons'),
    ].filter(Boolean);
    return [...new Set(list)];
}

/** Первый существующий файл иконки или null. Наличие файлов передаётся снаружи, чтобы логику можно было проверить без диска */
export function findIconFile(name: string, directories: string[], exists: (path: string) => boolean): string | null {
    for (const directory of directories) {
        const file = join(directory, name + '.ico');
        if (exists(file)) return file;
    }
    return null;
}

const SIZE = 32;

// Маска фигуры в клетке 32x32: true там, где пиксель белый
function shape(name: ThumbarIconName): (x: number, y: number) => boolean {
    const triangle = (x: number, y: number, left: number, right: number, pointsRight: boolean): boolean => {
        const t = (x - left) / (right - left);
        if (t < 0 || t > 1) return false;
        const half = (pointsRight ? 1 - t : t) * 10;
        return Math.abs(y - 16) <= half;
    };
    switch (name) {
        case 'play': return (x, y) => triangle(x, y, 9, 25, true);
        case 'pause': return (x, y) => y >= 7 && y <= 25 && ((x >= 9 && x <= 13) || (x >= 19 && x <= 23));
        case 'forward': return (x, y) => triangle(x, y, 7, 21, true) || (x >= 22 && x <= 25 && y >= 7 && y <= 25);
        case 'backward': return (x, y) => triangle(x, y, 11, 25, false) || (x >= 7 && x <= 10 && y >= 7 && y <= 25);
        default: {
            // Сердце: две окружности и треугольник
            const heart = (x: number, y: number): boolean => {
                const circle = (cx: number, cy: number): boolean => (x - cx) ** 2 + (y - cy) ** 2 <= 36;
                return circle(11.5, 12) || circle(20.5, 12) || (y >= 12 && y <= 27 && Math.abs(x - 16) <= 12 - (y - 12) * 0.8);
            };
            if (name === 'heart-filled') return heart;
            return (x, y) => heart(x, y) && !heart(16 + (x - 16) * 1.5, 15 + (y - 15) * 1.5);
        }
    }
}

function crc32(data: Buffer): number {
    let crc = 0xffffffff;
    for (const byte of data) {
        crc ^= byte;
        for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), body.length + 4);
    return out;
}

/** PNG 32x32 с белой фигурой на прозрачном фоне: запасная иконка, когда файла .ico нет ни по одному из путей */
export function fallbackIconPng(name: ThumbarIconName): Buffer {
    const mask = shape(name);
    const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
    for (let y = 0; y < SIZE; y++) {
        const row = y * (SIZE * 4 + 1);
        for (let x = 0; x < SIZE; x++) {
            const at = row + 1 + x * 4;
            if (mask(x + 0.5, y + 0.5)) raw.fill(255, at, at + 4);
        }
    }
    const header = Buffer.alloc(13);
    header.writeUInt32BE(SIZE, 0);
    header.writeUInt32BE(SIZE, 4);
    header[8] = 8;
    header[9] = 6;
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
