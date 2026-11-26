// Новогодняя тема: зимнее ночное небо и снег за сайтом, светящаяся гирлянда в шапке, снежная шапка на карточке
// «Моей волны», снежинка у её заголовка, снежок на кромке плеера и лёгкий иней на акцентах. Сама по себе включается
// с 15 декабря по 14 января (местная дата), выбор человека в F1 запоминается.
// Производительность: ни одного кадра JS. Снег это три слоя параллакса с точками из radial-gradient, растрируются один
// раз и едут только transform на компоситоре; гирлянда и сияние меняют только opacity с длинным периодом. Окно без
// фокуса, но на виду: снег идёт дальше редкими кадрами (ступенями по WINTER_AWAY_FPS в секунду, без покачивания),
// сияние и гирлянда стоят. Свёрнутое или скрытое окно, заблокированный экран и долгий простой системы без фокуса: стоит
// всё. При «Меньше анимаций», в режимах «Облегчённо»/«Супер лайт» (класс scm-reduce) и при системном reduced motion
// снег лежит неподвижно. В режиме «Без эффектов» нет ни снега, ни неба

export type WinterPreference = 'auto' | 'on' | 'off';

/** Ключ в настройках: 'auto' (по сезону), 'on' или 'off', если человек выбрал сам */
export const WINTER_KEY = 'winterTheme';

/** Новогодний сезон: с 15 декабря по 14 января включительно, по местной дате */
export function inWinterSeason(date: Date): boolean {
    const month = date.getMonth();
    const day = date.getDate();
    return (month === 11 && day >= 15) || (month === 0 && day <= 14);
}

/** Неизвестное значение из файла настроек читается как «по сезону»; логическое как явный выбор */
export function normalizeWinterPreference(value: unknown): WinterPreference {
    if (value === 'on' || value === true) return 'on';
    if (value === 'off' || value === false) return 'off';
    return 'auto';
}

/** Включена ли тема сейчас */
export function winterEnabled(stored: unknown, date: Date): boolean {
    const preference = normalizeWinterPreference(stored);
    return preference === 'auto' ? inWinterSeason(date) : preference === 'on';
}

/**
 * Что записать, когда человек щёлкнул переключатель. Совпадает с сезоном: 'auto', тогда тема сама уйдёт после
 * праздников и вернётся в декабре. Против сезона: явный выбор, он держится (выключил — не включится и в следующем декабре)
 */
export function winterChoice(enabled: boolean, date: Date): WinterPreference {
    if (enabled === inWinterSeason(date)) return 'auto';
    return enabled ? 'on' : 'off';
}

const svgUrl = (svg: string): string => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

/** Детерминированный «случай»: узор снега и звёзд одинаков от запуска к запуску, тесты стабильны */
function seeded(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 4294967296;
    };
}
const num = (n: number): string => String(Math.round(n * 100) / 100);

// Гирлянда: плитка 140×28, провод двумя провисами, шесть лампочек по кривой. Цвета: фирменный оранжевый, лёд, тёплый
// белый, хвоя, розовый, золото. Точки на кривой: квадратичная Безье M0 3 Q35 17 70 3 при t=¼, ½, ¾
const G_W = 140;
const G_H = 28;
const BULBS = [
    { x: 17.5, y: 8.25, color: '#ff7a3d' },
    { x: 35, y: 10, color: '#8fd3ff' },
    { x: 52.5, y: 8.25, color: '#ffd46b' },
    { x: 87.5, y: 8.25, color: '#6fe3a0' },
    { x: 105, y: 10, color: '#ff86b4' },
    { x: 122.5, y: 8.25, color: '#ffb347' },
] as const;
/** Центр стекла лампочки: под цоколем на проводе */
const bulbY = (b: { y: number }): number => b.y + 4.4;

function garlandTile(): string {
    const defs = BULBS.map(
        (b, i) =>
            `<radialGradient id="c${i}" cx=".42" cy=".38" r=".7"><stop offset="0" stop-color="#fff"/><stop offset=".35" stop-color="${b.color}"/><stop offset="1" stop-color="${b.color}" stop-opacity=".85"/></radialGradient>` +
            `<radialGradient id="h${i}"><stop offset="0" stop-color="${b.color}" stop-opacity=".55"/><stop offset=".45" stop-color="${b.color}" stop-opacity=".18"/><stop offset="1" stop-color="${b.color}" stop-opacity="0"/></radialGradient>`,
    ).join('');
    // Постоянный ореол в самой плитке: лампочки светятся и без анимации, и на паузе
    const halo = BULBS.map((b, i) => `<circle cx="${b.x}" cy="${num(bulbY(b))}" r="10" fill="url(#h${i})"/>`).join('');
    const bulbs = BULBS.map(
        (b, i) =>
            `<rect x="${num(b.x - 1.1)}" y="${num(b.y - 0.3)}" width="2.2" height="2" rx=".5" fill="#9aa3b5"/>` +
            `<ellipse cx="${b.x}" cy="${num(bulbY(b))}" rx="2.5" ry="3.3" fill="url(#c${i})"/>`,
    ).join('');
    return svgUrl(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${G_W}" height="${G_H}" viewBox="0 0 ${G_W} ${G_H}"><defs>${defs}</defs>${halo}` +
            `<path d="M0 3Q35 17 70 3T140 3" fill="none" stroke="#c9d3e6" stroke-opacity=".35" stroke-width=".9"/>${bulbs}</svg>`,
    );
}

/** Яркое свечение части лампочек: слой мерцает opacity поверх постоянного ореола */
function blooms(group: number, groups: number): string {
    return BULBS.filter((_, i) => i % groups === group)
        .map((b) => `radial-gradient(circle 13px at ${b.x}px ${num(bulbY(b))}px,${b.color}e6 0,${b.color}70 30%,${b.color}1f 62%,${b.color}00 100%)`)
        .join(',');
}

/** CSS шапки окна (header.html): гирлянда по пустой части заголовка, за кнопками не рисуется */
export function winterHeaderCss(animated: boolean): string {
    const rows = [
        '.title-bar{align-self:stretch;position:relative;' +
            `background:${garlandTile()} 0 0/${G_W}px ${G_H}px repeat-x;` +
            '-webkit-mask-image:linear-gradient(90deg,transparent,#000 40px,#000 calc(100% - 40px),transparent);mask-image:linear-gradient(90deg,transparent,#000 40px,#000 calc(100% - 40px),transparent)}',
        // Два слоя свечения по очереди через лампочку; без анимации горят ровно и ярко
        `.title-bar::before,.title-bar::after{content:"";position:absolute;left:0;right:0;top:0;height:${G_H}px;pointer-events:none;background-size:${G_W}px ${G_H}px;background-repeat:repeat-x;opacity:.85}`,
        `.title-bar::before{background-image:${blooms(0, 2)}}`,
        `.title-bar::after{background-image:${blooms(1, 2)}}`,
    ];
    if (animated) {
        // Мягкое мерцание: только opacity, периоды 5,8 и 8,3 с не кратны друг другу, поэтому узор не повторяется заметно.
        // Нижняя точка .4: лампочка тускнеет, но не гаснет; меньше трёх вспышек в секунду с большим запасом
        rows.push(
            '@keyframes scx-twinkle{0%,100%{opacity:1}50%{opacity:.4}}',
            '@media (prefers-reduced-motion:no-preference){' +
                'html:not(.scx-away) .title-bar::before{animation:scx-twinkle 5.8s ease-in-out infinite;will-change:opacity}' +
                'html:not(.scx-away) .title-bar::after{animation:scx-twinkle 8.3s ease-in-out -3.1s infinite;will-change:opacity}}',
        );
    }
    return rows.join('\n');
}

// Снег: три слоя параллакса. Плитка шириной W и высотой полэкрана, точки в процентах плитки, радиус в пикселях,
// поэтому снежинки не тянутся при любом окне. Слой выше окна на одну плитку и уезжает вниз ровно на неё: шов не виден.
// Скорость задана «за высоту экрана»: дальний 40 с, средний 28 с, ближний 18 с
type SnowLayer = { cls: string; tile: number; count: number; r: [number, number]; a: [number, number]; screen: number; sway: number; swayS: number; seed: number };
export const SNOW_LAYERS: readonly SnowLayer[] = [
    { cls: 'l1', tile: 150, count: 9, r: [1, 1.6], a: [0.4, 0.65], screen: 40, sway: 10, swayS: 11, seed: 7 },
    { cls: 'l2', tile: 240, count: 7, r: [1.8, 2.6], a: [0.55, 0.8], screen: 28, sway: 18, swayS: 8.5, seed: 19 },
    { cls: 'l3', tile: 380, count: 5, r: [2.8, 4], a: [0.65, 0.9], screen: 18, sway: 28, swayS: 6.5, seed: 41 },
];

function flakes(layer: SnowLayer): string {
    const rand = seeded(layer.seed);
    const out: string[] = [];
    for (let i = 0; i < layer.count; i++) {
        // Ровная сетка по высоте со сдвигом: точки не слипаются в кучу и не оставляют пустых полос
        const x = 5 + rand() * 90;
        const y = ((i + 0.2 + rand() * 0.6) / layer.count) * 92 + 4;
        const r = layer.r[0] + rand() * (layer.r[1] - layer.r[0]);
        const a = layer.a[0] + rand() * (layer.a[1] - layer.a[0]);
        // Мягкий край без резкой границы: размытая точка, ядро чуть плотнее
        out.push(`radial-gradient(circle ${num(r * 2)}px at ${num(x)}% ${num(y)}%,rgba(255,255,255,${num(a)}) 0,rgba(240,247,255,${num(a * 0.5)}) 38%,rgba(240,247,255,0) 100%)`);
    }
    return out.join(',');
}

// Звёзды ночного неба: редкие неподвижные точки сверху, к середине окна гаснут
function stars(): string {
    const rand = seeded(97);
    const out: string[] = [];
    for (let i = 0; i < 12; i++) {
        const r = 0.6 + rand() * 0.8;
        out.push(`radial-gradient(circle ${num(r * 1.6)}px at ${num(3 + rand() * 94)}% ${num(3 + rand() * 94)}%,rgba(230,240,255,${num(0.35 + rand() * 0.4)}) 0,rgba(230,240,255,0) 100%)`);
    }
    return out.join(',');
}

// Снежная шапка на карточке «Моей волны»: плитка 180×14 повторяется по ширине (не растягивается), сугроб плотный сверху,
// снизу мягкие бугорки и пара коротких подтёков. Лежит внутри карточки у верхнего края: карточка режет её своим
// скруглением, поэтому шапка повторяет углы, идёт вместе с наклоном карточки и не вылезает за край
const CAP_W = 180;
const CAP_H = 14;
const CAP = svgUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CAP_W}" height="${CAP_H}" viewBox="0 0 ${CAP_W} ${CAP_H}">` +
        '<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".55" stop-color="#f1f7ff"/><stop offset="1" stop-color="#cfe1fb"/></linearGradient></defs>' +
        '<path fill="#6f9fe0" fill-opacity=".28" transform="translate(0 1.3)" d="M0 0H180V6C170 7.5 162 6 152 7C146 7.6 144 11.5 140 11.5C136 11.5 135 8 128 7.6C114 7 104 8.6 92 7.4C80 6.4 72 8.4 62 7.8C56 7.5 54 10 50 10C46 10 45 7.3 38 7C26 6.6 14 8.2 0 6Z"/>' +
        '<path fill="url(#g)" d="M0 0H180V6C170 7.5 162 6 152 7C146 7.6 144 11.5 140 11.5C136 11.5 135 8 128 7.6C114 7 104 8.6 92 7.4C80 6.4 72 8.4 62 7.8C56 7.5 54 10 50 10C46 10 45 7.3 38 7C26 6.6 14 8.2 0 6Z"/>' +
        '<path d="M0 1.2H180" stroke="#fff" stroke-opacity=".9" stroke-width="1.2"/></svg>',
);

// Сугроб на верхней кромке плеера: невысокие бугорки, плитка 120×6
const RIDGE = svgUrl(
    '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="6" viewBox="0 0 120 6">' +
        '<path fill="#eef5ff" fill-opacity=".85" d="M0 6V4.2C8 2.6 14 3.8 22 3C30 2.2 36 1.4 46 2.6C56 3.8 62 2 72 1.8C82 1.6 88 3.6 98 3.2C106 2.9 112 2.4 120 4.2V6Z"/></svg>',
);

// Снежинка у заголовка «Моя волна»
const FLAKE = svgUrl(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-12 -12 24 24" fill="none" stroke="#dcebff" stroke-width="1.6" stroke-linecap="round">' +
        '<g id="a"><path d="M0-10V10M0-6.5l-3-3M0-6.5l3-3M0 6.5l-3 3M0 6.5l3 3"/></g><use href="#a" transform="rotate(60)"/><use href="#a" transform="rotate(120)"/></svg>',
);

/** Кадров в секунду у снега, пока окно без фокуса: глазу видно, что идёт, а компоситор почти не работает */
export const WINTER_AWAY_FPS = 12;
/** Простой системы без фокуса окна, после которого снег встаёт совсем, с */
export const WINTER_IDLE_SECONDS = 300;

/** Шаги падения слоя без фокуса: одна ступень на кадр при WINTER_AWAY_FPS */
export function awaySteps(layer: Pick<SnowLayer, 'screen'>): number {
    return Math.max(1, Math.round((layer.screen / 2) * WINTER_AWAY_FPS));
}

export type WinterPageOptions = {
    /** Режим эффектов: в «Без эффектов» снега и ночного неба нет */
    mode: string;
    /** «Не ограничивать кадры, если окно не выбрано»: тогда снег и без фокуса идёт полными кадрами и качается */
    keepFramesUnfocused: boolean;
};

/** CSS страницы SoundCloud; пустая строка, если тема выключена */
export function winterPageCss(on: boolean, options: WinterPageOptions): string {
    if (!on) return '';
    const rows: string[] = [];
    if (options.mode !== 'off') {
        const layers = SNOW_LAYERS.map(
            (l) =>
                `#scx-snow .${l.cls}{left:-${l.sway + 8}px;right:-${l.sway + 8}px;top:-50vh;height:150vh;background-image:${flakes(l)};background-size:${l.tile}px 50vh}`,
        );
        const frames = SNOW_LAYERS.map((l) => `@keyframes scx-sway-${l.cls}{from{transform:translate3d(-${l.sway}px,0,0)}to{transform:translate3d(${l.sway}px,0,0)}}`);
        // Плитка в полэкрана проходится за половину времени «за экран»
        const motion = SNOW_LAYERS.map(
            (l, i) =>
                `html:not(.scm-reduce) #scx-snow .${l.cls}{animation:scx-fall ${l.screen / 2}s linear ${-i * 3.7}s infinite;will-change:transform}` +
                `html:not(.scm-reduce) #scx-snow .s${i + 1}{animation:scx-sway-${l.cls} ${l.swayS}s ease-in-out ${-i * 2.3}s infinite alternate;will-change:transform}`,
        ).join('');
        rows.push(
            // За сайтом, над переливами (тот же z-index, но позже в документе): под стеклом снег мягко размыт и не лезет на текст
            '#scx-snow{position:fixed;inset:0;z-index:-1;pointer-events:none;overflow:hidden;contain:strict}',
            '#scx-snow i,#scx-snow b{position:absolute;display:block}',
            '#scx-snow b{inset:0;z-index:1}',
            // Зимняя ночь поверх переливов обложки, а не вместо них: синева сверху, полоска северного сияния, звёзды.
            // Полупрозрачно, цвета обложки просвечивают; рисуется один раз
            '#scx-snow::before,#scx-snow::after{content:"";position:absolute;inset:0;pointer-events:none}',
            '#scx-snow::before{background:linear-gradient(180deg,rgba(9,20,52,.5) 0%,rgba(8,16,40,.26) 38%,rgba(6,10,24,.12) 65%,rgba(4,7,16,.32) 100%)}',
            '#scx-snow::after{background:radial-gradient(60% 22% at 68% 9%,rgba(90,230,180,.16),rgba(90,230,180,0) 100%),radial-gradient(45% 18% at 30% 5%,rgba(120,140,255,.14),rgba(120,140,255,0) 100%),radial-gradient(35% 14% at 88% 16%,rgba(170,120,255,.1),rgba(170,120,255,0) 100%)}',
            `#scx-snow .st{inset:0 0 35% 0;background-image:${stars()};background-size:260px 260px;-webkit-mask-image:linear-gradient(#000,transparent);mask-image:linear-gradient(#000,transparent)}`,
            ...layers,
            '@keyframes scx-fall{from{transform:translate3d(0,0,0)}to{transform:translate3d(0,50vh,0)}}',
            ...frames,
            '@keyframes scx-aurora{from{opacity:.55}to{opacity:1}}',
            // Движение только при «Полных эффектах» (scm-reduce ставят и флажок «Меньше анимаций», и лёгкие режимы)
            // и без системного reduced motion; иначе снег лежит неподвижной россыпью, сияние ровное
            '@media (prefers-reduced-motion:no-preference){' + motion + 'html:not(.scm-reduce) #scx-snow::after{animation:scx-aurora 14s ease-in-out infinite alternate}}',
            // Скрытая или свёрнутая страница, заблокированный экран, долгий простой: всё на паузе
            'html.scx-hidden #scx-snow,html.scx-hidden #scx-snow *,html.scx-still #scx-snow,html.scx-still #scx-snow *{animation-play-state:paused!important}',
            'html.scx-hidden #scx-snow::after,html.scx-still #scx-snow::after{animation-play-state:paused!important}',
        );
        if (!options.keepFramesUnfocused) {
            rows.push(
                // Окно без фокуса, но на виду: падение не замирает, а идёт ступенями (steps не сбивает позицию, отстаёт
                // максимум на одну ступень), компоситор меняет картинку ~12 раз в секунду. Покачивание и сияние стоят
                SNOW_LAYERS.map((l) => `html.scx-away #scx-snow .${l.cls}{animation-timing-function:steps(${awaySteps(l)})!important}`).join(''),
                'html.scx-away #scx-snow b,html.scx-away #scx-snow::after{animation-play-state:paused!important}',
            );
        }
    }
    const cap = 'html body #sc-wave .scw-body>.scw-info::before';
    rows.push(
        // Шапка на карточке: псевдоэлемент внутри карточки (её содержимое пересобирается, псевдоэлемент нет). Он во всю
        // карточку со скруглением как у неё, картинка только сверху: углы повторяют радиус, ширина любая
        `${cap}{content:"";position:absolute;inset:0;z-index:3;pointer-events:none;border-radius:var(--sc2-r4,8px);` +
            `background:${CAP} 0 0/${CAP_W}px ${CAP_H}px repeat-x}`,
        // Иней на акцентах: ледяная кромка у стекла и холодный отблеск у заголовка, оранжевый остаётся
        'html:root{--sc2-line:rgba(205,228,255,.13)}',
        'html:root body #sc-wave .scw-body:not(.sc2-glass-on){box-shadow:var(--sc2-shadow),inset 0 0 0 1px rgba(205,228,255,.14),inset 0 1px 0 rgba(230,243,255,.3)}',
        'html:root body #sc-wave .scw-title{text-shadow:0 0 22px rgba(170,210,255,.32)}',
        // Снежинка после «Моя волна»: в строке, место занимает сама, на текст не ложится
        `html:root body #sc-wave .scw-title::after{content:"";display:inline-block;width:.56em;height:.56em;margin-left:.32em;vertical-align:.32em;pointer-events:none;background:${FLAKE} center/contain no-repeat;filter:drop-shadow(0 0 6px rgba(170,210,255,.6))}`,
        // Снежок на верхней кромке плеера: бугорки над краем, к бокам сходят на нет
        'html:root .playControls__inner::after{content:"";position:absolute;left:0;right:0;top:-5px;height:6px;pointer-events:none;' +
            `background:${RIDGE} 0 0/120px 6px repeat-x;` +
            '-webkit-mask-image:linear-gradient(90deg,transparent,#000 12%,#000 88%,transparent);mask-image:linear-gradient(90deg,transparent,#000 12%,#000 88%,transparent)}',
    );
    return rows.join('\n');
}

/** Скрипт страницы: ставит или убирает слой снега. Один раз, без таймеров и наблюдателей */
export function winterPageScript(on: boolean): string {
    return `(() => {
    const root = document.documentElement;
    // scx-cap: шапка карточки прошлых версий отдельным элементом, теперь она псевдоэлемент карточки
    document.getElementById('scx-cap')?.remove();
    if (!${on}) {
        document.getElementById('scx-snow')?.remove();
        root.classList.remove('scx-winter');
        return;
    }
    if (!document.body) return;
    root.classList.add('scx-winter');
    const snow = document.getElementById('scx-snow');
    if (!snow || !snow.querySelector('.l3')) {
        snow?.remove();
        const box = document.createElement('div');
        box.id = 'scx-snow';
        box.setAttribute('aria-hidden', 'true');
        const sky = document.createElement('i');
        sky.className = 'st';
        box.append(sky);
        ${JSON.stringify(SNOW_LAYERS.map((l) => l.cls))}.forEach((cls, n) => {
            const sway = document.createElement('b');
            sway.className = 's' + (n + 1);
            const layer = document.createElement('i');
            layer.className = cls;
            sway.append(layer);
            box.append(sway);
        });
        document.body.append(box);
    }
    if (!window.__scxVisibility) {
        window.__scxVisibility = true;
        document.addEventListener('visibilitychange', () => root.classList.toggle('scx-hidden', document.hidden));
    }
})()`;
}

/** Класс «окно без фокуса» для страницы и шапки: снег идёт редкими кадрами, мерцание гирлянды на паузе */
export function winterAwayScript(away: boolean): string {
    return `document.documentElement.classList.toggle('scx-away', ${away === true})`;
}

/** Снегу стоять совсем: экран заблокирован или система долго простаивает, пока окно без фокуса */
export function winterStill(locked: boolean, idleSeconds: number, focused: boolean): boolean {
    if (locked === true) return true;
    return focused !== true && Number.isFinite(idleSeconds) && idleSeconds >= WINTER_IDLE_SECONDS;
}

/** Класс «снег стоит» для страницы */
export function winterStillScript(still: boolean): string {
    return `document.documentElement.classList.toggle('scx-still', ${still === true})`;
}

/** То, что нужно от webContents шапки; без импорта electron, чтобы проверялось в тестах */
export type CssTarget = {
    isDestroyed(): boolean;
    insertCSS(css: string): Promise<string>;
    removeInsertedCSS(key: string): Promise<void>;
};

export type WinterHeader = {
    /** Ставит CSS гирлянды (пустая строка снимает); прошлая вставка убирается, повтор того же CSS ничего не делает */
    apply(target: CssTarget | null | undefined, css: string): Promise<void>;
    /** Шапка загрузилась заново: вставленный раньше CSS пропал вместе со страницей */
    reset(): void;
};

export function createWinterHeader(): WinterHeader {
    let key: string | null = null;
    let applied = '';
    let owner: CssTarget | null = null;
    // Вызовы идут по очереди: иначе две быстрые смены вставили бы CSS дважды, и один ключ потерялся бы
    let queue: Promise<void> = Promise.resolve();
    const run = async (target: CssTarget | null | undefined, css: string): Promise<void> => {
        if (!target || target.isDestroyed()) return;
        if (owner !== target) {
            key = null;
            applied = '';
            owner = target;
        }
        if (css === applied) return;
        const previous = key;
        key = null;
        applied = css;
        if (previous) await target.removeInsertedCSS(previous).catch(() => undefined);
        if (css) key = await target.insertCSS(css);
    };
    return {
        apply(target, css) {
            queue = queue.then(() => run(target, css)).catch((error: unknown) => console.error('Гирлянда в шапке не встала:', error));
            return queue;
        },
        reset() {
            key = null;
            applied = '';
        },
    };
}
