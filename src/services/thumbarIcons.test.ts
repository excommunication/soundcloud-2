import { expect, it } from 'vitest';
import { join } from 'path';
import { fallbackIconPng, findIconFile, iconDirectories, THUMBAR_ICON_NAMES } from './thumbarIcons';

it('ищет иконку по каталогам по порядку и не повторяет каталоги', () => {
    const directories = iconDirectories('X/assets', 'R', 'A', 'D/tsc');
    expect(directories).toEqual([join('X/assets', 'icons'), join('R', 'assets', 'icons'), join('A', 'assets', 'icons'), join('D/tsc', '..', 'assets', 'icons')]);
    const present = new Set([join('A', 'assets', 'icons', 'play.ico'), join('R', 'assets', 'icons', 'play.ico')]);
    expect(findIconFile('play', directories, (path) => present.has(path))).toBe(join('R', 'assets', 'icons', 'play.ico'));
    expect(findIconFile('heart', directories, (path) => present.has(path))).toBeNull();
    expect(iconDirectories('R/assets', 'R', undefined, 'x')).toHaveLength(2);
});

it('запасная иконка это корректный PNG 32x32 с непрозрачными пикселями', () => {
    for (const name of THUMBAR_ICON_NAMES) {
        const png = fallbackIconPng(name);
        expect(png.subarray(1, 4).toString()).toBe('PNG');
        expect(png.readUInt32BE(16)).toBe(32);
        expect(png.length).toBeGreaterThan(80);
    }
    expect(fallbackIconPng('play').equals(fallbackIconPng('pause'))).toBe(false);
});
