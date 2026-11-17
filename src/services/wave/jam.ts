// «Джем» (2.12.0): общее прослушивание. Плавающая панель с комнатой, очередью и участниками, кнопка с числом слушателей
// в нижнем баре (рядом с режимом «Для роликов») или в слоте [data-sc2-slot="jam"] новой главной, Ctrl+Shift+J (Ctrl+J занят «К дропу»). Раздел страницы:
// installJam уходит на страницу текстом вместе с волной (pageHelpers в wave.ts), поэтому всё, что он зовёт, объявлено
// в нём самом или лежит в jamHelpers (математика из jam/sync.ts, на модуль через пространство имён не ссылаемся).
// Сеть не здесь: комната и WebSocket живут в main (jam/client.ts), страница зовёт soundcloudAPI.jam и получает события.
// Следование: сменился трек джема, играем его на своей сессии SoundCloud и встаём на позицию по часам сервера; расхождение
// больше 2,5 с лечится перемоткой. Свои действия тех, у кого есть право управлять (трек, пауза, перемотка), уходят в комнату.
import type { JamState, JamTrack } from '../jam/protocol';
import * as syncMath from '../jam/sync';

const { expectedPosition, planFollow, isSeekJump, shouldAdvance } = syncMath;
/** Математика для страницы: объявления уходят рядом с installJam */
export const jamHelpers = [expectedPosition, planFollow, isSeekJump, shouldAdvance];

export interface JamLocal {
    track: JamTrack;
    positionMs: number;
    playing: boolean;
}
export interface JamCore {
    lang: 'ru' | 'en';
    disposed(): boolean;
    /** soundcloudAPI.jam из preload; undefined, если клиент без него */
    api(): object | undefined;
    /** Играющий трек сайта; null — ничего не играет или у трека нет публичной ссылки */
    current(): JamLocal | null;
    seek(ms: number): void;
    setPlaying(on: boolean): void;
}
export interface JamSection {
    open(): void;
    close(): void;
    isOpen(): boolean;
    /** Раз в секунду из слежения волны: кнопка в баре и слот главной */
    sync(): void;
    /** Поставить кнопку в слот новой главной: сама следит, чтобы осталась там */
    mount(slot: HTMLElement): void;
    dispose(): void;
}

export function installJam(core: JamCore): JamSection {
    interface Api {
        create(name: string, avatar: string): Promise<{ ok: boolean; code?: string; error?: string }>;
        join(code: string, name: string, avatar: string): Promise<{ ok: boolean; code?: string; error?: string }>;
        leave(): Promise<unknown>;
        send(msg: unknown): Promise<unknown>;
        snapshot(): Promise<{ configured: boolean; events: UiEvent[] } | null>;
        copy?(code: string, kind: 'code' | 'link'): Promise<boolean>;
        onState(callback: (event: unknown) => void): () => void;
    }
    type UiEvent =
        | { type: 'status'; status: 'idle' | 'connecting' | 'open' | 'reconnecting'; attempt?: number; reason?: string }
        | { type: 'state'; state: JamState; you: string; offset: number; synced: boolean }
        | { type: 'clock'; offset: number }
        | { type: 'error'; code: string };
    interface Snap {
        id: number;
        positionMs: number;
        playing: boolean;
        at: number;
    }
    const ru = core.lang === 'ru';
    const T = ru
        ? {
              title: 'Джем', short: 'С другом', aria: 'Слушать вместе с другом', failed: 'Не удалось скопировать', copyLink: 'Копировать ссылку-приглашение', create: 'Создать джем', join: 'Войти', codePlaceholder: 'Код или sc2://jam/…', leave: 'Выйти',
              notConfigured: 'Сервер джемов не настроен', hint: 'Укажи адрес в настройках F1: Дополнительно, «Сервер джемов».', copy: 'Копировать код', copied: 'Скопировано',
              members: 'Слушатели', queue: 'Очередь', empty: 'Очередь пуста', addNow: 'Добавить играющий трек', host: 'хозяин', canControl: 'может управлять',
              kick: 'Выгнать', remove: 'Убрать', playNow: 'Играть', up: 'Выше', everyoneAdd: 'Все могут добавлять', everyoneControl: 'Все могут управлять',
              nowPlaying: 'Играет', nothing: 'Ничего не играет', resync: 'Синхронизироваться', connecting: 'Подключаюсь…', reconnecting: 'Связь потеряна, переподключаюсь…',
              invite: 'Друг вводит этот код в «Джем» (Ctrl+Shift+J)', close: 'Закрыть', you: 'ты', addedBy: 'добавил',
              errors: {
                  'not-configured': 'Сервер джемов не настроен', invalid: 'Неверный код', busy: 'Сервер занят, попробуй ещё раз', unreachable: 'Сервер джемов недоступен',
                  'not-found': 'Такого джема нет или он закончился', full: 'В джеме нет мест', kicked: 'Тебя убрали из джема', expired: 'Джем закончился', network: 'Связь с джемом потеряна',
                  forbidden: 'Это может только хозяин или тот, кому разрешили', rate: 'Слишком часто, подожди секунду', 'queue-full': 'Очередь заполнена', 'too-big': 'Слишком большое сообщение',
                  unavailable: 'Трек недоступен у тебя', noLink: 'У этого трека нет публичной ссылки',
              } as Record<string, string>,
          }
        : {
              title: 'Jam', short: 'Together', aria: 'Listen together with a friend', failed: 'Could not copy', copyLink: 'Copy invite link', create: 'Start a jam', join: 'Join', codePlaceholder: 'Code or sc2://jam/…', leave: 'Leave',
              notConfigured: 'Jam server is not set up', hint: 'Set the address in F1 settings: Advanced, “Jam server”.', copy: 'Copy code', copied: 'Copied',
              members: 'Listeners', queue: 'Queue', empty: 'The queue is empty', addNow: 'Add the playing track', host: 'host', canControl: 'can control',
              kick: 'Remove', remove: 'Remove', playNow: 'Play', up: 'Move up', everyoneAdd: 'Everyone can add', everyoneControl: 'Everyone can control',
              nowPlaying: 'Now playing', nothing: 'Nothing is playing', resync: 'Sync now', connecting: 'Connecting…', reconnecting: 'Connection lost, reconnecting…',
              invite: 'A friend enters this code in “Jam” (Ctrl+Shift+J)', close: 'Close', you: 'you', addedBy: 'added by',
              errors: {
                  'not-configured': 'Jam server is not set up', invalid: 'Wrong code', busy: 'The server is busy, try again', unreachable: 'The jam server is unreachable',
                  'not-found': 'No such jam, or it has ended', full: 'The jam is full', kicked: 'You were removed from the jam', expired: 'The jam has ended', network: 'Lost connection to the jam',
                  forbidden: 'Only the host or someone allowed can do that', rate: 'Too fast, wait a second', 'queue-full': 'The queue is full', 'too-big': 'Message too large',
                  unavailable: 'The track is unavailable for you', noLink: 'This track has no public link',
              } as Record<string, string>,
          };

    const ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="6" cy="5" r="2.4"/><path d="M1.2 13.5a4.8 4.8 0 0 1 9.6 0z"/><circle cx="11.6" cy="5.6" r="1.9"/><path d="M11.6 8.5a3.7 3.7 0 0 1 3.5 5h-2.9a6.3 6.3 0 0 0-1.5-3.6 3.7 3.7 0 0 1 .9-1.4z"/></svg>';
    const STYLE_ID = 'sc-jam-style';
    const api = (): Api | undefined => core.api() as Api | undefined;
    const reduced = (): boolean => document.documentElement.classList.contains('scm-reduce') || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);

    let panel: HTMLElement | null = null;
    let button: HTMLButtonElement | null = null;
    let status: 'idle' | 'connecting' | 'open' | 'reconnecting' = 'idle';
    let state: JamState | null = null;
    let you = '';
    let offset = 0;
    let configured: boolean | null = null;
    let message = '';
    let busyStart = false;
    let draftCode = '';
    let copiedAt = 0;
    let copiedKind: 'code' | 'link' = 'code';
    let unsubscribe: (() => void) | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    let paintTimer: ReturnType<typeof setTimeout> | undefined;
    let returnFocus: HTMLElement | null = null;
    // Слежение за плеером
    let last: Snap | null = null;
    let grantedUntil = 0;
    let opening = false;
    let advanced = '';
    let followKey = '';

    const serverNow = (): number => Date.now() + offset;
    const me = () => state?.members.find((member) => member.id === you) ?? null;
    const controls = (): boolean => {
        const member = me();
        return !!member && !!state && (member.isHost || member.canControl || state.settings.everyoneCanControl);
    };
    const canAddNow = (): boolean => controls() || (!!me() && !!state?.settings.everyoneCanAdd);
    const isHost = (): boolean => !!me()?.isHost;
    const send = (msg: object): void => {
        void api()?.send(msg);
    };
    function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text) node.textContent = text;
        return node;
    }
    function action(label: string, onClick: () => void, className = 'scj-btn'): HTMLButtonElement {
        const node = el('button', className, label);
        node.type = 'button';
        node.addEventListener('click', onClick);
        return node;
    }
    // eslint-disable-next-line no-control-regex
    const clean = (value: string, max: number): string => value.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, max);

    /** Трек для комнаты из играющего: поля обрезаются под лимиты сервера, ссылка и картинка только свои; null — делиться нечем */
    function refOf(local: JamLocal | null): JamTrack | null {
        if (!local) return null;
        const t = local.track;
        if (!/^https:\/\/soundcloud\.com\/[a-z0-9_-]{1,100}\/[a-z0-9_-]{1,255}$/i.test(t.url) || t.url.length > 160) return null;
        const art = /^https:\/\/[a-z0-9.-]+\.sndcdn\.com\/[A-Za-z0-9_./%?&=+~-]*$/.test(t.artwork) && t.artwork.length <= 160 ? t.artwork : '';
        return { id: t.id, url: t.url, title: clean(t.title, 100), artist: clean(t.artist, 60), artwork: art, durationMs: Math.max(0, Math.min(Math.round(t.durationMs) || 0, 86400000)) };
    }
    function pathOf(url: string): string {
        const found = /^https:\/\/soundcloud\.com(\/[a-z0-9_-]{1,100}\/[a-z0-9_-]{1,255})$/i.exec(url);
        return found ? found[1] : '';
    }
    function toast(text: string): void {
        message = text;
        schedulePaint();
    }
    /** Запасной путь: временное поле и execCommand('copy'); true, только если браузер сказал, что скопировал */
    function copyFallback(text: string): boolean {
        const area = document.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', '');
        area.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
        const keep = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        document.body.append(area);
        let done: boolean;
        try {
            area.focus({ preventScroll: true });
            area.select();
            done = document.execCommand('copy');
        } catch {
            done = false;
        }
        area.remove();
        keep?.focus({ preventScroll: true });
        return done;
    }
    /** Код (или ссылка sc2://jam/КОД) в буфер: сначала через main (Electron clipboard), потом запасной путь. «Скопировано» только по факту */
    async function copyOut(code: string, kind: 'code' | 'link'): Promise<void> {
        let ok: boolean;
        try {
            ok = (await api()?.copy?.(code, kind)) === true;
        } catch {
            ok = false;
        }
        if (!ok) ok = copyFallback(kind === 'link' ? 'sc2://jam/' + code : code);
        if (ok) {
            copiedAt = Date.now();
            copiedKind = kind;
            setTimeout(schedulePaint, 1600);
            schedulePaint();
        } else toast(T.failed);
    }
    function errorText(code: string | undefined): string {
        return (code && T.errors[code]) || T.errors.unreachable;
    }

    // ---- Следование за комнатой ----
    /** Привести плеер к состоянию комнаты: после события от сервера и по кнопке «Синхронизироваться» */
    function follow(): void {
        const now = state?.now ?? null;
        if (!now) return;
        const local = core.current();
        const plan = planFollow(now, serverNow(), local ? { trackId: local.track.id, positionMs: local.positionMs, playing: local.playing } : null);
        if (plan.open) {
            void openJam();
            return;
        }
        if (plan.setPlaying !== null) core.setPlaying(plan.setPlaying);
        if (plan.seekTo !== null) core.seek(plan.seekTo);
        if (plan.setPlaying !== null || plan.seekTo !== null) grantedUntil = Date.now() + 2000;
    }
    async function openJam(): Promise<void> {
        const now = state?.now;
        if (!now || opening) return;
        const path = pathOf(now.track.url);
        const open = (window as unknown as { __scOpenTrack?: (path: string, navigate?: boolean) => Promise<string> }).__scOpenTrack;
        if (!path || !open) return;
        opening = true;
        try {
            const result = await open(path, false);
            if (result === 'unavailable' || result === 'failed') toast(T.errors.unavailable);
        } catch (error) {
            console.warn('Джем: трек не открылся', error);
        } finally {
            opening = false;
        }
        grantedUntil = Date.now() + 2500;
        // Сайт ставит трек не мгновенно: перематываем чуть позже, остаток доведёт слежение за расхождением
        setTimeout(() => {
            if (core.disposed() || !state?.now || state.now.track.id !== now.track.id) return;
            const want = expectedPosition(state.now, serverNow());
            if (want > 1500) core.seek(want);
            if (state.now.paused) core.setPlaying(false);
        }, 800);
    }
    const nowKey = (): string => (state?.now ? state.now.track.id + ':' + state.now.startedAt + ':' + state.now.paused + ':' + state.now.positionMs : '');

    function tick(): void {
        if (!state || core.disposed()) return;
        const t = Date.now();
        const jam = state.now;
        const local = core.current();
        const snap: Snap | null = local ? { id: local.track.id, positionMs: local.positionMs, playing: local.playing, at: t } : null;
        const before = last;
        last = snap;
        // Хозяин: трек доиграл (был в последних секундах и пропал или встал) или время по часам сервера давно вышло
        if (isHost() && jam) {
            const ended = !!before && before.id === jam.track.id && jam.track.durationMs > 0 && before.positionMs >= jam.track.durationMs - 2500 && (!snap || snap.id !== before.id || !snap.playing);
            const key = jam.track.id + ':' + jam.startedAt;
            if (advanced !== key && shouldAdvance(jam, serverNow(), ended)) {
                advanced = key;
                send({ t: 'next', from: jam.track.id });
                return;
            }
        }
        if (!snap || !local || opening) return;
        let jumped = false;
        if (before && before.id === snap.id) jumped = isSeekJump(before.positionMs, snap.positionMs, t - before.at, before.playing && snap.playing);
        const quiet = t >= grantedUntil;
        // Свои действия тех, кто управляет: новый трек, пауза и возобновление, перемотка
        if (controls() && before && quiet) {
            if (before.id !== snap.id && snap.id !== jam?.track.id) {
                const ref = refOf(local);
                if (ref) send({ t: 'play', track: ref, positionMs: Math.round(snap.positionMs) });
                else toast(T.errors.noLink);
                return;
            }
            if (jam && snap.id === jam.track.id) {
                if (before.playing !== snap.playing && snap.playing === jam.paused) {
                    send({ t: snap.playing ? 'resume' : 'pause' });
                    return;
                }
                if (jumped && snap.playing === !jam.paused) {
                    send({ t: 'seek', positionMs: Math.round(snap.positionMs) });
                    return;
                }
            }
        }
        // Остальным и без действий: расхождение больше 2,5 с лечится перемоткой. Подвисание буфера не прыжок и тоже лечится
        if (jam && !jam.paused && snap.id === jam.track.id && snap.playing && quiet && !(controls() && jumped)) {
            const want = expectedPosition(jam, serverNow());
            if (Math.abs(snap.positionMs - want) > 2500) {
                core.seek(want);
                grantedUntil = t + 1500;
            }
        }
    }

    // ---- События от main ----
    function onEvent(raw: unknown): void {
        if (!raw || typeof raw !== 'object') return;
        const event = raw as UiEvent;
        if (event.type === 'status') {
            status = event.status;
            if (status === 'idle') {
                state = null;
                you = '';
                last = null;
                if (event.reason) message = errorText(event.reason);
            } else if (status === 'open') message = '';
        } else if (event.type === 'state') {
            const first = !state;
            const keyBefore = nowKey();
            state = event.state;
            you = event.you;
            offset = event.offset;
            if (nowKey() !== keyBefore || first) {
                const key = nowKey();
                // Повтор того же состояния (своё эхо) ничего не двигает: planFollow сам вернёт «ничего»
                if (key !== followKey || first) {
                    followKey = key;
                    follow();
                }
            }
        } else if (event.type === 'clock') offset = event.offset;
        else if (event.type === 'error') message = errorText(event.code);
        syncButton();
        schedulePaint();
    }
    async function me2(): Promise<{ name: string; avatar: string }> {
        try {
            const people = (window as unknown as { __scPeople?: (paths: string[]) => Promise<{ me: { username: string; avatar: string } | null } | null> }).__scPeople;
            const found = people ? await people([]) : null;
            return { name: found?.me?.username || '', avatar: found?.me?.avatar || '' };
        } catch {
            return { name: '', avatar: '' };
        }
    }
    async function start(code: string | null): Promise<void> {
        const jam = api();
        if (!jam || busyStart) return;
        busyStart = true;
        message = T.connecting;
        paint();
        const who = await me2();
        const name = who.name || (ru ? 'Гость' : 'Guest');
        try {
            const result = code === null ? await jam.create(name, who.avatar) : await jam.join(code, name, who.avatar);
            message = result.ok ? '' : errorText(result.error);
            if (result.ok) status = 'connecting';
        } catch (error) {
            console.warn('Джем: не запустился', error);
            message = T.errors.unreachable;
        }
        busyStart = false;
        schedulePaint();
    }
    function leave(): void {
        void api()?.leave();
        state = null;
        status = 'idle';
        message = '';
        syncButton();
        schedulePaint();
    }

    // ---- Вид ----
    function schedulePaint(): void {
        if (!panel || paintTimer) return;
        paintTimer = setTimeout(() => {
            paintTimer = undefined;
            paint();
        }, 60);
    }
    function avatar(url: string, name: string): HTMLElement {
        const node = el('span', 'scj-av');
        if (url) {
            const img = el('img');
            img.src = url;
            img.alt = '';
            img.loading = 'lazy';
            img.decoding = 'async';
            node.append(img);
        } else node.textContent = (name.trim()[0] || '?').toUpperCase();
        return node;
    }
    function toggle(label: string, on: boolean, enabled: boolean, onChange: (value: boolean) => void): HTMLElement {
        const row = el('label', 'scj-row' + (enabled ? '' : ' off'));
        const box = el('input');
        box.type = 'checkbox';
        box.checked = on;
        box.disabled = !enabled;
        box.addEventListener('change', () => onChange(box.checked));
        row.append(el('span', 'scj-grow', label), box);
        return row;
    }
    function paint(): void {
        if (!panel) return;
        const focused = document.activeElement;
        const keepCode = focused instanceof HTMLInputElement && focused.dataset.jam === 'code';
        panel.textContent = '';
        const head = el('div', 'scj-head');
        head.append(el('div', 'scj-title', T.title), action('×', () => close(), 'scj-x'));
        head.lastElementChild?.setAttribute('aria-label', T.close);
        panel.append(head);
        if (configured === false) {
            panel.append(el('div', 'scj-warn', T.notConfigured), el('div', 'scj-hint', T.hint));
            return;
        }
        if (!state) {
            const form = el('div', 'scj-form');
            const create = action(T.create, () => void start(null), 'scj-btn primary');
            create.disabled = busyStart;
            const input = el('input', 'scj-input');
            input.type = 'text';
            input.dataset.jam = 'code';
            input.placeholder = T.codePlaceholder;
            input.maxLength = 40;
            input.value = draftCode;
            input.setAttribute('aria-label', T.codePlaceholder);
            input.addEventListener('input', () => { draftCode = input.value; });
            input.addEventListener('keydown', (event) => {
                event.stopPropagation();
                if (event.key === 'Enter') void start(input.value);
            });
            const join = action(T.join, () => void start(input.value));
            join.disabled = busyStart;
            const line = el('div', 'scj-line');
            line.append(input, join);
            form.append(create, el('div', 'scj-or', ru ? 'или по коду друга' : 'or with a friend’s code'), line);
            panel.append(form);
            if (message) panel.append(el('div', 'scj-msg', message));
            if (keepCode) input.focus({ preventScroll: true });
            return;
        }
        const st = state;
        const host = isHost();
        // Код комнаты
        const code = el('div', 'scj-code');
        const copiedNow = Date.now() - copiedAt < 1500;
        code.append(el('span', 'scj-codetext', st.code), action(copiedNow && copiedKind === 'code' ? T.copied : T.copy, () => void copyOut(st.code, 'code')));
        panel.append(code, el('div', 'scj-hint', T.invite));
        panel.append(action(copiedNow && copiedKind === 'link' ? T.copied : T.copyLink, () => void copyOut(st.code, 'link')));
        if (status !== 'open') panel.append(el('div', 'scj-msg', status === 'reconnecting' ? T.reconnecting : T.connecting));
        else if (message) panel.append(el('div', 'scj-msg', message));
        // Играет сейчас
        const now = st.now;
        const nowBox = el('div', 'scj-now');
        nowBox.append(el('div', 'scj-label', T.nowPlaying));
        nowBox.append(el('div', 'scj-track', now ? now.track.title : T.nothing));
        if (now) nowBox.append(el('div', 'scj-sub', now.track.artist));
        const local = core.current();
        if (now && (!local || local.track.id !== now.track.id)) nowBox.append(action(T.resync, () => follow()));
        panel.append(nowBox);
        // Участники
        panel.append(el('div', 'scj-label', T.members + ' · ' + st.members.length));
        const list = el('ul', 'scj-list');
        for (const member of st.members) {
            const item = el('li', 'scj-item');
            const who = el('div', 'scj-grow');
            who.append(el('div', 'scj-name', member.name + (member.id === you ? ' (' + T.you + ')' : '')));
            if (member.isHost) who.append(el('div', 'scj-sub', T.host));
            item.append(avatar(member.avatar, member.name), who);
            if (host && !member.isHost) {
                const label = el('label', 'scj-mini');
                const box = el('input');
                box.type = 'checkbox';
                box.checked = member.canControl;
                box.addEventListener('change', () => send({ t: 'grant', id: member.id, on: box.checked }));
                label.append(box, el('span', '', T.canControl));
                item.append(label, action('×', () => send({ t: 'kick', id: member.id }), 'scj-x'));
                item.lastElementChild?.setAttribute('aria-label', T.kick);
            } else if (member.canControl && !member.isHost) item.append(el('span', 'scj-sub', T.canControl));
            list.append(item);
        }
        panel.append(list);
        // Очередь
        panel.append(el('div', 'scj-label', T.queue + ' · ' + st.queue.length));
        if (!st.queue.length) panel.append(el('div', 'scj-hint', T.empty));
        const queue = el('ul', 'scj-list');
        const mayControl = controls();
        st.queue.forEach((track, index) => {
            const item = el('li', 'scj-item');
            const body = el('div', 'scj-grow');
            body.append(el('div', 'scj-name', track.title), el('div', 'scj-sub', track.artist + ' · ' + T.addedBy + ' ' + track.addedBy));
            item.append(avatar(track.artwork, track.title), body);
            if (mayControl) {
                item.append(action('▶', () => send({ t: 'play', track: { id: track.id, url: track.url, title: track.title, artist: track.artist, artwork: track.artwork, durationMs: track.durationMs }, positionMs: 0, qid: track.qid }), 'scj-x'));
                item.lastElementChild?.setAttribute('aria-label', T.playNow);
                if (index > 0) {
                    item.append(action('↑', () => send({ t: 'move', qid: track.qid, to: index - 1 }), 'scj-x'));
                    item.lastElementChild?.setAttribute('aria-label', T.up);
                }
            }
            if (mayControl || track.addedBy === me()?.name) {
                item.append(action('×', () => send({ t: 'remove', qid: track.qid }), 'scj-x'));
                item.lastElementChild?.setAttribute('aria-label', T.remove);
            }
            queue.append(item);
        });
        panel.append(queue);
        if (canAddNow()) {
            const add = action(T.addNow, () => {
                const ref = refOf(core.current());
                if (ref) send({ t: 'add', track: ref });
                else toast(core.current() ? T.errors.noLink : T.nothing);
            });
            add.disabled = !core.current();
            panel.append(add);
        }
        // Настройки: меняет хозяин, остальные видят
        panel.append(
            toggle(T.everyoneAdd, st.settings.everyoneCanAdd, host, (value) => send({ t: 'settings', everyoneCanAdd: value })),
            toggle(T.everyoneControl, st.settings.everyoneCanControl, host, (value) => send({ t: 'settings', everyoneCanControl: value })),
            action(T.leave, () => leave(), 'scj-btn danger'),
        );
    }
    function buildStyle(): void {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = [
            '.scj{position:fixed;right:16px;bottom:84px;z-index:2147482000;width:340px;max-width:calc(100vw - 32px);max-height:min(72vh,600px);overflow:auto;box-sizing:border-box;padding:14px;border-radius:18px;color:#fff;font:600 13px/1.35 inherit;',
            'background:linear-gradient(180deg,rgba(28,30,40,.78),rgba(10,11,16,.86));backdrop-filter:blur(24px) saturate(1.5);-webkit-backdrop-filter:blur(24px) saturate(1.5);box-shadow:inset 0 0 0 1px rgba(255,255,255,.12),0 20px 50px -20px rgba(0,0,0,.8);',
            'opacity:0;transform:translateY(8px);transition:opacity .18s ease,transform .18s ease}',
            '.scj.on{opacity:1;transform:none}',
            '.scj *{box-sizing:border-box}',
            '.scj-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}',
            '.scj-title{font-size:15px;font-weight:800}',
            '.scj-label{margin:12px 0 6px;font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:rgba(255,255,255,.55)}',
            '.scj-hint,.scj-sub{font-size:12px;font-weight:600;color:rgba(255,255,255,.55)}',
            '.scj-warn{font-size:14px;font-weight:800;margin:6px 0}',
            '.scj-msg{margin:8px 0;padding:7px 10px;border-radius:10px;background:rgba(255,255,255,.08);font-size:12px}',
            '.scj-code{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:6px 0 4px}',
            '.scj-codetext{font-size:34px;font-weight:900;letter-spacing:.14em;font-variant-numeric:tabular-nums}',
            '.scj-btn{appearance:none;border:0;border-radius:999px;padding:7px 14px;margin:6px 0 0;background:rgba(255,255,255,.1);color:#fff;font:inherit;font-weight:700;cursor:pointer;box-shadow:inset 0 0 0 1px rgba(255,255,255,.1)}',
            '.scj-btn:hover:not(:disabled){background:rgba(255,255,255,.18)}.scj-btn:disabled{opacity:.5;cursor:default}',
            '.scj-btn.primary{background:#f50;box-shadow:none}.scj-btn.primary:hover:not(:disabled){background:#ff6a26}',
            '.scj-btn.danger{display:block;margin-top:12px}',
            '.scj-x{appearance:none;border:0;border-radius:8px;min-width:26px;height:26px;padding:0 6px;background:transparent;color:rgba(255,255,255,.75);font:inherit;font-weight:800;cursor:pointer}.scj-x:hover{background:rgba(255,255,255,.14);color:#fff}',
            '.scj-form{display:flex;flex-direction:column;gap:2px}.scj-or{margin:10px 0 2px;font-size:12px;color:rgba(255,255,255,.55)}',
            '.scj-line{display:flex;gap:8px;align-items:center}.scj-line .scj-btn{margin:0}',
            '.scj-input{flex:1;min-width:0;border:0;border-radius:10px;padding:8px 10px;background:rgba(255,255,255,.1);color:#fff;font:inherit;box-shadow:inset 0 0 0 1px rgba(255,255,255,.12)}.scj-input::placeholder{color:rgba(255,255,255,.4)}',
            '.scj-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px}',
            '.scj-item{display:flex;align-items:center;gap:8px;padding:4px 2px}',
            '.scj-grow{flex:1;min-width:0}.scj-name,.scj-track{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.scj-track{font-size:14px;font-weight:800}',
            '.scj-sub{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
            '.scj-av{flex:none;width:30px;height:30px;border-radius:50%;overflow:hidden;display:grid;place-items:center;background:rgba(255,255,255,.14);font-weight:800}.scj-av img{width:100%;height:100%;object-fit:cover;display:block}',
            '.scj-mini{display:flex;align-items:center;gap:5px;font-size:11px;color:rgba(255,255,255,.7);cursor:pointer}',
            '.scj-row{display:flex;align-items:center;gap:10px;margin-top:8px;cursor:pointer}.scj-row.off{opacity:.6;cursor:default}',
            '.scj input[type=checkbox]{accent-color:#f50}',
            '.scj-chip{display:inline-flex;align-items:center;gap:6px;border:0;border-radius:999px;background:rgba(255,255,255,.06);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08);color:inherit;font:inherit;font-weight:700;cursor:pointer;padding:0 10px;height:30px}',
            '.scj-chip svg{width:16px;height:16px;fill:currentColor;flex:none}.scj-chip.live{background:rgba(255,85,0,.22);box-shadow:inset 0 0 0 1px rgba(255,85,0,.5)}',
            // Подпись «Джем · N» в одну строку: в тесном баре она переносилась, и «· 1» падало под слово
            '.scj-chip{flex:none;white-space:nowrap;line-height:1}.scj-chip .scj-n{font-size:12px;white-space:nowrap}.scj-chip.bar{margin:0 6px;align-self:center}',
            // Сетка панели: кнопки по левому краю, строки настроек «подпись слева, галочка справа» с одинаковыми отступами
            '.scj>.scj-btn,.scj-now>.scj-btn{display:block;margin:8px 0 0}',
            '.scj-row{justify-content:space-between;min-height:28px;margin-top:4px;padding:0 2px}.scj-row .scj-grow{flex:1 1 auto}',
            '.scj-row input[type=checkbox],.scj-mini input[type=checkbox]{flex:none;width:16px;height:16px;margin:0}',
            '.scj-mini{flex:none;white-space:nowrap}',
            '@media (prefers-reduced-motion:reduce){.scj{transition:none;transform:none}}',
            'html.scm-reduce .scj{transition:none;transform:none}',
        ].join('');
        document.head.append(style);
    }
    function makeButton(): HTMLButtonElement {
        const node = el('button', 'scj-chip bar');
        node.type = 'button';
        node.innerHTML = ICON + '<span class="scj-n"></span>';
        node.title = T.aria + ' (Ctrl+Shift+J)';
        node.dataset.sc2Jam = 'button';
        node.setAttribute('aria-label', T.aria);
        node.setAttribute('aria-haspopup', 'dialog');
        node.addEventListener('click', () => (panel ? close() : open()));
        return node;
    }
    /** Подпись кнопки: «Джем · N» пока подключены */
    function syncButton(): void {
        if (!button) return;
        const live = status !== 'idle' && !!state;
        button.classList.toggle('live', live);
        const label = button.querySelector('.scj-n');
        if (label) label.textContent = live ? T.title + ' · ' + state!.members.length : T.short;
        button.setAttribute('aria-pressed', String(!!panel));
    }
    function sync(): void {
        if (core.disposed()) return;
        const jam = api();
        if (!jam) return;
        buildStyle();
        button ??= makeButton();
        const target = document.querySelector<HTMLElement>('[data-sc2-slot="jam"]');
        if (target) {
            button.classList.remove('bar');
            if (button.parentElement !== target) target.append(button);
        } else {
            // После громкости, а не перед ней: перед ней стоит кнопка режима роликов и их проверки друг другу не мешают
            const volume = document.querySelector('.playControls .scv[data-kind="bar"]');
            button.classList.add('bar');
            if (volume?.parentElement && volume.nextElementSibling !== button) volume.after(button);
        }
        syncButton();
    }
    function onKey(event: KeyboardEvent): void {
        if (panel && event.key === 'Escape' && !event.defaultPrevented) {
            close();
            return;
        }
        if (event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey && event.code === 'KeyJ') {
            event.preventDefault();
            if (panel) close();
            else open();
        }
    }
    function open(): void {
        if (panel || core.disposed() || !api()) return;
        buildStyle();
        returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        panel = el('div', 'scj');
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', T.title);
        document.body.append(panel);
        paint();
        void api()?.snapshot().then((snap) => {
            if (!snap) return;
            configured = snap.configured;
            for (const event of snap.events) onEvent(event);
            schedulePaint();
        }).catch(() => undefined);
        if (reduced()) panel.classList.add('on');
        else {
            void panel.offsetWidth;
            panel.classList.add('on');
        }
        syncButton();
    }
    function close(): void {
        if (!panel) return;
        panel.remove();
        panel = null;
        clearTimeout(paintTimer);
        paintTimer = undefined;
        syncButton();
        if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
        returnFocus = null;
    }

    // Подписка живёт всё время: джем идёт и при закрытой панели. Состояние после перезагрузки сайта берём у main
    const jam = api();
    if (jam) {
        unsubscribe = jam.onState(onEvent);
        void jam.snapshot().then((snap) => {
            if (!snap) return;
            configured = snap.configured;
            for (const event of snap.events) onEvent(event);
        }).catch(() => undefined);
        timer = setInterval(() => {
            try { tick(); } catch (error) { console.error('Джем: слежение', error); }
        }, 1000);
    }
    window.addEventListener('keydown', onKey, true);
    return {
        open,
        close,
        isOpen: () => !!panel,
        sync,
        mount(target) {
            button ??= makeButton();
            button.classList.remove('bar');
            target.append(button);
            syncButton();
        },
        dispose() {
            close();
            clearInterval(timer);
            window.removeEventListener('keydown', onKey, true);
            unsubscribe?.();
            button?.remove();
            document.getElementById(STYLE_ID)?.remove();
        },
    };
}
