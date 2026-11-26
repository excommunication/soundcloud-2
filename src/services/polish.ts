// Полировка 2.14 «Сцена»: музыка в центре, управление уходит на второй план. Слой стилей поверх оформления (aurora.ts),
// подключается последним в appearanceCss и поэтому перебивает прежние правила той же силы.
// Принципы: обложка и название главные; у кнопок-значков нет колец, только мягкая заливка на наведении; одна главная
// кнопка (play) белая; полосы прогресса и громкости тонкие, скруглённые, сыгранное градиентом из цветов обложки,
// ручка появляется на наведении; один вид фокуса с клавиатуры (2 px цвета акцента с отступом).
// Производительность: двигаются только transform/scale/opacity, новых backdrop-filter нет, циклов JS нет;
// «меньше движения» (система и html.scm-reduce) снимает переходы, режим «Без эффектов» гасит их сам (effectsMode.ts)

const W = 'html body #sc-wave';
const BAR = 'html body .playControls';
const C1 = 'var(--sca-c1,#ff5500)';
const C3 = 'var(--sca-c3,#ff9a52)';
const EASE = 'var(--sc2-ease,cubic-bezier(.2,.8,.2,1))';
const RING = 'outline:2px solid var(--sc2-accent,#fff)!important;outline-offset:2px';

/** Кнопки карточки «сейчас играет», которые видны только при наведении на карточку или фокусе внутри неё:
 *  те же действия есть в меню «⋯» и на клавишах (Ctrl+D, Ctrl+M), громкость и ролики есть в нижнем баре */
export const HERO_QUIET = ['[data-act="later"]', '[data-act="dislike"]', '[data-act="more"]', '.scc-open', '.scv'];

function hero(): string[] {
    const resting = HERO_QUIET.map((item) => `${W} .scw-body:not(:hover):not(:focus-within) .scw-meta>${item}`).join(',');
    const shown = HERO_QUIET.map((item) => `${W} .scw-body:is(:hover,:focus-within) .scw-meta>${item}`).join(',');
    return [
        // Обложка: мягкое цветное свечение из палитры обложки под ней, как отражение света на столе
        `${W} .scw-cover{box-shadow:0 30px 60px -26px rgba(0,0,0,.9),0 22px 64px -22px color-mix(in srgb,${C1} 70%,transparent),0 0 0 1px rgba(255,255,255,.08)!important}`,
        // Название спокойнее: полужирное с плотной трекинговой сеткой вместо чёрного начертания; артист в оттенке обложки
        `${W} .scw-track{font-weight:700;letter-spacing:-.025em}`,
        `${W} .scw-artist,${W} .scw-artist a{color:color-mix(in srgb,${C1} 30%,rgba(255,255,255,.82))!important}`,
        `${W} .scw-why,${W} .scw-sub{color:var(--sc2-text-3,rgba(255,255,255,.5))}`,
        // Ряд действий: значки без колец и подложек, заливка только на наведении
        `${W} .scw-meta .scw-like,${W} .scw-meta .scc-open,${W} .scw-meta .scv-btn{background:transparent!important;box-shadow:none!important;border:0!important;color:var(--sc2-text-2,rgba(255,255,255,.72))}`,
        `${W} .scw-meta .scw-like svg{fill:currentColor}`,
        `${W} .scw-meta .scw-like:hover,${W} .scw-meta .scc-open:hover,${W} .scw-meta .scv-btn:hover{background:rgba(255,255,255,.1)!important;color:#fff}`,
        `${W} .scw-meta .scw-like[aria-pressed="true"]{color:var(--sc2-accent,#fff)}`,
        `${W} .scw-meta .scw-like[aria-pressed="true"] svg{fill:var(--sc2-accent,#fff)}`,
        // Капсулы рядом (кроме главной белой): без контура, тихая заливка; включённый «Текст» заливкой цвета обложки, без кольца
        `${W} .scw-meta .scw-chip:not(.scw-chip-main){box-shadow:none!important;background:rgba(255,255,255,.08)!important;color:var(--sc2-text-2,rgba(255,255,255,.72))}`,
        `${W} .scw-meta .scw-chip:not(.scw-chip-main):hover{background:rgba(255,255,255,.14)!important;color:#fff}`,
        `${W} .scw-meta .scw-chip.scw-lyrics-toggle[aria-pressed="true"]{background:color-mix(in srgb,${C1} 34%,rgba(255,255,255,.08))!important;color:#fff;box-shadow:none!important}`,
        // Меньше кнопок в покое: второстепенные действия проявляются, когда курсор на карточке. В покое они не занимают
        // места (раньше прозрачные кнопки держали ~180px, и причина «Похоже на…» обрезалась до пары слов). Кнопки справа
        // (текст, лайк, ⋯, время) стоят на месте: при наведении сужается только причина. Без мыши (сенсор) видны всегда
        `@media (hover:hover){${resting}{display:none!important}}`,
        `${shown}{transition:opacity .2s ease}`,
        `@starting-style{${shown}{opacity:0}}`,
        // Время ровной ширины, тише названия
        `${W} .scw-time{color:var(--sc2-text-3,rgba(255,255,255,.5));font-size:12px;letter-spacing:.01em}`,
        // Главная кнопка: на наведении вокруг неё тонкое кольцо света цвета обложки (тень, без перерисовки размеров)
        `${W} .scw-play:not(:disabled):hover{box-shadow:0 12px 30px -12px rgba(0,0,0,.9),0 0 0 6px color-mix(in srgb,${C1} 28%,transparent)}`,
    ];
}

function upNext(hoverMotion: boolean): string[] {
    // Подъём и приближение обложки только при включённой «Анимации наведения» в оформлении
    const lift = hoverMotion
        ? [
              `${W} .scw-tile[data-track]:hover,${W} .scw-tile[data-fork]:hover{transform:translateY(-2px)}`,
              `${W} .scw-tile[data-track]:active,${W} .scw-tile[data-fork]:active{transform:scale(.97);transition-duration:.12s!important}`,
              `${W} .scw-tile>.scw-art .scw-img,${W} .scw-tile>.scw-art img{transition:transform .5s ${EASE}}`,
              `${W} .scw-tile:hover>.scw-art .scw-img,${W} .scw-tile:hover>.scw-art img{transform:scale(1.06)}`,
          ]
        : [];
    return [
        // Заголовки разделов «Далее», «Первыми сыграют»: мелкая разрядка капителью, как «105 ЛАЙКОВ» справа
        `${W} .scw-up-h{font-size:11px;line-height:16px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--sc2-text-3,rgba(255,255,255,.5));margin:24px 0 8px}`,
        // Плитки: подсветка в цвет играющей обложки; подъём на 2 px, обложка чуть приближается, нажатие проседает
        `${W} .scw-tile[data-track],${W} .scw-tile[data-fork]{transition:transform .35s var(--sc2-spring,${EASE}),background-color .2s ease,box-shadow .2s ease!important}`,
        `${W} .scw-tile[data-track]:hover,${W} .scw-tile[data-fork]:hover{background:color-mix(in srgb,${C1} 14%,rgba(255,255,255,.06))!important}`,
        ...lift,
        `${W} .scw-t1{font-weight:700;letter-spacing:-.01em}`,
    ];
}

function playerBar(): string[] {
    const ghost = [
        `${BAR} .playbackSoundBadge__actions .sc-button`,
        `${BAR} .volume__button`,
        `${BAR} .scd-dock button`,
        `${BAR} .scv[data-kind="bar"] .scv-btn`,
        `${BAR} button.sca-fx`,
        `${BAR} .scc-open`,
    ];
    const hover = ghost.map((item) => item + ':hover').join(',');
    return [
        // Линия прогресса: тонкая скруглённая дорожка, сыгранное градиентом цветов обложки со слабым свечением.
        // На наведении дорожка толще (scale, не высота), появляется ручка. Клики, перемотка и позиция остаются за сайтом
        `${BAR} .playbackTimeline__progressWrapper{position:relative!important;height:24px!important;padding:0!important;box-sizing:border-box;cursor:pointer}`,
        `${BAR} .playbackTimeline__progressBackground,${BAR} .playbackTimeline__progressBar{position:absolute!important;left:0!important;top:50%!important;height:4px!important;margin-top:-2px!important;border:0!important;border-radius:999px!important;transform-origin:50% 50%;transition:scale .18s ${EASE}}`,
        `${BAR} .playbackTimeline__progressBackground{width:100%!important;background:rgba(255,255,255,.16)!important}`,
        `${BAR} .playbackTimeline__progressBar{background:linear-gradient(90deg,${C1},${C3})!important;box-shadow:0 0 12px -2px color-mix(in srgb,${C1} 80%,transparent)}`,
        `${BAR} .playbackTimeline__progressHandle{position:absolute!important;top:50%!important;width:12px!important;height:12px!important;margin:-6px 0 0 -6px!important;border:0!important;border-radius:50%!important;background:#fff!important;` +
            `box-shadow:0 0 0 4px color-mix(in srgb,${C1} 30%,transparent),0 2px 8px rgba(0,0,0,.5)!important;opacity:1!important;scale:0;transition:scale .18s ${EASE}}`,
        `${BAR} .playbackTimeline__progressWrapper:is(:hover,:focus-visible) .playbackTimeline__progressBackground,${BAR} .playbackTimeline__progressWrapper:is(:hover,:focus-visible) .playbackTimeline__progressBar{scale:1 1.5}`,
        `${BAR} .playbackTimeline__progressWrapper:is(:hover,:focus-visible,:active) .playbackTimeline__progressHandle,${BAR} .playbackTimeline.is-scrubbing .playbackTimeline__progressHandle{scale:1}`,
        `${BAR} .playbackTimeline__timePassed{color:rgba(255,255,255,.8)!important}`,
        // Полоса во всю ширину по верхней кромке бара (2.15.5): место в баре освобождается, попасть мышью проще.
        // Предки делаются static, чтобы полоса считалась от самого бара; время остаётся рядом с кнопками, мелко
        `${BAR} :is(.playControls__wrapper,.playControls__elements,.playControls__timeline,.playbackTimeline){position:static!important}`,
        `${BAR} .playControls__inner{position:relative!important}`,
        `html body .playControls .playControls__elements>.playControls__timeline{flex:0 0 auto!important;min-width:0!important;width:auto!important}`,
        `${BAR} .playbackTimeline{display:flex!important;align-items:center;gap:6px;width:auto!important}`,
        `${BAR} .playbackTimeline__progressWrapper{position:absolute!important;left:0!important;right:0!important;top:-8px!important;width:auto!important;height:16px!important;margin:0!important;z-index:6}`,
        `${BAR} .playbackTimeline__progressBackground,${BAR} .playbackTimeline__progressBar{height:3px!important;margin-top:-1.5px!important;border-radius:0 999px 999px 0!important;transform-origin:50% 50%}`,
        `${BAR} .playbackTimeline__progressBackground{border-radius:0!important;background:rgba(255,255,255,.12)!important}`,
        `${BAR} .playbackTimeline__progressWrapper:is(:hover,:focus-visible) .playbackTimeline__progressBackground,${BAR} .playbackTimeline__progressWrapper:is(:hover,:focus-visible) .playbackTimeline__progressBar,${BAR} .playbackTimeline.is-scrubbing :is(.playbackTimeline__progressBackground,.playbackTimeline__progressBar){scale:1 2}`,
        `${BAR} .playbackTimeline__timePassed,${BAR} .playbackTimeline__duration{min-width:0!important;width:auto!important;padding:0!important}`,
        // Кнопки справа: без колец и подложек, на наведении мягкая заливка; включённые цветом акцента на тихом круге
        `${ghost.join(',')}{background:transparent!important;box-shadow:none!important;border:0!important;color:rgba(255,255,255,.68)!important}`,
        `${hover}{background:rgba(255,255,255,.1)!important;color:#fff!important}`,
        `${BAR} .playbackSoundBadge__actions .sc-button-selected{background:color-mix(in srgb,${C1} 18%,transparent)!important;color:var(--sc2-accent,#fff)!important}`,
        `${BAR} button.sca-fx[data-level="full"]{background:color-mix(in srgb,${C1} 18%,transparent)!important;color:#fff!important}`,
        `${BAR} .sca-bar-sep{background:rgba(255,255,255,.1)}`,
        // Бейдж трека: обложка крупнее и скруглённее, название над артистом, артист в оттенке обложки
        `${BAR} .playbackSoundBadge__avatar{border-radius:10px!important}`,
        `${BAR} .playbackSoundBadge__titleLink{font-weight:650!important;letter-spacing:-.01em}`,
        `${BAR} .playbackSoundBadge__lightLink{color:color-mix(in srgb,${C1} 25%,rgba(255,255,255,.6))!important}`,
        // Один фокус с клавиатуры для всего бара
        `${BAR} :is(button,a,[role="slider"],[role="progressbar"],.playbackTimeline__progressWrapper):focus-visible{${RING}}`,
    ];
}

function volume(): string[] {
    // Попап громкости (wave/volume.ts) в карточке и в баре: дорожка тоньше, заливка градиентом обложки снизу вверх,
    // ручка маленькая в покое и вырастает на наведении, перетаскивании и фокусе
    const V = 'html body .scv';
    return [
        `${V} .scv-pop{width:34px;border-radius:999px}`,
        `${V} .scv-track::before{left:8px;width:4px;background:rgba(255,255,255,.16)}`,
        `${V} .scv-fill{background:linear-gradient(to top,${C1},${C3});box-shadow:0 0 10px -2px color-mix(in srgb,${C1} 80%,transparent)}`,
        `${V} .scv-thumb{box-shadow:0 0 0 4px color-mix(in srgb,${C1} 30%,transparent),0 2px 6px rgba(0,0,0,.5);transform:scale(.7);transition:transform .18s ${EASE}}`,
        `${V}.drag .scv-thumb,${V} .scv-track:hover .scv-thumb,${V} .scv-track:focus-visible .scv-thumb{transform:scale(1)}`,
        `${V} .scv-track:focus-visible{outline:none!important}`,
        `${V} .scv-track:focus-visible::before{box-shadow:0 0 0 2px var(--sc2-accent,#fff)}`,
    ];
}

function motionGuards(): string[] {
    // Плитки стоят на месте; у полос и ручек только мгновенная смена вместо перехода (их положение задаёт сайт)
    const lifted = [`${W} .scw-tile[data-track]`, `${W} .scw-tile[data-fork]`, `${W} .scw-tile .scw-img`, `${W} .scw-tile img`];
    const eased = [`${BAR} .playbackTimeline__progressBackground`, `${BAR} .playbackTimeline__progressBar`, `${BAR} .playbackTimeline__progressHandle`, 'html body .scv .scv-thumb'];
    const reduce = (list: string[]): string => list.map((item) => 'html.scm-reduce ' + item.replace(/^html body /, 'body ')).join(',');
    return [
        `${reduce(lifted)}{transition:none!important;transform:none!important}`,
        `${reduce(eased)}{transition:none!important}`,
        `@media (prefers-reduced-motion:reduce){${lifted.join(',')}{transition:none!important;transform:none!important}${eased.join(',')}{transition:none!important}}`,
    ];
}

/** Стили полировки «Сцена» одной строкой: дописываются в конец appearanceCss */
export function polishCss(options: { hoverMotion: boolean } = { hoverMotion: true }): string {
    return [...hero(), ...upNext(options.hoverMotion), ...playerBar(), ...volume(), ...motionGuards()].join('\n');
}
