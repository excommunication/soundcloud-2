// Узкое окно (минимум 860×600): страница сайта не должна давать горизонтальную прокрутку. В окне до 900 px правая колонка («лайки»)
// скрыта, на 901..1100 px сужена до 220 px; нижний плеер сжимается, а не обрезается. Правила только в медиа-запросах, на широком окне ничего не меняется
export const NARROW_CSS = [
    '@media (max-width:1100px) and (min-width:901px){',
    '.l-sidebar-right{width:220px!important;min-width:0!important;flex:0 0 220px!important}',
    '}',
    '@media (max-width:1100px){',
    'html body .playControls .playControls__timeline{min-width:96px!important}',
    'html body .playControls .playControls__soundBadge{min-width:0!important;flex-basis:200px!important}',
    '}',
    '@media (max-width:900px){',
    'html,body{overflow-x:clip}',
    '.l-sidebar-right{display:none!important}',
    '.l-fluid-fixed,.l-fixed-fluid,.l-container,.l-main,.l-content,.l-front-content,.l-listen-wrapper{min-width:0!important;padding-right:0!important;margin-right:0!important;max-width:100%!important}',
    '.playControls__inner{min-width:0;max-width:100%}',
    '.playControls__soundBadge,.playbackSoundBadge{min-width:0;max-width:240px}',
    '.playControls__volume,.playControls__repeat{display:none!important}',
    '.header__navMenu{flex-wrap:nowrap;min-width:0}',
    '.header__search,.header__searchWrapper{min-width:0;flex:1 1 120px}',
    '}',
].join('\n');
