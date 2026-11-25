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
    // 2.12.4: резерв места под колонку «Лайки». Родитель колонки (.l-sidebar-right) становится flex-рядом: контент занимает всё остальное,
    // колонка стоит справа шириной 240 px и целиком в окне. Отступы и поля справа у контейнеров раскладки, что держали под неё ~340 px, сброшены.
    // Классы предков сайта выбраны по :has(.l-sidebar-right), а не по памяти о вёрстке: сбрасывается только то, что реально содержит колонку
    '@media (max-width:1100px) and (min-width:901px){',
    'html,body{overflow-x:clip}',
    ':is(.l-fluid-fixed,.l-fixed-fluid,.l-container,.l-main,.l-content,.l-front-content,.l-listen-wrapper):has(.l-sidebar-right){padding-right:0!important;margin-right:0!important;max-width:100%!important;min-width:0!important}',
    ':has(>.l-sidebar-right){display:flex!important;flex-direction:row;align-items:flex-start;gap:20px;padding-right:16px!important;margin-right:0!important;box-sizing:border-box}',
    ':has(>.l-sidebar-right)>:not(.l-sidebar-right){flex:1 1 0;min-width:0;width:auto!important;max-width:none!important;float:none!important;margin-right:0!important;padding-right:0!important}',
    '.l-sidebar-right{position:static!important;float:none!important;width:240px!important;min-width:0!important;max-width:240px!important;flex:0 0 240px!important;margin:0!important;padding:0!important;box-sizing:border-box}',
    '.l-sidebar-right .sidebarModule{overflow-x:clip;box-sizing:border-box;max-width:100%}',
    // Длинные названия в колонке обрезаются многоточием, а не уходят за край: счётчики ниже переносятся
    '.l-sidebar-right :is(.soundBadge__content,.soundBadge__titleContainer,.soundBadge__title){min-width:0;max-width:100%;overflow:hidden}',
    '.l-sidebar-right :is(.soundBadge__title,.soundBadge__title a,.soundTitle__title){display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.l-sidebar-right .sc-ministats{flex-wrap:wrap;max-width:100%}',
    '.l-sidebar-right .soundStats,.l-sidebar-right .sc-ministats-group{flex-wrap:wrap}',
    '}',
    // 2.13.4: «Далее» в окне до 1100 px это компактные строки (обложка 48 px слева, три строки текста справа), а не высокие карточки Aurora
    // с обложкой на всю ширину колонки: те уезжали под нижний плеер, и волну с очередью нельзя было увидеть вместе. Префикс html body #sc-wave
    // выигрывает у правил темы и волны независимо от порядка вставки стилей
    '@media (max-width:1100px){',
    'html body #sc-wave .scw-tiles:not(.scw-shelf)>.scw-tile{display:grid;grid-template-columns:48px minmax(0,1fr);column-gap:10px;align-content:center;height:auto;padding:8px}',
    'html body #sc-wave .scw-tiles:not(.scw-shelf)>.scw-tile>.scw-art{grid-row:1/4;width:48px;margin:0;align-self:center}',
    'html body #sc-wave .scw-tiles:not(.scw-shelf)>.scw-tile>:is(.scw-t1,.scw-t2,.scw-t3){grid-column:2;margin:0}',
    'html body #sc-wave .scw-tiles:not(.scw-shelf){grid-auto-rows:auto;gap:10px}',
    'html body #sc-wave .scw-tiles:not(.scw-shelf)>.scw-tile:hover{transform:none}',
    '}',
    // Узкое и невысокое окно (860x600..900x720): «Далее» одним рядом из трёх плиток, чтобы плашка и очередь были видны над плеером без прокрутки
    '@media (max-height:760px) and (max-width:900px){',
    'html body #sc-wave .scw-tiles:not(.scw-shelf)>.scw-tile:nth-child(n+4){display:none}',
    'html body #sc-wave .scw-up-h{margin-top:16px}',
    '}',
    '@media (max-width:1100px){',
    // Ряд жанров «Все / Весёлое / …» не переносится сиротой, а листается по горизонтали без полосы
    '#sc-wave .scw-moods{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;max-width:100%}',
    '#sc-wave .scw-moods::-webkit-scrollbar{display:none}',
    '#sc-wave .scw-moods .scw-chip{flex:none}',
    '}',
    '@media (max-width:1100px){',
    'html body .playControls .playControls__timeline{min-width:150px!important;flex:1 1 150px}',
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
