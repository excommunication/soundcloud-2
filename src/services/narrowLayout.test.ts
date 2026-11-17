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

describe('плеер: второстепенные кнопки прячутся по мере сужения', () => {
    it('до 1280/1100/960 px', () => {
        expect(block(NARROW_CSS, '@media (max-width:1280px)')).toContain('[data-act="drop"]');
        const mid = block(NARROW_CSS, '@media (max-width:1100px){');
        expect(mid).toContain('[data-act="wave"]');
        expect(mid).toContain('.sc-button-follow');
        expect(block(NARROW_CSS, '@media (max-width:960px)')).toContain('[data-act="next"]');
    });
    it('лайк, «Не нравится» и очередь не прячутся', () => {
        expect(NARROW_CSS).not.toContain('[data-act="dislike"]');
        expect(NARROW_CSS).not.toMatch(/display:none!important[^}]*like/);
    });
});

describe('«Далее» и полка: одинаковые квадратные обложки, сетка по ширине блока', () => {
    const wave = readFileSync(join(__dirname, 'wave.ts'), 'utf8');
    const aurora = readFileSync(join(__dirname, 'aurora.ts'), 'utf8');
    it('у обложки есть aspect-ratio:1 и object-fit:cover', () => {
        expect(wave).toContain('.scw-art{position:relative;aspect-ratio:1;');
        expect(wave).toContain('object-fit:cover');
        expect(aurora).toMatch(/\.scw-tile>\.scw-art\{flex:none;width:100%;aspect-ratio:1;/);
        expect(aurora).toContain('.scw-tile>.scw-art img{width:100%;height:100%;object-fit:cover}');
        expect(aurora).toContain('background-size:cover');
    });
    it('подписи плитки в одну строку с многоточием', () => {
        expect(aurora).toMatch(/\.scw-tile>\.scw-t3\{[^}]*white-space:nowrap;overflow:hidden;text-overflow:ellipsis/);
    });
    it('колонки считаются по контейнеру, а не по окну', () => {
        expect(wave).toContain('@container scw (max-width:799px){#sc-wave .scw-tiles:not(.scw-shelf){grid-template-columns:repeat(3');
        expect(wave).toContain('@container scw (max-width:479px)');
        expect(wave).toContain('@container scw (max-width:899px){#sc-wave .scw-tiles.scw-shelf{grid-template-columns:repeat(4');
        expect(wave).not.toContain("'@media(max-width:1200px){#sc-wave .scw-tiles");
        expect(wave).not.toContain("'@media(max-width:920px){#sc-wave .scw-tiles");
        expect(wave).toContain('@container scw (max-width:899px){#sc-wave .scw-shelf>.scw-mix{grid-row:var(--scw-row4)}');
    });
});
