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
    it('901..1100px: колонка 240px целиком в окне, резерв справа под неё сброшен', () => {
        const b = block(NARROW_CSS, '@media (max-width:1100px) and (min-width:901px)');
        expect(b).toContain('width:240px!important');
        expect(b).not.toContain('220px');
        expect(b).not.toContain('250px');
        expect(b).toContain(':has(.l-sidebar-right){padding-right:0!important;margin-right:0!important');
        expect(b).toContain(':has(>.l-sidebar-right){display:flex!important');
        expect(b).toContain('position:static!important;float:none!important');
        expect(b).toContain('html,body{overflow-x:clip}');
    });
    it('ряд жанров не переносится, а листается без полосы', () => {
        expect(NARROW_CSS).toContain('#sc-wave .scw-moods{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none');
    });
    it('не задаёт width:250px колонке', () => {
        expect(NARROW_CSS).not.toMatch(/\.l-sidebar-right\{[^}]*250px/);
    });
    it('скобки сбалансированы', () => {
        expect(NARROW_CSS.split('{').length).toBe(NARROW_CSS.split('}').length);
    });
    it('правила уровня страницы ограничены плеером и меню «…», остальное в медиа-запросах', () => {
        expect(NARROW_CSS.trimEnd().endsWith('}')).toBe(true);
        let depth = 0;
        let top = '';
        let rule = '';
        for (const ch of NARROW_CSS) {
            if (ch === '{') depth++;
            if (depth === 0) rule += ch;
            if (ch === '}' && --depth === 0) {
                top += rule.trim() + '\n';
                rule = '';
            }
        }
        for (const selector of top.split('\n').filter((line) => line && !line.startsWith('@media'))) {
            expect(selector).toMatch(/\.playControls|\.sca-more/);
        }
    });
});

describe('wave.ts узкое/низкое окно', () => {
    const src = readFileSync(join(__dirname, 'wave.ts'), 'utf8');
    it('компактная обложка и низкий режим', () => {
        expect(src).toContain('clamp(96px,24cqw,128px)');
        expect(src).not.toContain('min(200px,56cqw)');
        expect(src).toContain('@media (max-height:700px)');
        expect(src).toContain('--scw-cover-size:128px');
        expect(src).toContain('container-type:inline-size;container-name:scw');
        expect(src).toContain('@container scw (max-width:620px)');
    });
    it('901..1100 px: плашка слева, «Далее» справа двумя колонками на #sc-wave', () => {
        const rule = /'@media \(max-width:1100px\) and \(min-width:901px\)\{#sc-wave\{[^']*'/.exec(src)?.[0] ?? '';
        expect(rule).toContain('display:grid;grid-template-columns:minmax(0,1fr) 168px');
        expect(rule).toContain('#sc-wave>.scw-body{grid-column:1');
        expect(rule).toContain('#sc-wave>.scw-up-h{grid-column:2');
        expect(rule).toContain('.scw-tiles:not(.scw-shelf){grid-column:2');
        expect(rule).not.toContain('flex-direction:column');
    });
    it('940..1100 px: колонка «Далее» шире, третья плитка видна', () => {
        expect(src).toContain('@media (max-width:1100px) and (min-width:940px){#sc-wave{grid-template-columns:minmax(0,1fr) 190px}');
        expect(src).toContain('.scw-tile:nth-child(3){display:grid}');
    });
    it('в узком диапазоне .scw-body остаётся строкой, не столбцом', () => {
        expect(src).not.toMatch(/\.scw-body\{[^}]*flex-direction:column/);
        const rule = /'@container scw \(max-width:620px\)\{[^']*'/.exec(src)?.[0] ?? '';
        expect(rule).toContain('flex-direction:row');
        expect(rule).not.toContain('flex-direction:column');
        expect(rule).not.toContain('order:-1');
    });
});

describe('плеер: лишние кнопки уходят в меню «…», а не обрезаются', () => {
    const aurora = readFileSync(join(__dirname, 'aurora.ts'), 'utf8');
    it('CSS не прячет кнопки по ширине окна, прячет только класс sca-ovf', () => {
        expect(NARROW_CSS).not.toContain('[data-act="drop"]');
        expect(NARROW_CSS).not.toContain('[data-act="wave"]');
        expect(NARROW_CSS).not.toContain('[data-act="next"]');
        expect(NARROW_CSS).not.toContain('.sc-button-follow');
        expect(NARROW_CSS).toContain('.sca-ovf.sca-ovf{display:none!important}');
    });
    it('кнопка «…» и меню оформлены, бейдж трека сжимается', () => {
        expect(NARROW_CSS).toContain('button.sca-more');
        expect(NARROW_CSS).toContain('.sca-more-pop');
        expect(NARROW_CSS).toContain('.playControls__soundBadge{min-width:0!important}');
    });
    it('лайк и кнопка эффектов не уходят в «…»', () => {
        expect(NARROW_CSS).not.toMatch(/sca-ovf[^}]*like/);
        expect(NARROW_CSS).toContain('button.sca-fx{display:inline-grid!important');
        const order = /const OVF_ORDER = \[([^\]]*)\]/.exec(aurora)?.[1] ?? '';
        expect(order).toContain("'drop'");
        expect(order).not.toContain("'like'");
        expect(order).not.toContain("'fx'");
        expect(aurora).toContain('function fitBar()');
    });
    it('правая группа бара: «С другом», ролики, эффекты стоят справа за разделителем, всегда на месте', () => {
        const order = (selector: string) => {
            const at = NARROW_CSS.indexOf(selector + '{order:');
            return at < 0 ? Number.NaN : parseInt(NARROW_CSS.slice(at + selector.length + 7), 10);
        };
        const seq = [order('.playControls__elements>.playControls__soundBadge'), order('.sca-bar-sep'), order('.scj-chip.bar'), order('.scc-open'), order('button.sca-fx')];
        expect(seq.every(Number.isFinite)).toBe(true);
        expect([...seq].sort((x, y) => x - y)).toEqual(seq);
        expect(new Set(seq).size).toBe(seq.length);
        // Громкость слева от прогресса, название трека правее прогресса
        expect(order('.scv[data-kind="bar"]')).toBeLessThan(order('.playControls__elements>.playControls__timeline'));
        expect(order('.playControls__elements>.playControls__timeline')).toBeLessThan(seq[0]);
        expect(NARROW_CSS).toContain('.playControls__volume{display:contents!important}');
        // Одинаковые круглые кнопки, ни одна не прячется по ширине окна
        expect(NARROW_CSS).toContain('html body .playControls .scj-chip.bar,html body .playControls .scc-open,html body .playControls button.sca-fx{display:inline-grid!important;flex:none!important;width:32px!important;height:32px!important');
    });
    it('«С другом» без подписи: ни в одном медиа-запросе нет текстовых правил для кнопки', () => {
        expect(NARROW_CSS).not.toContain('.scj-n');
        expect(NARROW_CSS).not.toContain('.scj-chip.bar .scj-n');
    });
    it('кнопка эффектов: меню по клику, без наведения, правой кнопки и цикла режимов', () => {
        expect(aurora).toContain("fxButton.setAttribute('aria-haspopup', 'menu')");
        expect(aurora).toContain('function openFxMenu()');
        expect(aurora).not.toContain('mouseenter');
        expect(aurora).not.toContain('contextmenu');
        expect(aurora).not.toContain('FX_ORDER');
        expect(aurora).not.toContain('sc2-fx');
        expect(aurora).toContain('setEffectsMode');
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
