import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NARROW_CSS } from './narrowLayout';

function block(css: string, head: string): string {
    const start = css.indexOf(head);
    if (start < 0) return '';
    let depth = 0;
    for (let i = css.indexOf('{', start); i < css.length; i++) {
        if (css[i] === '{') depth++;
        else if (css[i] === '}' && --depth === 0) return css.slice(start, i + 1);
    }
    return '';
}

describe('NARROW_CSS', () => {
    it('прячет правую колонку на ≤900px', () => {
        const b = block(NARROW_CSS, '@media (max-width:900px)');
        expect(b).toContain('.l-sidebar-right{display:none!important}');
        expect(b).toContain('html,body{overflow-x:clip}');
        expect(b).toContain('.playControls__volume,.playControls__repeat{display:none!important}');
    });
    it('сужает колонку до 220px на 901..1100px', () => {
        const b = block(NARROW_CSS, '@media (max-width:1100px) and (min-width:901px)');
        expect(b).toContain('220px');
        expect(b).not.toContain('250px');
    });
    it('не задаёт width:250px колонке', () => {
        expect(NARROW_CSS).not.toMatch(/\.l-sidebar-right\{[^}]*250px/);
    });
    it('скобки сбалансированы', () => {
        expect(NARROW_CSS.split('{').length).toBe(NARROW_CSS.split('}').length);
    });
    it('все правила внутри медиа-запросов', () => {
        expect(NARROW_CSS.trimStart().startsWith('@media')).toBe(true);
        expect(NARROW_CSS.trimEnd().endsWith('}')).toBe(true);
    });
});

describe('wave.ts узкое/низкое окно', () => {
    const src = readFileSync(join(__dirname, 'wave.ts'), 'utf8');
    it('компактная обложка и низкий режим', () => {
        expect(src).toContain('min(200px,56cqw)');
        expect(src).toContain('@media (max-height:700px)');
        expect(src).toContain('--scw-cover-size:128px');
        expect(src).toContain('container-type:inline-size;container-name:scw');
        expect(src).toContain('@container scw (max-width:620px)');
    });
});
