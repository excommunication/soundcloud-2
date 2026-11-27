// Меню по правому клику на странице и в iframe того же сайта: цель под курсором, пункты, открытие, выбор пункта;
// здесь же волна от трека, артиста или плейлиста, которую запускает меню. Раздел страницы волны: installMenu уходит
// на страницу текстом вместе с волной (pageHelpers в wave.ts) и зовёт помощников по голому имени, поэтому импорт
// через пространство имён и разбор в константы. Открытое меню и слушатели iframe раздел держит сам; отметки, очередь
// и старт подборки приходят от ядра объектом core
import * as waveLinks from '../waveLinks';
import * as wavePicks from '../wavePicks';
import type { Excluded, MarkKind, MenuTarget, Seed, WaveCandidate, WaveLinkKind, WaveState, WaveTexts, WaveTrack } from '../waveTypes';
import type { SitePlayer } from '../wave';
import type { DownloadSection } from './download';

const { canonicalUrl, classifyLink, classifyTag } = waveLinks;
const { shuffleInPlace, trackArtist } = wavePicks;
/** Что запускает меню: волна от ссылки или все треки артиста */
type SeedLinkKind = WaveLinkKind | 'artistAll';

export interface MenuCore {
    texts: WaveTexts;
    state(): WaveState;
    disposed(): boolean;
    player(): SitePlayer | null;
    /** API сайта найден: без него меню не открывается */
    api(): boolean;
    /** Номер последнего запуска подборки: запуск, начатый позже, отменяет прежний */
    seedRequest(): number;
    nextSeedRequest(): number;
    /** Треки, известные волне: отданные сайту и подбор до запуска */
    known: Map<number, WaveCandidate>;
    preview(): WaveCandidate[];
    /** Трек разделов по номеру: подборки, радар, «Моя музыка» */
    sectionTrack(id: number): WaveTrack | undefined;
    currentCandidate(): WaveCandidate | null;
    fromTrack(track: WaveTrack): MenuTarget;
    /** Отметки: «Не нравится», скрытые артисты, «Не сейчас», «Больше такого» */
    excludedTracks: Map<number, Excluded>;
    excludedArtists: Map<number, Excluded>;
    laterTracks: Map<number, Excluded>;
    laterArtists: Map<number, Excluded>;
    moreTracks: Map<number, Excluded>;
    marked(map: Map<number, Excluded>, id: number): boolean;
    familyHidden(target: MenuTarget): boolean;
    setExcluded(kind: MarkKind, target: MenuTarget, excluded: boolean): Promise<void>;
    setFamily(target: MenuTarget, hide: boolean): Promise<void>;
    /** Трек в очередь сайта: следующим или в конец */
    addTrack(track: WaveTrack, next: boolean): void;
    /** Набор треков из меню: место трека в нём и добавить или убрать */
    pickedIndex(target: MenuTarget): number;
    pick(target: MenuTarget, add: boolean): Promise<void>;
    openVersions(target: MenuTarget): Promise<void>;
    trackOf(target: MenuTarget): Promise<WaveTrack | null>;
    artistOf(target: MenuTarget): Promise<{ id: number; username: string; url: string } | null>;
    artistOwnTracks(id: number): Promise<WaveTrack[]>;
    /** «Все треки артиста»: имя исполнителя, его аккаунт (0, если не найден) и каталог по порядку игры */
    artistCatalog(target: MenuTarget): Promise<{ title: string; artist: number; tracks: WaveTrack[] } | null>;
    playlistTracks(body: unknown): Promise<WaveTrack[]>;
    resolveUrl(url: string): Promise<unknown>;
    beginSeed(request: number, loaded: { seed: Seed; first: WaveTrack | null }): Promise<void>;
    ensureProfile(): Promise<unknown>;
    ensureExclusions(): Promise<void>;
    ensureStyle(): void;
    showToast(text: string): void;
    /** Прокрутка страницы или iframe: меню и подсказка закрываются */
    onScroll(): void;
    el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K];
    /** Закреплённое на главной (В5): есть ли цель в быстром ряду, закрепить или открепить */
    pinned(target: MenuTarget): boolean;
    pin(target: MenuTarget, add: boolean): Promise<void>;
    /** Обычная волна с этим жанром, сразу играет */
    playGenre(genre: string): void;
    /** Пункт текста песни у трека (2.8.5): подпись пункта или null, если текста у клиента нет */
    lyricsLabel(target: MenuTarget): string | null;
    /** Показать текст трека: у играющего включает текст на карточке, у другого открывает окно с текстом */
    showLyrics(target: MenuTarget): void;
    /** Название жанра карточки полки под узлом; пусто, если это не карточка жанра */
    cardGenre(node: Element): string;
    /** Скачивание трека: раздел wave/download.ts */
    download: DownloadSection;
    /** Трек, который сейчас играет на сайте (из волны или нет); null — ничего не играет */
    playingTrack(): WaveTrack | null;
    /** «К дропу» у играющего трека: true, если перемотал */
    drop(): boolean;
}
/** Пункт меню от места, откуда меню открыто (кнопки бара, ушедшие в «⋯»): свой значок и действие */
export interface TrackMenuExtra {
    id: string;
    label: string;
    /** Разметка SVG значка; нет — пункт без значка */
    icon?: string;
    run(): void;
}
/** Откуда и про что открыть меню трека: кнопка «⋯», правый клик, режим роликов */
export interface TrackMenuRequest {
    /** Узел трека (строка, плитка, бейдж, элемент с data-sc-track); нет — играющий трек */
    node?: Element | null;
    /** Кнопка «⋯»: меню встаёт у неё, фокус возвращается к ней, aria-expanded следит за меню, повторное нажатие закрывает */
    anchor?: HTMLElement | null;
    /** Точка (правый клик), если нет кнопки */
    x?: number;
    y?: number;
    /** Открыто с клавиатуры: фокус сразу на первом пункте */
    byKeyboard?: boolean;
    extras?: TrackMenuExtra[];
}
/** Пункт меню: действие, подпись, значок. Действие '-' — разделитель */
type MenuLeaf = [string, string, string];
/** Подменю: кнопка с подписью и значком, пункты открываются сбоку (наведение, → или Enter) */
interface MenuSub { sub: string; label: string; icon: string; items: MenuLeaf[] }
type MenuEntry = MenuLeaf | MenuSub;
/** Что раздел отдаёт ядру: слушатели страницы, закрытие меню, слежение за iframe */
export interface MenuSection {
    onPageMenu(event: MouseEvent): void;
    onOutside(event: Event): void;
    onDocumentKey(event: KeyboardEvent): void;
    closeMenu(): void;
    /** Волна от закреплённого плейлиста или артиста по ссылке; title для плашки «Собираю волну» */
    startLink(kind: 'playlist' | 'artist', url: string, title: string): void;
    /** Волна от конкретного трека (трек не из волны на карточке): меню его не знает, поэтому трек передаётся целиком */
    startTrack(track: WaveTrack): void;
    /** Действие меню над треком под узлом (нижний бар, строка списка): true, если цель нашлась и действие есть */
    actOn(node: Element, act: string): boolean;
    /** Какие действия меню сейчас доступны трека под узлом: по ним кнопки знают, нажаты ли они (undislike, unmore) */
    actsOn(node: Element): string[];
    /** Одно меню трека для всех мест: «⋯» в баре и на карточке, режим роликов. false — трека нет, меню не открыто */
    open(request: TrackMenuRequest): boolean;
    /** iframe того же сайта: в каждый документ те же слушатели, ушедшие документы забываются */
    watchFrames(): void;
    /** Снять слушатели со всех документов iframe */
    dispose(): void;
}

export function installMenu(core: MenuCore): MenuSection {
    /** Разделитель групп в списке пунктов меню */
    const MENU_SEPARATOR = '-';
    /** Пункт места (TrackMenuExtra) в списке пунктов: приставка и его id */
    const EXTRA_PREFIX = 'x:';
    const {
        texts: T, known, excludedTracks, excludedArtists, laterTracks, laterArtists, moreTracks, marked, familyHidden, setExcluded, setFamily, addTrack, currentCandidate,
        fromTrack, trackOf, artistOf, artistOwnTracks, artistCatalog, playlistTracks, resolveUrl, beginSeed, ensureProfile, ensureExclusions, ensureStyle, showToast, onScroll, el,
        pinned, pin, playGenre, cardGenre,
    } = core;
    const MENU_ICON: Record<string, string> = {
        link: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.6 9.4a.75.75 0 0 1 0-1.06l1.74-1.74a.75.75 0 1 1 1.06 1.06L7.66 9.4a.75.75 0 0 1-1.06 0zM4.5 11.5a1.75 1.75 0 0 1 0-2.47l1.6-1.6-1.06-1.06-1.6 1.6a3.25 3.25 0 0 0 4.6 4.6l1.6-1.6-1.06-1.06-1.6 1.6a1.75 1.75 0 0 1-2.48 0zm7-7a1.75 1.75 0 0 1 0 2.47l-1.6 1.6 1.06 1.06 1.6-1.6a3.25 3.25 0 0 0-4.6-4.6l-1.6 1.6 1.06 1.06 1.6-1.6a1.75 1.75 0 0 1 2.48 0z"/></svg>',
        wave: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1 6.5h1.5v3H1zM4 4.5h1.5v7H4zM7 2h1.5v12H7zM10 5h1.5v6H10zM13 7h1.5v2H13z"/></svg>',
        artist: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5a3.25 3.25 0 1 1 0 6.5 3.25 3.25 0 0 1 0-6.5zM2 14.5c0-3 2.7-5 6-5s6 2 6 5z"/></svg>',
        // Артист со списком: все его треки
        catalog: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 1.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM.5 12c0-2.4 2-4 4.5-4s4.5 1.6 4.5 4zM11 3h4.5v1.5H11zM11 6.75h4.5v1.5H11zM11 10.5h4.5V12H11zM.5 13.5h15V15H.5z"/></svg>',
        block: '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill-rule="evenodd" d="M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1zm4.3 10.2A5.5 5.5 0 0 0 4.8 3.7zM3.7 4.8a5.5 5.5 0 0 0 7.5 7.5z"/></svg>',
        hide: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.5 1.5a3.25 3.25 0 1 1 0 6.5 3.25 3.25 0 0 1 0-6.5zM.5 14.5c0-3 2.7-5 6-5 1.1 0 2.2.2 3 .7v4.3zM10.5 11h5v1.5h-5z"/></svg>',
        undo: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.6 3.4 5.7 4.5 4.1 6H10a4.5 4.5 0 0 1 0 9H6v-1.5h4a3 3 0 0 0 0-6H4.1l1.6 1.5-1.1 1.1L1.2 6.75z"/></svg>',
        more: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M7.25 2h1.5v5.25H14v1.5H8.75V14h-1.5V8.75H2v-1.5h5.25z"/></svg>',
        later: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12.34 2.02C6.59 1.82 2 6.42 2 12c0 5.52 4.48 10 10 10 3.71 0 6.93-2.02 8.66-5.02-7.51-.25-12.09-8.43-8.32-14.96z"/></svg>',
        // Стопка слоёв: версии одной песни
        versions: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.2 15 5 8 8.8 1 5zM2.7 7.4 8 10.3l5.3-2.9L15 8.3 8 12.1 1 8.3zm0 3.3L8 13.6l5.3-2.9 1.7.9L8 15.4 1 11.6z"/></svg>',
        // Стрелка вниз над лотком: скачать трек
        download: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M7.25 1.5h1.5v6.69l2.22-2.22 1.06 1.06L8 11.06 3.97 7.03l1.06-1.06 2.22 2.22zM2 12.5h12V14H2z"/></svg>',
        // Список с плюсом: трек в набор
        // Строки текста с нотой: текст песни
        lyrics: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 3h12v1.5H2zM2 6.25h8v1.5H2zM2 9.5h5.5V11H2zM12.5 6.5v4.8a1.9 1.9 0 1 1-1.25-1.79V5.5H14v1z"/></svg>',
        pick:'<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1 2.5h10V4H1zM1 6.25h10v1.5H1zM1 10h6v1.5H1zM11.25 9h1.5v2.25H15v1.5h-2.25V15h-1.5v-2.25H9v-1.5h2.25z"/></svg>',
        // Молния: к дропу играющего трека
        drop: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M9.4.8 3 9.2h4.1L6.4 15.2 13 6.6H8.8z"/></svg>',
        // Кнопка-булавка: закрепить на главной
        pin: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10.2 1 15 5.8l-1.06 1.06-.88-.88-2.9 2.9.35 2.83-1.06 1.06-2.83-2.83L2.06 14.5 1.5 13.94l4.56-4.56-2.83-2.83 1.06-1.06 2.83.35 2.9-2.9-.88-.88z"/></svg>',
        // Строки со стрелкой вверх: слушать следующим
        next: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1 3h8v1.5H1zM1 6.75h8v1.5H1zM1 10.5h5V12H1zM12 3.4l3.2 3.2-1.06 1.06-1.39-1.38V13h-1.5V6.28L9.86 7.66 8.8 6.6z"/></svg>',
        // Строки со стрелкой вниз: в конец очереди
        last: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1 3h8v1.5H1zM1 6.75h8v1.5H1zM1 10.5h5V12H1zM12.75 3v6.72l1.39-1.38 1.06 1.06L12 12.6 8.8 9.4l1.06-1.06 1.39 1.38V3z"/></svg>',
        // Две дуги вокруг точки: ещё волны
        waves: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 6.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zM4.46 4.46l1.06 1.06a3.5 3.5 0 0 0 0 4.96l-1.06 1.06a5 5 0 0 1 0-7.08zm7.08 0a5 5 0 0 1 0 7.08l-1.06-1.06a3.5 3.5 0 0 0 0-4.96zM2.34 2.34 3.4 3.4a6.5 6.5 0 0 0 0 9.2l-1.06 1.06a8 8 0 0 1 0-11.32zm11.32 0a8 8 0 0 1 0 11.32L12.6 12.6a6.5 6.5 0 0 0 0-9.2z"/></svg>',
        // Перечёркнутый глаз: скрыть
        eyeOff: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m2.53 1.47 12 12-1.06 1.06-2.04-2.04A7.6 7.6 0 0 1 8 13.5C4.4 13.5 1.8 11 .6 8c.5-1.25 1.3-2.4 2.33-3.32L1.47 2.53zM4 5.74A6.4 6.4 0 0 0 2.24 8C3.3 10.3 5.4 12 8 12c.84 0 1.63-.17 2.35-.48L9.1 10.28A2.5 2.5 0 0 1 5.72 6.9zM8 2.5c3.6 0 6.2 2.5 7.4 5.5-.4 1-.98 1.92-1.71 2.7l-1.06-1.06c.45-.5.84-1.05 1.13-1.64C12.7 5.7 10.6 4 8 4c-.5 0-.98.06-1.44.17L5.37 2.98A7.7 7.7 0 0 1 8 2.5z"/></svg>',
        // Три точки: ещё
        dots: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 6.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm5 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm5 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z"/></svg>',
    };
    /** Стрелка подменю справа */
    const CHEVRON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.03 3.47 10.56 8l-4.53 4.53-1.06-1.06L8.44 8 4.97 4.53z"/></svg>';
    const isSub = (entry: MenuEntry): entry is MenuSub => !Array.isArray(entry);
    /** Пункты, у которых есть сочетание клавиш (main.ts, shortcutService): подсказка справа, только у трека, который играет в волне */
    const SHORTCUT: Record<string, [string, string]> = { drop: ['Ctrl+J', 'Control+J'], later: ['Ctrl+D', 'Control+D'], more: ['Ctrl+M', 'Control+M'] };
    /** Пункты, которые убирают музыку: при наведении чуть красноватые */
    const DANGER = new Set(['dislike', 'hide-family', 'hide-artist']);
    /** Вид меню: свой лист стилей, сильнее старых правил волны и темы (у них !important на .scw-menu) */
    const MENU_CSS = [
        '.scw-menu.scw-m{position:fixed;box-sizing:border-box;min-width:232px;max-width:300px;margin:0;padding:5px!important;border:0!important;border-radius:13px!important;' +
            'background:rgba(28,29,35,.82)!important;-webkit-backdrop-filter:blur(22px) saturate(1.5);backdrop-filter:blur(22px) saturate(1.5);' +
            'box-shadow:0 0 0 1px rgba(255,255,255,.08),inset 0 1px 0 rgba(255,255,255,.05),0 22px 50px -12px rgba(0,0,0,.65),0 6px 16px -4px rgba(0,0,0,.35)!important;' +
            'color:#fff;font-size:13.5px;line-height:1;letter-spacing:0;overflow:visible;scrollbar-width:none;outline:none;animation:scw-m-in .14s cubic-bezier(.2,.9,.3,1) both!important}',
        '.scw-menu.scw-m::-webkit-scrollbar{display:none}',
        '.scw-menu.scw-m[data-scroll]{overflow-y:auto}',
        '@keyframes scw-m-in{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:none}}',
        '.scw-menu.scw-m .scw-mi{display:flex;align-items:center;gap:10px;box-sizing:border-box;width:100%;height:32px!important;margin:0;padding:0 10px 0 9px!important;border:0!important;' +
            'border-radius:8px!important;background:transparent!important;box-shadow:none!important;outline:none!important;color:rgba(255,255,255,.84)!important;' +
            'font:inherit;font-size:13.5px!important;font-weight:500!important;line-height:1!important;text-align:left;white-space:nowrap;cursor:default;appearance:none;-webkit-appearance:none}',
        '.scw-menu.scw-m .scw-mic{display:grid;place-items:center;flex:none;width:16px;height:16px;color:rgba(255,255,255,.46)}',
        '.scw-menu.scw-m .scw-mic svg,.scw-menu.scw-m .scw-mch svg{display:block;width:16px;height:16px;fill:currentColor}',
        '.scw-menu.scw-m .scw-ml{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}',
        '.scw-menu.scw-m .scw-mk{margin-left:12px;color:rgba(255,255,255,.34);font-size:11.5px;font-weight:500;letter-spacing:.02em;font-variant-numeric:tabular-nums}',
        '.scw-menu.scw-m .scw-mch{flex:none;margin-right:-4px;color:rgba(255,255,255,.34)}',
        '.scw-menu.scw-m .scw-mch svg{width:14px;height:14px}',
        // Подсветка под мышью идёт за курсором (:hover), под клавиатурой за фокусом. Раньше и мышь вела фокус, и подсветка
        // залипала: над пустым местом и по пути к подменю фокус не уходил с прошлого пункта
        '.scw-menu.scw-m[data-input="mouse"] .scw-mi:hover,.scw-menu.scw-m[data-input="keys"] .scw-mi:focus,.scw-menu.scw-m .scw-mi[aria-expanded="true"]{background:rgba(255,255,255,.085)!important;color:#fff!important}',
        '.scw-menu.scw-m[data-input="mouse"] .scw-mi:hover .scw-mic,.scw-menu.scw-m[data-input="mouse"] .scw-mi:hover .scw-mch,.scw-menu.scw-m[data-input="keys"] .scw-mi:focus .scw-mic,.scw-menu.scw-m[data-input="keys"] .scw-mi:focus .scw-mch,.scw-menu.scw-m .scw-mi[aria-expanded="true"] .scw-mch{color:rgba(255,255,255,.9)}',
        '.scw-menu.scw-m[data-input="keys"] .scw-mi:focus-visible{box-shadow:inset 0 0 0 1px rgba(255,255,255,.16)!important}',
        '.scw-menu.scw-m .scw-mi:active{background:rgba(255,255,255,.13)!important}',
        '.scw-menu.scw-m[data-input="mouse"] .scw-mi[data-tone="danger"]:hover,.scw-menu.scw-m[data-input="keys"] .scw-mi[data-tone="danger"]:focus{color:#ffb4b4!important}',
        '.scw-menu.scw-m[data-input="mouse"] .scw-mi[data-tone="danger"]:hover .scw-mic,.scw-menu.scw-m[data-input="keys"] .scw-mi[data-tone="danger"]:focus .scw-mic{color:#ff8f8f}',
        '.scw-menu.scw-m .scw-msep{display:block;height:1px;margin:5px 9px;padding:0;border:0;background:rgba(255,255,255,.07)}',
        '.scw-menu.scw-m[hidden]{display:none!important}',
        '@media (prefers-reduced-motion:reduce){.scw-menu.scw-m{animation:none!important}}',
        'html.scm-reduce .scw-menu.scw-m{animation:none!important}',
    ].join('\n');
    function ensureMenuStyle(): void {
        if (document.getElementById('scw-menu-style')) return;
        const style = document.createElement('style');
        style.id = 'scw-menu-style';
        style.textContent = MENU_CSS;
        (document.head ?? document.documentElement).append(style);
    }
    // Зёрна: сам трек; топ артиста (он же идёт в подборку); треки плейлиста
    async function loadSeed(kind: SeedLinkKind, target: MenuTarget): Promise<{ seed: Seed; first: WaveTrack | null } | null> {
        // Все треки артиста (Ф1): только его каталог по порядку, похожих нет; режим «Похожее», чтобы слышанное не отсекалось
        if (kind === 'artistAll') {
            const catalog = await artistCatalog(target);
            if (!catalog) return null;
            const seed: Seed = { kind, title: catalog.title, tracks: catalog.tracks.slice(0, 5), own: catalog.tracks, order: 'fixed', mode: 'similar' };
            if (catalog.artist) seed.artist = catalog.artist;
            return { seed, first: null };
        }
        if (kind === 'track') {
            const track = await trackOf(target);
            return track ? { seed: { kind, title: (track.title ?? '').trim() || '…', tracks: [track], own: [] }, first: track } : null;
        }
        // Артист: его лучшее и неслышанное впереди, три своих на один найденный, найденное это похожие артисты и похожее
        // на его треки (П3)
        if (kind === 'artist') {
            const artist = await artistOf(target);
            if (!artist) return null;
            const own = await artistOwnTracks(artist.id);
            return { seed: { kind, title: artist.username || '…', tracks: shuffleInPlace(own.slice()), own, order: 'smart', artist: artist.id }, first: null };
        }
        const body = (await resolveUrl(target.url)) as { title?: unknown } | null;
        const tracks = await playlistTracks(body);
        return { seed: { kind, title: (typeof body?.title === 'string' ? body.title.trim() : '') || '…', tracks: shuffleInPlace(tracks), own: [] }, first: null };
    }
    async function startSeed(kind: SeedLinkKind, target: MenuTarget, title = ''): Promise<void> {
        const request = core.nextSeedRequest();
        // Треки артиста и плейлиста грузятся секунды: плашка сразу, название, если оно уже известно.
        // «Все треки артиста» ведут к исполнителю из названия, а не к выложившему каналу: до загрузки его имени нет
        const name = (title || (kind === 'track' ? target.track?.title : kind === 'artist' && target.kind === 'track' ? target.track?.user?.username : ''))?.trim();
        showToast(kind === 'artistAll' ? (name ? T.seedCollectingArtist.replace('{title}', name) : T.seedCollectingArtistAny) : name ? T.seedCollecting.replace('{title}', name) : T.seedCollectingAny);
        try {
            await Promise.all([ensureProfile(), ensureExclusions()]);
            const loaded = await loadSeed(kind, target);
            if (request !== core.seedRequest() || core.disposed()) return;
            if (!loaded?.seed.tracks.length) {
                showToast(T.toastEmpty);
                return;
            }
            await beginSeed(request, loaded);
        } catch (error) {
            if (request !== core.seedRequest()) return;
            console.warn('Волна: не удалось начать волну', error);
            showToast(T.toastFailed);
        }
    }
    // Элементы списков сайта и их главные ссылки: проверено на ленте, лайках, истории, поиске, плейлисте, главной
    // Строки и плитки клиента вне блока волны (#sc-vibe и другие) тоже строки: меню по всей строке, а не только по ссылке
    const ITEM_SELECTOR = '.soundList__item, .searchItem__trackItem, .historicalPlays__item, .userStreamItem, .trackItem, .compactTrackList__item, .systemPlaylistTrackList__item, .playableTile, .soundBadge, .playbackSoundBadge, .userBadgeListItem, .userBadge, .sound, .scw-row, .scw-tile';
    /** Плитка или строка клиента с номером трека: «Далее», выбор пути, подборки, «Моя музыка», «Волна по описанию» */
    const OWN_ITEM = '.scw-tile[data-track], .scw-tile[data-fork], .scw-row[data-track]';
    const ownTrack = (tile: HTMLElement): WaveTrack | undefined => {
        const id = Number(tile.dataset.track ?? tile.dataset.fork);
        return id ? known.get(id)?.track ?? core.preview().find((item) => item.track.id === id)?.track ?? core.sectionTrack(id) : undefined;
    };
    function playingTarget(): MenuTarget | null {
        const track = core.playingTrack();
        return track ? fromTrack(track) : null;
    }
    // Играющий ли это трек: по номеру, если трек известен, иначе по ссылке
    function isPlaying(target: MenuTarget): boolean {
        if (target.kind !== 'track') return false;
        const playing = core.playingTrack();
        if (!playing) return false;
        if (target.track) return target.track.id === playing.id;
        const key = canonicalUrl(target.url);
        return !!key && key === canonicalUrl(playing.permalink_url ?? '');
    }
    const PRIMARY_SELECTOR = 'a.soundTitle__title, a.trackItem__trackTitle, a.playbackSoundBadge__titleLink, a.playableTile__mainHeading, a.playableTile__heading, a.sound__coverArt, a.playableTile__artworkLink, a.userBadge__usernameLink, a.userBadgeListItem__heading';
    const USER_SELECTOR = 'a.soundTitle__username, a.trackItem__username, a.playbackSoundBadge__lightLink, a.playableTile__usernameHeading, .playableTile a.sc-link-secondary';
    const HERO_SELECTOR = '.fullHero, .listenHero, .profileHeader, .systemPlaylistHero, .l-listen-hero';
    function menuTarget(node: Element): MenuTarget | null {
        if (node.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]')) return null;
        // Играющий трек без ссылки на него (режим «Для роликов»): разметка помечает это сама
        if (node.closest('[data-sc-track="current"]')) return playingTarget();
        const own = node.closest<HTMLElement>(OWN_ITEM);
        const ownFound = own ? ownTrack(own) : undefined;
        if (ownFound) return fromTrack(ownFound);
        const inWave = node.closest('#sc-wave');
        if (inWave) {
            // Карточка волны: трек волны или трек не из волны, который играет сейчас; меню по всей карточке
            const track = own ? undefined : node.closest('.scw-body') ? currentCandidate()?.track ?? core.playingTrack() ?? undefined : undefined;
            if (track) return fromTrack(track);
            const tile = own;
            // Карточка жанра на полке: закрепить жанр или включить волну по нему
            const genre = tile ? '' : cardGenre(node);
            return genre ? { kind: 'genre', url: '', artistUrl: '', genre } : null;
        }
        const item = node.closest(ITEM_SELECTOR);
        const anchor = node.closest<HTMLAnchorElement>('a[href]');
        // Ссылка на жанр (метка трека, страница /tags/…) раньше строки, в которой она стоит
        const tag = anchor ? classifyTag(anchor.getAttribute('href') ?? '', location.href) : '';
        if (tag) return { kind: 'genre', url: '', artistUrl: '', genre: tag };
        let link = anchor ? classifyLink(anchor.getAttribute('href') ?? '', location.href) : null;
        if (!link && item) {
            const primary = item.querySelector<HTMLAnchorElement>(PRIMARY_SELECTOR);
            link = primary ? classifyLink(primary.getAttribute('href') ?? '', location.href) : null;
        }
        // Незнакомая разметка строки: первая ссылка на трек или плейлист внутри
        if (!link && item)
            for (const other of item.querySelectorAll<HTMLAnchorElement>('a[href]')) {
                const found = classifyLink(other.getAttribute('href') ?? '', location.href);
                if (found && found.kind !== 'artist') { link = found; break; }
            }
        if (!link && !item && node.closest(HERO_SELECTOR)) link = classifyLink(location.pathname, location.href);
        if (!link) return null;
        const target = link;
        const user = target.kind === 'track' && item ? item.querySelector<HTMLAnchorElement>(USER_SELECTOR) : null;
        const artist = user ? classifyLink(user.getAttribute('href') ?? '', location.href) : null;
        const knownTrack = [...known.values()].find((candidate) => canonicalUrl(candidate.track.permalink_url) === canonicalUrl(target.url));
        return { kind: target.kind, url: target.url, artistUrl: artist?.kind === 'artist' ? artist.url : '', track: knownTrack?.track };
    }
    // Новая вёрстка SoundCloud (страница трека и не только) живёт в iframe того же сайта по адресу /n/...
    // Классы там от MUI и меняются от сборки к сборке, поэтому опора на ссылки и заголовок h1.
    // Строка списка это самый широкий предок, где ссылка на трек или плейлист ровно одна
    function frameMenuTarget(node: Element): MenuTarget | null {
        if (node.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]')) return null;
        const doc = node.ownerDocument;
        const path = doc.location.pathname.replace(/^\/n(?=\/)/, '');
        const base = location.origin + path;
        const linkOf = (anchor: Element): { kind: WaveLinkKind; url: string } | null => classifyLink(anchor.getAttribute('href') ?? '', base);
        const artistIn = (root: Element | null): string => {
            for (const anchor of root ? root.querySelectorAll('a[href]') : []) {
                const found = linkOf(anchor);
                if (found?.kind === 'artist') return found.url;
            }
            return '';
        };
        const rowOf = (from: Element): { link: { kind: WaveLinkKind; url: string }; row: Element } | null => {
            let best: { link: { kind: WaveLinkKind; url: string }; row: Element } | null = null;
            for (let row: Element | null = from, depth = 0; row && depth < 12 && row !== doc.body && row.tagName !== 'MAIN'; row = row.parentElement, depth++) {
                const urls = new Map<string, { kind: WaveLinkKind; url: string }>();
                for (const anchor of row.querySelectorAll('a[href]')) {
                    const found = linkOf(anchor);
                    if (found && found.kind !== 'artist') urls.set(found.url, found);
                }
                if (urls.size > 1) break;
                if (urls.size === 1) best = { link: [...urls.values()][0], row };
            }
            return best;
        };
        const anchor = node.closest('a[href]');
        let link: { kind: WaveLinkKind; url: string } | null = null;
        let artistUrl = '';
        const tag = anchor ? classifyTag(anchor.getAttribute('href') ?? '', base) : '';
        if (tag) return { kind: 'genre', url: '', artistUrl: '', genre: tag };
        if (anchor) {
            // Ссылка не на трек, артиста, плейлист или жанр (подписчики и прочее): меню сайта
            link = linkOf(anchor);
            if (!link) return null;
            if (link.kind === 'track') artistUrl = artistIn(rowOf(anchor)?.row ?? null);
        } else {
            const hero = node.closest('section');
            if (node.closest('h1') || hero?.querySelector('h1')) {
                // Шапка страницы: заголовок без ссылки, это сама страница
                link = classifyLink(path, location.origin + '/');
                if (link?.kind === 'track') artistUrl = artistIn(hero);
            } else {
                const row = rowOf(node);
                if (row) {
                    link = row.link;
                    if (link.kind === 'track') artistUrl = artistIn(row.row);
                }
            }
        }
        if (!link) return null;
        const target = link;
        const knownTrack = [...known.values()].find((candidate) => canonicalUrl(candidate.track.permalink_url) === canonicalUrl(target.url));
        return { kind: target.kind, url: target.url, artistUrl, track: knownTrack?.track };
    }
    // Отметка у цели меню: по id, если трек известен, иначе по ссылке; истёкшее «Не сейчас» не считается
    function trackMarked(map: Map<number, Excluded>, target: MenuTarget): boolean {
        if (target.track) return marked(map, target.track.id);
        const key = canonicalUrl(target.url);
        return !!key && [...map.values()].some((entry) => entry.url === key && marked(map, entry.id));
    }
    function artistMarked(map: Map<number, Excluded>, target: MenuTarget): boolean {
        const id = target.kind !== 'artist' && target.track ? trackArtist(target.track) : 0;
        if (id) return marked(map, id);
        const key = canonicalUrl(target.kind === 'artist' ? target.url : target.artistUrl);
        return !!key && [...map.values()].some((entry) => entry.url === key && marked(map, entry.id));
    }
    const trackExcluded = (target: MenuTarget): boolean => trackMarked(excludedTracks, target);
    const artistExcluded = (target: MenuTarget): boolean => artistMarked(excludedArtists, target);
    // Подписи подменю: только меню знает о них, поэтому здесь, а не в общих текстах волны
    const SUB_LABEL = T.lang === 'ru'
        ? { waves: 'Ещё волны', hide: 'Скрыть', more: 'Ещё' }
        : { waves: 'More waves', hide: 'Hide', more: 'More' };
    const sep = (): MenuLeaf => [MENU_SEPARATOR, '', ''];
    /** Группы в один список через разделитель; пустая группа не рисуется */
    function joinGroups<E>(groups: E[][], separator: () => E): E[] {
        const out: E[] = [];
        for (const group of groups) {
            if (!group.length) continue;
            if (out.length) out.push(separator());
            out.push(...group);
        }
        return out;
    }
    // Единственный источник пунктов меню трека: правый клик, «⋯» в баре и на карточке, режим роликов зовут его.
    // Общий набор одинаков везде; от места зависят только «К дропу» (у играющего трека) и пункты места (extras, своей группой).
    // У трека верхний уровень короткий (главные действия), остальное в подменю: «Ещё волны», «Ещё», «Скрыть».
    // У артиста, плейлиста и жанра пунктов мало: список плоский
    function menuItems(target: MenuTarget, extras: TrackMenuExtra[] = []): MenuEntry[] {
        const extraItems: MenuLeaf[] = extras.map((extra) => [EXTRA_PREFIX + extra.id, extra.label, '']);
        // Закрепить на главной можно плейлист, артиста и жанр (В5); у трека закрепления нет
        const pinItem = (): MenuLeaf => (pinned(target) ? ['unpin', T.menuUnpin, 'undo'] : ['pin', T.menuPin, 'pin']);
        const hasArtist = target.kind === 'artist' || !!target.artistUrl || !!target.track;
        const playing = isPlaying(target);
        if (target.kind === 'track') {
            const waves: MenuLeaf[] = [];
            if (hasArtist) waves.push(['wave-artist', T.menuWaveArtist, 'artist'], ['artist-all', T.menuArtistAll, 'catalog']);
            waves.push(trackMarked(moreTracks, target) ? ['unmore', T.menuUnmore, 'undo'] : ['more', T.more, 'more']);
            const lyricsLabel = core.lyricsLabel(target);
            const more = joinGroups<MenuLeaf>([
                [core.pickedIndex(target) >= 0 ? ['unpick', T.menuUnpick, 'undo'] : ['pick', T.menuPick, 'pick']],
                [...(lyricsLabel ? [['lyrics', lyricsLabel, 'lyrics'] as MenuLeaf] : []), ['versions', T.menuVersions, 'versions']],
            ], sep);
            const hide: MenuLeaf[] = [
                trackMarked(laterTracks, target) ? ['unlater', T.menuUnlater, 'undo'] : ['later', T.later, 'later'],
                familyHidden(target) ? ['show-family', T.menuShowFamily, 'undo'] : ['hide-family', T.menuHideFamily, 'versions'],
            ];
            if (hasArtist) hide.push(artistExcluded(target) ? ['show-artist', T.menuShowArtist, 'undo'] : ['hide-artist', T.menuHideArtist, 'hide']);
            const downloadLabel = core.download.label();
            const about: MenuEntry[] = [];
            if (downloadLabel) about.push(['download', downloadLabel, 'download']);
            if (target.url) about.push(['copy-link', T.menuCopyLink, 'link']);
            about.push({ sub: 'more', label: SUB_LABEL.more, icon: 'dots', items: more });
            return joinGroups<MenuEntry>([
                playing ? [['drop', T.menuDrop, 'drop']] : [],
                [['queue-next', T.menuQueueNext, 'next'], ['queue-last', T.menuQueueLast, 'last']],
                [['wave-track', T.menuWaveTrack, 'wave'], { sub: 'waves', label: SUB_LABEL.waves, icon: 'waves', items: waves }],
                // Пункты места (2.15.12): ушедшие из бара кнопки («С другом», эффекты, подписка) на верхнем уровне, а не в «Ещё»:
                // их искали там, где раньше была кнопка, и в подменю не находили
                extraItems,
                about,
                [trackExcluded(target) ? ['undislike', T.menuUndislike, 'undo'] : ['dislike', T.menuDislike, 'block'], { sub: 'hide', label: SUB_LABEL.hide, icon: 'eyeOff', items: hide }],
            ], sep);
        }
        const head: MenuLeaf[] = [...(playing ? [['drop', T.menuDrop, 'drop'] as MenuLeaf] : []), ...extraItems];
        if (target.kind === 'genre') return joinGroups<MenuEntry>([head, [['wave-genre', T.menuWaveGenre, 'wave'], pinItem()]], sep);
        const wave: MenuLeaf[] = [];
        if (target.kind === 'playlist') wave.push(['wave-playlist', T.menuWavePlaylist, 'wave'], pinItem());
        if (hasArtist) wave.push(['wave-artist', T.menuWaveArtist, target.kind === 'artist' ? 'wave' : 'artist'], ['artist-all', T.menuArtistAll, 'catalog']);
        if (target.kind === 'artist') wave.push(pinItem());
        const about: MenuLeaf[] = target.url ? [['copy-link', T.menuCopyLink, 'link']] : [];
        const hide: MenuLeaf[] = [];
        if (target.kind === 'artist') hide.push(artistMarked(laterArtists, target) ? ['unlater-artist', T.menuUnlater, 'undo'] : ['later-artist', T.later, 'later']);
        if (hasArtist) hide.push(artistExcluded(target) ? ['show-artist', T.menuShowArtist, 'undo'] : ['hide-artist', T.menuHideArtist, 'hide']);
        return joinGroups<MenuEntry>([head, wave, about, hide], sep);
    }
    /** Все действия меню подряд, с пунктами подменю: по ним кнопки знают, нажаты ли они */
    const flatActs = (entries: MenuEntry[]): string[] =>
        entries.flatMap((entry) => (isSub(entry) ? flatActs(entry.items) : [entry[0]])).filter((act) => act !== MENU_SEPARATOR);
    function runMenu(act: string, target: MenuTarget, extras: TrackMenuExtra[] = []): void {
        if (act.startsWith(EXTRA_PREFIX)) {
            extras.find((extra) => EXTRA_PREFIX + extra.id === act)?.run();
            return;
        }
        switch (act) {
            case 'drop': core.drop(); return;
            case 'queue-next':
            case 'queue-last':
                void trackOf(target).then((track) => { if (track && !core.disposed()) addTrack(track, act === 'queue-next'); }).catch((error: unknown) => { console.warn('Очередь: трек не добавлен', error); showToast(T.toastFailed); });
                return;
            case 'wave-track': void startSeed('track', target); return;
            case 'wave-artist': void startSeed('artist', target); return;
            case 'artist-all': void startSeed('artistAll', target); return;
            case 'wave-playlist': void startSeed('playlist', target); return;
            case 'wave-genre': if (target.genre) playGenre(target.genre); return;
            case 'pin':
            case 'unpin': void pin(target, act === 'pin'); return;
            case 'pick':
            case 'unpick': void core.pick(target, act === 'pick'); return;
            case 'dislike':
            case 'undislike': void setExcluded('track', target, act === 'dislike'); return;
            case 'hide-artist':
            case 'show-artist': void setExcluded('artist', target, act === 'hide-artist'); return;
            case 'more':
            case 'unmore': void setExcluded('more', target, act === 'more'); return;
            case 'later':
            case 'unlater': void setExcluded('later-track', target, act === 'later'); return;
            case 'later-artist':
            case 'unlater-artist': void setExcluded('later-artist', target, act === 'later-artist'); return;
            case 'versions': void core.openVersions(target); return;
            case 'lyrics': core.showLyrics(target); return;
            case 'download':
                void trackOf(target).then(async (track) => { if (track && !core.disposed()) await core.download.run(track); }).catch((error: unknown) => { console.warn('Скачивание: трек не найден', error); showToast(T.toastFailed); });
                return;
            case 'copy-link':
                void navigator.clipboard.writeText(target.url).then(() => core.showToast(T.toastLinkCopied), () => core.showToast(target.url));
                return;
            case 'hide-family':
            case 'show-family': void setFamily(target, act === 'hide-family'); return;
        }
    }

    let menu: HTMLElement | null = null;
    let menuFor: MenuTarget | null = null;
    let menuReturn: HTMLElement | null = null;
    // Кнопка «⋯», от которой открыто меню, и пункты её места
    let menuAnchor: HTMLElement | null = null;
    let menuExtras: TrackMenuExtra[] = [];
    // Та же кнопка после пересборки блока: узел новый, ключ тот же (data-track-menu)
    const sameAnchor = (a: Element | null, b: Element | null): boolean =>
        !!a && !!b && (a === b || (!!(a as HTMLElement).dataset?.trackMenu && (a as HTMLElement).dataset.trackMenu === (b as HTMLElement).dataset?.trackMenu));
    // Узел кнопки сейчас: блок волны пересобирается каждую секунду, и прежний узел мог уйти со страницы
    const liveAnchor = (anchor: HTMLElement | null): HTMLElement | null => {
        if (!anchor || anchor.isConnected || !anchor.dataset.trackMenu) return anchor;
        return document.querySelector<HTMLElement>('[data-track-menu="' + anchor.dataset.trackMenu + '"]');
    };
    // Подменю: отдельные панели рядом с меню (не внутри: размытие фона у вложенной панели не видит страницу)
    let panels: HTMLElement[] = [];
    let openSub: { trigger: HTMLElement; panel: HTMLElement } | null = null;
    // Наведение: подменю открывается с задержкой и закрывается не сразу, чтобы путь мыши наискосок до него не закрывал его
    let hoverTimer: ReturnType<typeof setTimeout> | undefined;
    // Где встало меню и где ему кончаться снизу (верх плеера): по ним встают подменю
    let menuBox = { left: 0, top: 0, bottom: 0 };
    const inMenu = (node: Element | null): boolean => !!node && panels.some((panel) => panel.contains(node));
    function closeMenu(): void {
        clearTimeout(hoverTimer);
        for (const panel of panels) panel.remove();
        panels = [];
        openSub = null;
        menu?.remove();
        liveAnchor(menuAnchor)?.setAttribute('aria-expanded', 'false');
        menu = null;
        menuFor = null;
        menuReturn = null;
        menuAnchor = null;
        menuExtras = [];
    }
    // Escape, Tab и выбор пункта возвращают фокус туда, откуда меню открыто; клик мимо фокус не трогает
    function closeMenuBack(): void {
        const back = liveAnchor(menuReturn);
        closeMenu();
        if (back?.isConnected) back.focus({ preventScroll: true });
    }
    /** Где встать: x, y — левый верхний угол под точкой или кнопкой; aboveY — низ меню, если снизу не помещается;
     * right — меню прижато правым краем к x (кнопка «⋯» справа) */
    interface MenuPlace { x: number; y: number; aboveY: number; right: boolean }
    function openMenu(target: MenuTarget, place: MenuPlace, byKeyboard: boolean, anchor: HTMLElement | null = null, extras: TrackMenuExtra[] = []): void {
        const from = document.activeElement;
        closeMenu();
        ensureStyle();
        ensureMenuStyle();
        const host = document.fullscreenElement ?? document.body;
        const playingWave = isPlaying(target) && !!target.track && currentCandidate()?.track.id === target.track.id;
        const newPanel = (className: string): HTMLElement => {
            const panel = el('div', 'scw-menu scw-m' + className);
            panel.setAttribute('role', 'menu');
            panel.tabIndex = -1;
            panel.style.position = 'fixed';
            // Выше режима «Для роликов» и плашек клиента
            panel.style.zIndex = '2147483500';
            return panel;
        };
        const leafItem = ([act, label, icon]: MenuLeaf): HTMLElement => {
            const item = el('button', 'scw-mi');
            item.type = 'button';
            item.tabIndex = -1;
            item.setAttribute('role', 'menuitem');
            item.dataset.menu = act;
            if (DANGER.has(act)) item.dataset.tone = 'danger';
            const glyph = el('span', 'scw-mic');
            const markup = act.startsWith(EXTRA_PREFIX) ? extras.find((extra) => EXTRA_PREFIX + extra.id === act)?.icon ?? '' : MENU_ICON[icon] ?? '';
            if (markup) glyph.insertAdjacentHTML('beforeend', markup);
            glyph.querySelector('svg')?.setAttribute('aria-hidden', 'true');
            item.append(glyph, el('span', 'scw-ml', label));
            // Сочетание клавиш есть у действий над треком, который играет в волне
            const shortcut = SHORTCUT[act];
            if (shortcut && (act === 'drop' || playingWave)) {
                const hint = el('span', 'scw-mk', shortcut[0]);
                hint.setAttribute('aria-hidden', 'true');
                item.append(hint);
                item.setAttribute('aria-keyshortcuts', shortcut[1]);
            }
            return item;
        };
        const separator = (): HTMLElement => {
            const line = el('hr', 'scw-msep');
            line.setAttribute('role', 'separator');
            return line;
        };
        const root = newPanel('');
        root.setAttribute('aria-label', T.menuActions);
        const subs: HTMLElement[] = [];
        for (const entry of menuItems(target, extras)) {
            if (!isSub(entry)) {
                root.append(entry[0] === MENU_SEPARATOR ? separator() : leafItem(entry));
                continue;
            }
            if (!entry.items.length) continue;
            const id = 'scw-msub-' + entry.sub;
            const trigger = el('button', 'scw-mi scw-mi-sub');
            trigger.type = 'button';
            trigger.tabIndex = -1;
            trigger.id = id + '-t';
            trigger.setAttribute('role', 'menuitem');
            trigger.setAttribute('aria-haspopup', 'menu');
            trigger.setAttribute('aria-expanded', 'false');
            trigger.setAttribute('aria-controls', id);
            trigger.dataset.sub = entry.sub;
            const glyph = el('span', 'scw-mic');
            glyph.insertAdjacentHTML('beforeend', MENU_ICON[entry.icon] ?? '');
            const chevron = el('span', 'scw-mch');
            chevron.insertAdjacentHTML('beforeend', CHEVRON);
            chevron.setAttribute('aria-hidden', 'true');
            trigger.append(glyph, el('span', 'scw-ml', entry.label), chevron);
            root.append(trigger);
            const panel = newPanel(' scw-msub');
            panel.id = id;
            panel.hidden = true;
            panel.setAttribute('aria-labelledby', trigger.id);
            for (const leaf of entry.items) panel.append(leaf[0] === MENU_SEPARATOR ? separator() : leafItem(leaf));
            subs.push(panel);
        }
        const all = [root, ...subs];
        const itemsOf = (panel: HTMLElement): HTMLElement[] => [...panel.children].filter((node): node is HTMLElement => node.classList.contains('scw-mi'));
        const panelOf = (trigger: HTMLElement): HTMLElement | null => subs.find((panel) => panel.id === trigger.getAttribute('aria-controls')) ?? null;
        const closeSub = (focusTrigger: boolean): void => {
            if (!openSub) return;
            const { trigger, panel } = openSub;
            openSub = null;
            // Фокус на кнопку до того, как подменю спрячется: иначе он остался бы в скрытой панели
            if (focusTrigger || panel.contains(document.activeElement)) trigger.focus({ preventScroll: true });
            panel.hidden = true;
            trigger.setAttribute('aria-expanded', 'false');
        };
        const showSub = (trigger: HTMLElement, focusFirst: boolean): void => {
            const panel = panelOf(trigger);
            if (!panel) return;
            if (openSub?.panel !== panel) {
                closeSub(false);
                panel.hidden = false;
                trigger.setAttribute('aria-expanded', 'true');
                openSub = { trigger, panel };
                // Сбоку от меню на уровне своей кнопки; не влезает справа — слева; по высоте сдвигается в окно
                const width = panel.offsetWidth;
                const height = panel.offsetHeight;
                const rootWidth = root.offsetWidth;
                let left = menuBox.left + rootWidth - 3;
                const flip = left + width > window.innerWidth - 8;
                if (flip) left = Math.max(8, menuBox.left - width + 3);
                const top = Math.max(8, Math.min(menuBox.top + trigger.offsetTop - root.scrollTop - 5, menuBox.bottom - height - 8));
                panel.style.left = left + 'px';
                panel.style.top = top + 'px';
                panel.style.transformOrigin = (flip ? 'right ' : 'left ') + Math.max(0, menuBox.top + trigger.offsetTop - root.scrollTop - top) + 'px';
            }
            if (focusFirst) itemsOf(panel)[0]?.focus({ preventScroll: true });
        };
        const choose = (item: HTMLElement): void => {
            const chosen = menuFor;
            const chosenExtras = menuExtras;
            closeMenuBack();
            if (item.dataset.menu && chosen) runMenu(item.dataset.menu, chosen, chosenExtras);
        };
        const onClick = (event: MouseEvent): void => {
            const item = event.target instanceof Element ? event.target.closest<HTMLElement>('.scw-mi') : null;
            if (!item) return;
            if (item.dataset.sub) {
                // Кнопка подменю только открывает его; с клавиатуры (Enter, пробел) фокус сразу на первый пункт
                clearTimeout(hoverTimer);
                showSub(item, event.detail === 0);
                return;
            }
            choose(item);
        };
        // Чем сейчас ведут меню: от этого зависит, подсвечивается пункт под курсором или пункт в фокусе
        const setInput = (mode: 'mouse' | 'keys'): void => {
            for (const panel of all) if (panel.dataset.input !== mode) panel.dataset.input = mode;
        };
        const onKey = (event: KeyboardEvent): void => {
            if (event.key !== 'Shift' && event.key !== 'Control' && event.key !== 'Alt') setInput('keys');
            const panel = event.currentTarget as HTMLElement;
            const buttons = itemsOf(panel);
            const active = document.activeElement as HTMLElement | null;
            const at = buttons.indexOf(active as HTMLElement);
            const inSub = panel !== root;
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                const down = event.key === 'ArrowDown';
                // Открыто мышью: фокус на самом меню, первая стрелка встаёт на крайний пункт
                const next = at < 0 ? (down ? 0 : buttons.length - 1) : (at + (down ? 1 : -1) + buttons.length) % buttons.length;
                if (!inSub) closeSub(false);
                buttons[next]?.focus();
            } else if (event.key === 'Home' || event.key === 'End') {
                event.preventDefault();
                if (!inSub) closeSub(false);
                buttons[event.key === 'Home' ? 0 : buttons.length - 1]?.focus();
            } else if (event.key === 'ArrowRight' && !inSub && active?.dataset.sub) {
                event.preventDefault();
                showSub(active, true);
            } else if (event.key === 'ArrowLeft' && inSub) {
                event.preventDefault();
                event.stopPropagation();
                closeSub(true);
            } else if (event.key === 'Escape' && inSub) {
                event.preventDefault();
                event.stopPropagation();
                closeSub(true);
            } else if (event.key === 'Escape' || event.key === 'Tab') {
                event.preventDefault();
                event.stopPropagation();
                closeMenuBack();
            }
        };
        // Наведение ведёт фокус: подсветка одна на мышь и клавиатуру. Подменю открывается после короткой паузы, а соседний
        // пункт закрывает открытое не сразу: мышь по пути наискосок к подменю задевает соседей
        const onMove = (event: PointerEvent): void => {
            const panel = event.currentTarget as HTMLElement;
            const item = event.target instanceof Element ? event.target.closest<HTMLElement>('.scw-mi') : null;
            // Движение без сдвига (Chrome шлёт его при прокрутке и смене подсветки) не отнимает меню у клавиатуры
            if (event.movementX || event.movementY) setInput('mouse');
            if (!item || document.activeElement === item) return;
            clearTimeout(hoverTimer);
            if (panel !== root) {
                item.focus({ preventScroll: true });
                return;
            }
            const settle = (): void => {
                if (openSub && openSub.trigger !== item) closeSub(false);
                item.focus({ preventScroll: true });
                if (item.dataset.sub) hoverTimer = setTimeout(() => showSub(item, false), 110);
            };
            if (openSub && openSub.trigger !== item) hoverTimer = setTimeout(settle, 220);
            else settle();
        };
        const onLeave = (event: PointerEvent): void => {
            const panel = event.currentTarget as HTMLElement;
            const active = document.activeElement as HTMLElement | null;
            if (!active || !panel.contains(active) || active === panel) return;
            // Ушла мышь из подменю: подсветка возвращается на его кнопку; из меню — снимается, если подменю не открыто
            if (panel !== root) {
                if (!(event.relatedTarget instanceof Element && root.contains(event.relatedTarget))) openSub?.trigger.focus({ preventScroll: true });
            } else if (!openSub && !(event.relatedTarget instanceof Element && inMenu(event.relatedTarget))) {
                clearTimeout(hoverTimer);
                root.focus({ preventScroll: true });
            }
        };
        for (const panel of all) {
            panel.addEventListener('click', onClick);
            panel.addEventListener('keydown', onKey);
            panel.addEventListener('pointermove', onMove);
            panel.addEventListener('pointerleave', onLeave);
        }
        for (const panel of subs) panel.addEventListener('pointerenter', () => clearTimeout(hoverTimer));
        // В полном экране (режим «Для роликов») видно только содержимое полноэкранного узла: меню встаёт в него
        host.append(root, ...subs);
        panels = subs;
        const width = root.offsetWidth;
        const left = Math.max(8, Math.min(place.right ? place.x - width : place.x, window.innerWidth - width - 8));
        // Меню выше окна не вылезает и под нижний плеер не уходит: низ — верх плеера. Место снизу, не влезает — сверху,
        // не влезает и там — сдвиг в окно. Прокрутка только в совсем низком окне. Меню от кнопки в самом плеере встаёт над ней
        const bar = document.fullscreenElement ? null : document.querySelector('.playControls')?.getBoundingClientRect();
        const bottom = bar && bar.height > 0 && bar.top > 0 && bar.top < window.innerHeight ? bar.top : window.innerHeight;
        const limit = Math.max(bottom, Math.min(place.aboveY, window.innerHeight));
        const room = limit - 16;
        if (root.offsetHeight > room) {
            root.style.maxHeight = room + 'px';
            root.dataset.scroll = '';
        }
        const height = root.offsetHeight;
        const above = place.y + height > bottom - 8 && place.aboveY - height >= 8;
        const top = above ? place.aboveY - height : Math.max(8, Math.min(place.y, limit - height - 8));
        root.style.left = left + 'px';
        root.style.top = top + 'px';
        menuBox = { left, top, bottom: limit };
        // Раскрывается из точки клика или от кнопки
        root.style.transformOrigin = Math.max(0, Math.min(width, place.x - left)) + 'px ' + (above ? 'bottom' : 'top');
        menu = root;
        menuFor = target;
        menuAnchor = anchor;
        menuExtras = extras;
        anchor?.setAttribute('aria-expanded', 'true');
        // Пересобранная кнопка узнаёт по этому, что её меню открыто
        if (anchor?.dataset.trackMenu) root.dataset.anchor = anchor.dataset.trackMenu;
        // От кнопки фокус всегда возвращается к ней. После ПКМ — только открытое с клавиатуры: возвращённый фокус сайт обводит рамкой
        menuReturn = anchor ?? (byKeyboard && from instanceof HTMLElement && from !== document.body ? from : null);
        // Фокус на пункте после ПКМ Chrome считает видимым, и сайт рисует ему синюю рамку
        setInput(byKeyboard ? 'keys' : 'mouse');
        if (byKeyboard) itemsOf(root)[0]?.focus({ preventScroll: true });
        else root.focus({ preventScroll: true });
    }
    // Узел из iframe принадлежит другому окну, и instanceof Element для него ложен
    const asElement = (value: unknown): Element | null =>
        value && typeof value === 'object' && (value as Node).nodeType === 1 ? (value as Element) : null;
    const ready = (): boolean => !!core.player() && core.api() && !core.disposed() && core.state() !== 'unavailable';
    function afterOpen(target: MenuTarget): void {
        void ensureExclusions();
        // Ссылку распознаём заранее, пока выбирают пункт
        if (!target.track && target.url) void resolveUrl(target.url).catch((error: unknown) => console.debug('Волна: ссылка не распознана', error));
    }
    function onContextMenu(event: MouseEvent, frame?: HTMLIFrameElement): void {
        closeMenu();
        if (!ready()) return;
        const node = asElement(event.target);
        const target = node ? (frame ? frameMenuTarget(node) : menuTarget(node)) : null;
        if (!node || !target) return;
        event.preventDefault();
        let { clientX: x, clientY: y } = event;
        // С клавиатуры (Shift+F10) координат нет: меню встаёт под элементом
        const byKeyboard = !x && !y;
        if (byKeyboard) {
            const rect = node.getBoundingClientRect();
            x = rect.left;
            y = rect.bottom;
        }
        // Координаты iframe отсчитываются от его угла, меню живёт в странице
        if (frame) {
            const box = frame.getBoundingClientRect();
            x += box.left;
            y += box.top;
        }
        openMenu(target, { x, y, aboveY: y, right: false }, byKeyboard);
        afterOpen(target);
    }
    function openRequest(request: TrackMenuRequest): boolean {
        const anchor = request.anchor ?? null;
        // Повторное нажатие той же «⋯» закрывает меню
        if (menu && anchor && sameAnchor(menuAnchor, anchor)) {
            closeMenu();
            return true;
        }
        closeMenu();
        if (!ready()) return false;
        const target = request.node ? menuTarget(request.node) : playingTarget();
        if (!target) return false;
        let place: MenuPlace;
        if (anchor) {
            const rect = anchor.getBoundingClientRect();
            place = { x: rect.right, y: rect.bottom + 6, aboveY: rect.top - 6, right: true };
        } else {
            const x = request.x ?? window.innerWidth / 2;
            const y = request.y ?? window.innerHeight / 2;
            place = { x, y, aboveY: y, right: false };
        }
        openMenu(target, place, !!request.byKeyboard, anchor, request.extras ?? []);
        afterOpen(target);
        return true;
    }
    const onOutside = (event: Event): void => {
        if (!menu) return;
        const node = asElement(event.target);
        if (node && (menu.contains(node) || inMenu(node))) return;
        // Нажатие на свою же «⋯»: меню закроет её click, иначе оно закрылось бы здесь и тут же открылось снова
        if (node && menuAnchor && (menuAnchor.contains(node) || sameAnchor(menuAnchor, node.closest('[data-track-menu]')))) return;
        closeMenu();
    };
    const onDocumentKey = (event: KeyboardEvent): void => {
        if (event.key === 'Escape' && menu) closeMenuBack();
    };
    const onPageMenu = (event: MouseEvent): void => onContextMenu(event);

    // Документы iframe того же сайта: в каждый ставятся те же слушатели, что и в страницу.
    // После перехода внутри iframe документ новый, его подхватывает событие load
    const frameCleanups = new Map<Document, () => void>();
    const watchedFrames = new WeakSet<HTMLIFrameElement>();
    function frameDocument(frame: HTMLIFrameElement): Document | null {
        try {
            const doc = frame.contentDocument;
            return doc && doc.defaultView && doc.location.origin === location.origin ? doc : null;
        } catch {
            return null;
        }
    }
    function attachFrame(frame: HTMLIFrameElement): void {
        if (!watchedFrames.has(frame)) {
            watchedFrames.add(frame);
            frame.addEventListener('load', () => {
                if (!core.disposed()) attachFrame(frame);
            });
        }
        const doc = frameDocument(frame);
        if (!doc || frameCleanups.has(doc)) return;
        const onMenu = (event: MouseEvent): void => onContextMenu(event, frame);
        doc.addEventListener('contextmenu', onMenu);
        doc.addEventListener('mousedown', onOutside, true);
        doc.addEventListener('keydown', onDocumentKey);
        doc.addEventListener('scroll', onScroll, true);
        frameCleanups.set(doc, () => {
            doc.removeEventListener('contextmenu', onMenu);
            doc.removeEventListener('mousedown', onOutside, true);
            doc.removeEventListener('keydown', onDocumentKey);
            doc.removeEventListener('scroll', onScroll, true);
        });
    }
    function watchFrames(): void {
        for (const frame of document.querySelectorAll('iframe')) attachFrame(frame);
        // Ушедшие документы iframe: слушатели снимать уже не с кого, запись только занимает память
        for (const doc of [...frameCleanups.keys()]) if (!doc.defaultView) frameCleanups.delete(doc);
    }
    return {
        onPageMenu,
        onOutside,
        onDocumentKey,
        closeMenu,
        startLink: (kind, url, title) => void startSeed(kind, { kind, url, artistUrl: '' }, title),
        startTrack: (track) => void startSeed('track', { kind: 'track', url: track.permalink_url ?? '', artistUrl: track.user?.permalink_url ?? '', track }),
        actOn: (node, act) => {
            const target = menuTarget(node);
            if (!target) return false;
            runMenu(act, target);
            return true;
        },
        actsOn: (node) => {
            const target = menuTarget(node);
            return target ? flatActs(menuItems(target)) : [];
        },
        open: openRequest,
        watchFrames,
        dispose: () => {
            for (const cleanup of frameCleanups.values()) cleanup();
            frameCleanups.clear();
        },
    };
}
