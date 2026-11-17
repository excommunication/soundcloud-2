import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

const html = readFileSync(join(__dirname, 'header.html'), 'utf8');
const main = readFileSync(join(__dirname, '..', 'main.ts'), 'utf8');
const wave = readFileSync(join(__dirname, '..', 'services', 'wave', 'jam.ts'), 'utf8');

describe('кнопки шапки', () => {
    it('все кнопки навигации настоящие button с подписью и без дублей id', () => {
        expect(html).not.toMatch(/<div class="nav-button"/);
        const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]);
        expect(new Set(ids).size).toBe(ids.length);
        for (const match of html.matchAll(/<button[^>]*>/g)) expect(match[0]).toMatch(/aria-label="[^"]+"/);
    });

    it('подпись кнопки оформления переводится на оба языка', () => {
        expect(main).toContain("'headerAppearance'");
        for (const lang of ['ru', 'en']) {
            const texts = JSON.parse(readFileSync(join(__dirname, '..', 'i18n', lang + '.json'), 'utf8')) as Record<string, string>;
            expect(texts.headerAppearance).toBeTruthy();
        }
    });

    it('Ctrl+J остаётся за «К дропу», джем на Ctrl+Shift+J', () => {
        expect(main).toContain("'CommandOrControl+J', 'Jump to the drop'");
        expect(wave).toContain('event.ctrlKey && event.shiftKey');
    });
});
