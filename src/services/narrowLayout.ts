// Узкое окно (минимум 860×600): страница сайта не должна давать горизонтальную прокрутку, правая колонка («лайки»)
// и нижний плеер сжимаются, а не обрезаются; правая колонка («лайки») остаётся, но уже. Правила только в медиа-запросах, на широком окне ничего не меняется
export const NARROW_CSS = [
    '@media (max-width:900px){',
    'html,body{overflow-x:clip}',
    '.l-sidebar-right{width:250px!important;min-width:0!important;flex:0 0 250px!important}',
    '.playControls__inner{min-width:0;max-width:100%}',
    '.playControls__soundBadge,.playbackSoundBadge{min-width:0;max-width:240px}',
    '.playControls__volume,.playControls__repeat{display:none!important}',
    '.header__navMenu{flex-wrap:nowrap;min-width:0}',
    '.header__search,.header__searchWrapper{min-width:0;flex:1 1 120px}',
    '}',
].join('\n');
