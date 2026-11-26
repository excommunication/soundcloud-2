// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import {
    SNOW_LAYERS,
    WINTER_AWAY_FPS,
    WINTER_IDLE_SECONDS,
    awaySteps,
    createWinterHeader,
    inWinterSeason,
    normalizeWinterPreference,
    winterAwayScript,
    winterChoice,
    winterEnabled,
    winterHeaderCss,
    winterPageCss,
    winterPageScript,
    winterStill,
    winterStillScript,
} from './winter';
import { validateSettingChange } from '../../settings/validateSetting';

const day = (month: number, date: number, hour = 12) => new Date(2026, month - 1, date, hour);

describe('сезон новогодней темы', () => {
    it('с 15 декабря по 14 января включительно, по местной дате', () => {
        expect(inWinterSeason(day(12, 14, 23))).toBe(false);
        expect(inWinterSeason(day(12, 15, 0))).toBe(true);
        expect(inWinterSeason(day(12, 31, 23))).toBe(true);
        expect(inWinterSeason(day(1, 1, 0))).toBe(true);
        expect(inWinterSeason(day(1, 14, 23))).toBe(true);
        expect(inWinterSeason(day(1, 15, 0))).toBe(false);
        expect(inWinterSeason(day(7, 1))).toBe(false);
        expect(inWinterSeason(day(11, 25))).toBe(false);
    });

    it('без выбора человека тема идёт по сезону', () => {
        expect(winterEnabled(undefined, day(12, 20))).toBe(true);
        expect(winterEnabled(undefined, day(2, 1))).toBe(false);
        expect(winterEnabled('auto', day(1, 10))).toBe(true);
        expect(winterEnabled('мусор', day(1, 10))).toBe(true);
    });

    it('явный выбор сильнее сезона', () => {
        expect(winterEnabled('off', day(12, 31))).toBe(false);
        expect(winterEnabled('on', day(6, 1))).toBe(true);
        expect(normalizeWinterPreference(true)).toBe('on');
        expect(normalizeWinterPreference(false)).toBe('off');
        expect(normalizeWinterPreference(42)).toBe('auto');
    });
});

describe('переключатель запоминает выбор', () => {
    // Хранилище как electron-store: main пишет то, что вернул winterChoice
    const toggle = (store: Map<string, unknown>, enabled: boolean, date: Date) => store.set('winterTheme', winterChoice(enabled, date));

    it('выключил в сезон: выключено и в следующем декабре', () => {
        const store = new Map<string, unknown>();
        toggle(store, false, day(12, 20));
        expect(store.get('winterTheme')).toBe('off');
        expect(winterEnabled(store.get('winterTheme'), day(12, 20))).toBe(false);
        expect(winterEnabled(store.get('winterTheme'), new Date(2027, 11, 20))).toBe(false);
    });

    it('включил обратно в сезон: снова по сезону, после праздников уйдёт сама', () => {
        const store = new Map<string, unknown>([['winterTheme', 'off']]);
        toggle(store, true, day(12, 20));
        expect(store.get('winterTheme')).toBe('auto');
        expect(winterEnabled(store.get('winterTheme'), day(1, 20))).toBe(false);
    });

    it('включил летом: держится; выключил летом: снова по сезону', () => {
        const store = new Map<string, unknown>();
        toggle(store, true, day(7, 1));
        expect(store.get('winterTheme')).toBe('on');
        expect(winterEnabled(store.get('winterTheme'), day(8, 1))).toBe(true);
        toggle(store, false, day(8, 1));
        expect(store.get('winterTheme')).toBe('auto');
        expect(winterEnabled(store.get('winterTheme'), day(12, 16))).toBe(true);
    });

    it('F1 присылает логическое значение', () => {
        expect(validateSettingChange({ key: 'winterTheme', value: true })).toBe(true);
        expect(validateSettingChange({ key: 'winterTheme', value: 'on' })).toBe(false);
    });
});

describe('оформление', () => {
    const opts = { mode: 'full', keepFramesUnfocused: false };

    it('выключенная тема не добавляет CSS, скрипт убирает слои', () => {
        expect(winterPageCss(false, opts)).toBe('');
        expect(winterPageScript(false)).toContain('remove()');
    });

    it('снег двигается только transform, только при полных эффектах и без reduced motion', () => {
        const css = winterPageCss(true, opts);
        expect(css).toContain('pointer-events:none');
        expect(css).toMatch(/@media \(prefers-reduced-motion:no-preference\)\{html:not\(\.scm-reduce\) #scx-snow/);
        for (const frames of css.match(/@keyframes[^{]+\{[^}]*\{[^}]*\}\}/g) ?? []) expect(frames).toMatch(/\{transform:[^}]+\}\}$/);
    });

    it('без фокуса снег не замирает, а падает ступенями ~12 к/с; покачивание и сияние стоят', () => {
        const css = winterPageCss(true, opts);
        expect(WINTER_AWAY_FPS).toBeGreaterThanOrEqual(10);
        expect(WINTER_AWAY_FPS).toBeLessThanOrEqual(15);
        for (const l of SNOW_LAYERS) {
            const steps = awaySteps(l);
            // Одна ступень на кадр: длительность падения слоя × кадры в секунду
            expect(steps).toBe(Math.round((l.screen / 2) * WINTER_AWAY_FPS));
            expect(css).toContain(`html.scx-away #scx-snow .${l.cls}{animation-timing-function:steps(${steps})!important}`);
        }
        // Падение (слои .l1–.l3) без фокуса на паузу не ставится
        const paused = css.match(/[^{}]*\{animation-play-state:paused!important\}/g) ?? [];
        const awayPaused = paused.flatMap((rule) => rule.replace(/\{.*$/, '').split(',')).map((sel) => sel.trim()).filter((sel) => sel.includes('scx-away'));
        expect(awayPaused.sort()).toEqual(['html.scx-away #scx-snow b', 'html.scx-away #scx-snow::after'].sort());
        // «Не ограничивать кадры»: без фокуса всё идёт как с фокусом
        expect(winterPageCss(true, { ...opts, keepFramesUnfocused: true })).not.toContain('scx-away');
    });

    it('свёрнутое или скрытое окно, заблокированный экран и долгий простой: стоит всё, при любом флажке', () => {
        for (const keepFramesUnfocused of [false, true]) {
            const css = winterPageCss(true, { ...opts, keepFramesUnfocused });
            for (const cls of ['scx-hidden', 'scx-still']) {
                expect(css).toMatch(new RegExp(`html\\.${cls} #scx-snow \\*[^{]*\\{animation-play-state:paused!important\\}`));
                expect(css).toMatch(new RegExp(`html\\.${cls} #scx-snow::after[^{]*\\{animation-play-state:paused!important\\}`));
            }
        }
    });

    it('снег стоит совсем только при блокировке или долгом простое без фокуса', () => {
        expect(winterStill(true, 0, true)).toBe(true);
        expect(winterStill(false, WINTER_IDLE_SECONDS, false)).toBe(true);
        expect(winterStill(false, WINTER_IDLE_SECONDS - 1, false)).toBe(false);
        // Человек смотрит на снег, ничего не трогая: окно в фокусе, снег идёт
        expect(winterStill(false, WINTER_IDLE_SECONDS * 10, true)).toBe(false);
        expect(winterStill(false, Number.NaN, false)).toBe(false);
        document.documentElement.className = '';
        new Function(winterStillScript(true))();
        expect(document.documentElement.classList.contains('scx-still')).toBe(true);
        new Function(winterStillScript(false))();
        expect(document.documentElement.classList.contains('scx-still')).toBe(false);
        new Function(winterAwayScript(true))();
        expect(document.documentElement.classList.contains('scx-away')).toBe(true);
        new Function(winterAwayScript(false))();
        expect(document.documentElement.classList.contains('scx-away')).toBe(false);
    });

    it('«Без эффектов»: ни снега, ни неба, шапка карточки и иней остаются', () => {
        const css = winterPageCss(true, { ...opts, mode: 'off' });
        expect(css).not.toContain('#scx-snow');
        expect(css).toContain('.scw-info::before');
    });

    it('три слоя снега заметно падают: 40, 28 и 18 с за высоту экрана, плитка в полэкрана', () => {
        const css = winterPageCss(true, opts);
        expect(SNOW_LAYERS.map((l) => l.screen)).toEqual([40, 28, 18]);
        expect(css).toContain('@keyframes scx-fall{from{transform:translate3d(0,0,0)}to{transform:translate3d(0,50vh,0)}}');
        for (const l of SNOW_LAYERS) {
            expect(css).toContain(`#scx-snow .${l.cls}{animation:scx-fall ${l.screen / 2}s linear`);
            expect(css).toContain(`background-size:${l.tile}px 50vh`);
        }
        // Режим по умолчанию не ставит scm-reduce: анимация не завязана ни на что, кроме него, системной настройки и фокуса
        expect(css).not.toMatch(/scm-full|sca-fx-full/);
    });

    it('шапка карточки внутри карточки: скругление как у неё, плитка по ширине без растяжения', () => {
        const css = winterPageCss(true, opts);
        expect(css).toMatch(/\.scw-body>\.scw-info::before\{[^}]*inset:0;[^}]*border-radius:var\(--sc2-r4,8px\)/);
        expect(css).toMatch(/\.scw-info::before\{[^}]*repeat-x/);
        expect(css).not.toContain('#scx-cap');
    });

    it('украшения не ловят мышь', () => {
        const css = winterPageCss(true, opts);
        for (const rule of css.match(/(::before|::after|#scx-snow)\{[^}]*content:""[^}]*\}/g) ?? []) expect(rule).toContain('pointer-events:none');
    });

    it('гирлянда мерцает только когда можно, а без анимации всё равно горит', () => {
        const still = winterHeaderCss(false);
        expect(still).not.toContain('animation');
        expect(still).toMatch(/\.title-bar::before,\.title-bar::after\{[^}]*opacity:\.85/);
        // Постоянный ореол зашит в плитку гирлянды
        expect(still).toContain(encodeURIComponent('<circle'));
        const live = winterHeaderCss(true);
        expect(live).toContain('prefers-reduced-motion:no-preference');
        expect(live).toContain('html:not(.scx-away)');
        // Не гаснет до конца
        expect(live).toContain('50%{opacity:.4}');
    });

    it('скрипт страницы собирается и строит три слоя', () => {
        expect(() => new Function(winterPageScript(true))).not.toThrow();
        document.body.innerHTML = '<i id="scx-cap"></i>';
        new Function(winterPageScript(true))();
        expect(document.getElementById('scx-cap')).toBeNull();
        expect(document.querySelectorAll('#scx-snow b > i').length).toBe(3);
        new Function(winterPageScript(true))();
        expect(document.querySelectorAll('#scx-snow').length).toBe(1);
        new Function(winterPageScript(false))();
        expect(document.getElementById('scx-snow')).toBeNull();
    });
});

describe('CSS шапки окна', () => {
    const target = () => {
        let n = 0;
        return { isDestroyed: () => false, insertCSS: vi.fn(async () => 'k' + ++n), removeInsertedCSS: vi.fn<(key: string) => Promise<void>>(async () => undefined) };
    };

    it('ставит, не повторяет, снимает прежний ключ', async () => {
        const header = createWinterHeader();
        const t = target();
        await header.apply(t, 'a');
        await header.apply(t, 'a');
        expect(t.insertCSS).toHaveBeenCalledTimes(1);
        await header.apply(t, '');
        expect(t.removeInsertedCSS).toHaveBeenCalledWith('k1');
        expect(t.insertCSS).toHaveBeenCalledTimes(1);
    });

    it('быстрые смены подряд не теряют ключи', async () => {
        const header = createWinterHeader();
        const t = target();
        void header.apply(t, 'a');
        void header.apply(t, 'b');
        await header.apply(t, '');
        expect(t.removeInsertedCSS.mock.calls.map((c) => c[0])).toEqual(['k1', 'k2']);
    });

    it('после перезагрузки шапки ставит заново', async () => {
        const header = createWinterHeader();
        const t = target();
        await header.apply(t, 'a');
        header.reset();
        await header.apply(t, 'a');
        expect(t.insertCSS).toHaveBeenCalledTimes(2);
    });
});
