// Узкое окно (минимум 860×600): страница сайта не должна давать горизонтальную прокрутку. В окне до 900 px правая колонка («лайки»)
// скрыта, на 901..1100 px сужена до 220 px; нижний плеер сжимается, а не обрезается. Правила только в медиа-запросах, на широком окне ничего не меняется
// 2.12.3: кнопки справа в плеере больше не прячутся по порогам ширины (так кнопка пропадала насовсем). Их ведёт auroraPage (fitBar):
// если ряд не помещается, лишние кнопки получают класс sca-ovf и появляются в меню «…» (.sca-more). Здесь только стили этого механизма:
// скрытие, кнопка «…», меню и сжатие бейджа трека. Лайк и правая группа (.sca-fx, режим роликов, «С другом») не скрываются ни при какой ширине.
// Панель лайков на 901..1100 px переносит строку счётчиков, а не обрезает её
const BAR = 'html body .playControls';
const ACTIONS = `${BAR} .playbackSoundBadge__actions`;
export const NARROW_CSS = [
    // Бейдж трека сжимается до нуля, а название обрезается многоточием: ряд кнопок больше не выталкивается за край окна
    `${BAR} .playControls__soundBadge{min-width:0!important}`,
    `${BAR} .playControls__elements{min-width:0;max-width:100%}`,
    // Ушедшая в «…» кнопка скрыта, но остаётся в странице: пункт меню нажимает именно её
    `${ACTIONS} .sca-ovf.sca-ovf{display:none!important}`,
    `${ACTIONS}>button.sca-more{all:unset;box-sizing:border-box;flex:none;order:99;width:32px;height:32px;border-radius:999px;display:none;place-items:center;cursor:pointer;color:rgba(255,255,255,.75);` +
        'background:rgba(255,255,255,.06);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08);transition:transform .16s ease,background-color .16s ease,color .16s ease}',
    `${ACTIONS}>button.sca-more.on{display:inline-grid}`,
    `${ACTIONS}>button.sca-more svg{width:16px;height:16px}`,
    `${ACTIONS}>button.sca-more:hover,${ACTIONS}>button.sca-more[aria-expanded="true"]{background:rgba(255,255,255,.14);color:#fff}`,
    `${ACTIONS}>button.sca-more:active{transform:scale(.9)}`,
    `${ACTIONS}>button.sca-more:focus-visible{outline:2px solid var(--sc2-accent,#fff);outline-offset:2px}`,
    // Кнопка эффектов всегда на месте
    `${BAR} button.sca-fx{display:inline-grid!important;flex:none!important}`,
    // Нижний бар по смыслу, слева направо: транспорт и громкость · прогресс · название трека с действиями над ним · разделитель ·
    // правая группа «не про текущий трек»: «С другом», режим роликов, эффекты. Блок громкости растворяется (contents), чтобы ролики и джем,
    // что стоят рядом с громкостью в DOM, встали в правую группу через order. Правая группа всегда на месте и никогда не уходит в «…»
    `html.scv-bar-on body .playControls .playControls__volume{display:contents!important}`,
    `${BAR} .scv[data-kind="bar"]{order:1}`,
    `${BAR} .playControls__elements>.playControls__timeline{order:2}`,
    `${BAR} .playControls__elements>.playControls__soundBadge{order:3}`,
    `${BAR} .sca-bar-sep{order:4}`,
    `${BAR} .scj-chip.bar{order:5}`,
    `${BAR} .scc-open{order:6}`,
    `${BAR} button.sca-fx{order:7}`,
    // Одинаковые круглые кнопки 32 px с одинаковыми отступами
    `${BAR} .scj-chip.bar,${BAR} .scc-open,${BAR} button.sca-fx{display:inline-grid!important;flex:none!important;width:32px!important;height:32px!important;margin:0 3px!important;align-self:center}`,
    '.sca-more-pop{position:fixed;z-index:2147483601;display:none;flex-direction:column;gap:2px;min-width:190px;max-width:calc(100vw - 16px);padding:6px;border-radius:14px;font:600 13px/1.2 system-ui,-apple-system,sans-serif;color:#fff;' +
        'background:rgba(14,15,22,.94);backdrop-filter:blur(20px);box-shadow:0 10px 30px -10px rgba(0,0,0,.9),inset 0 0 0 1px rgba(255,255,255,.1)}',
    '.sca-more-pop.on{display:flex}',
    '.sca-more-item{all:unset;box-sizing:border-box;display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:10px;cursor:pointer;white-space:nowrap;color:rgba(255,255,255,.88)}',
    '.sca-more-item svg{width:16px;height:16px;flex:none;fill:currentColor}',
    '.sca-more-item:hover,.sca-more-item:focus-visible{background:rgba(255,255,255,.12);color:#fff}',
    '.sca-more-item:focus-visible{outline:2px solid var(--sc2-accent,#fff);outline-offset:-2px}',
    '@media (max-width:1100px){',
    `${BAR} .playbackSoundBadge__actions>*{margin-left:0!important}`,
    '}',
    '@media (max-width:1100px) and (min-width:901px){',
    '.l-sidebar-right{width:220px!important;min-width:0!important;flex:0 0 220px!important}',
    '.l-sidebar-right .sidebarModule{overflow-x:clip}',
    '.l-sidebar-right .soundStats,.l-sidebar-right .sc-ministats-group{flex-wrap:wrap}',
    '}',
    '@media (max-width:1100px){',
    'html body .playControls .playControls__timeline{min-width:96px!important}',
    '}',
    '@media (max-width:900px){',
    'html,body{overflow-x:clip}',
    '.l-sidebar-right{display:none!important}',
    '.l-fluid-fixed,.l-fixed-fluid,.l-container,.l-main,.l-content,.l-front-content,.l-listen-wrapper{min-width:0!important;padding-right:0!important;margin-right:0!important;max-width:100%!important}',
    '.playControls__inner{min-width:0;max-width:100%}',
    '.playbackSoundBadge{min-width:0}',
    '.playControls__volume,.playControls__repeat{display:none!important}',
    '.header__navMenu{flex-wrap:nowrap;min-width:0}',
    '.header__search,.header__searchWrapper{min-width:0;flex:1 1 120px}',
    '}',
].join('\n');
