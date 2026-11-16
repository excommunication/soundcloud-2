// Режим «Для роликов» (2.9.0, 2.10.0): обложка играющего трека на всё окно, чтобы снять видео для TikTok. Фон из той же
// обложки, размытый; поверх минимум: название, исполнитель, полоса времени. Вертикальный кадр 9:16 одной кнопкой.
// 2.10.0: текст песни прямо на обложке в двух стилях (L): «Поток» — строки едут снизу вверх, слова загораются в такт;
// «Удар» — одна строка крупно, слова выпрыгивают по одному. Обложка трясётся и дышит под бит (удар баса из переливов,
// --sca-kick и --sca-sx/sy), а на каждой новой строке даёт толчок, даже если переливы выключены. Перемотка: полоса
// времени тянется и щёлкается, колесо мыши и стрелки ←/→ по 5 с (Shift — 15 с), щелчок по строке текста — к ней.
// Esc, кнопка «Закрыть» или повторное нажатие кнопки режима сворачивают обратно; F — полный экран, V — кадр 9:16,
// H — спрятать подписи, L — стиль текста, P — текст сбоку (2.10.1): обложка слева остаётся чистой, а текст идёт отдельной
// колонкой справа, как в Spotify; в кадре 9:16 колонка под обложкой. «Поток» набран шрифтом самого сайта, «Удар» — Montserrat
// Black (шрифт вшит в клиент, OFL), пробел — пауза.
// 2.10.3: полоса времени стала волной, которая бьётся в такт (анализатор на цепочке звука сайта), кнопка записи ролика в MP4 (R,
// Shift+R — 15 с; кадр страницы снимает getDisplayMedia, в файл идёт только вырез кадра и звук трека), «Эффекты на бит» (B) и значок
// sc2 с QR-кодом (Q). Всё это выключено, пока режим закрыт, и не работает при «уменьшить движение».
// Раздел страницы волны: installClip уходит на страницу текстом (pageHelpers в wave.ts) и ни на что снаружи не ссылается
export interface ClipWord {
    at: number;
    text: string;
}
export interface ClipLine {
    at: number;
    text: string;
    words: ClipWord[];
}
export interface ClipLyrics {
    /** Строки с временем; null — текст без времени */
    lines: ClipLine[] | null;
    plain: string;
}
export interface ClipNow {
    id: number;
    title: string;
    artist: string;
    /** Обложка 500×500; крупнее страница пробует сама */
    art: string;
    /** 0..1 */
    progress: number;
    positionMs: number;
    durationMs: number;
    playing: boolean;
    /** undefined — ещё ищется, null — не нашлось */
    lyrics: ClipLyrics | null | undefined;
}
export interface ClipCore {
    lang: 'ru' | 'en';
    now(): ClipNow | null;
    togglePlay(): void;
    seek(ms: number): void;
    /** Слышимая громкость 0..1, выключенный звук — 0 (нижняя панель, 2.10.2) */
    volume(): number;
    setVolume(value: number): void;
    toggleMute(): void;
    /** Лайк играющего трека; null — кнопки лайка на странице нет */
    liked(): boolean | null;
    toggleLike(): void;
    disposed(): boolean;
    /** Звуковая цепочка сайта у играющего трека (анализатор волны, звук для записи); null — недоступна */
    audioTap?(): { context: BaseAudioContext; gain: AudioNode } | null;
    /** Разметка SVG значка с QR-кодом ссылки на репозиторий (кодировщик из wave/qr.ts лежит на странице отдельно от этого раздела) */
    qr?(): string;
    /** Запись ролика: разрешение main на захват кадра и сохранение файла; нет — кнопка записи говорит, что недоступна */
    record?: { arm(state: string): Promise<unknown>; save(data: ArrayBuffer, name: string, ext: string): Promise<unknown> };
    /** Шрифт «Удара» (Montserrat, base64 woff2): латиница и кириллица */
    fonts?: { latin: string; cyrillic: string };
}
export interface ClipSection {
    /** Кнопка режима для карточки волны: каждый раз тот же узел */
    button(): HTMLButtonElement;
    open(): void;
    close(): void;
    isOpen(): boolean;
    /** Кнопка в нижнем баре, если сайт его перерисовал */
    sync(): void;
    dispose(): void;
}
export type ClipLyricStyle = 'flow' | 'punch' | 'off';

/** Обложка крупнее: у SoundCloud картинка «original» лежит рядом с t500x500 */
export function clipArtwork(url: string): string {
    return /-t500x500\.(jpg|png)(\?|$)/.test(url) ? url.replace(/-t500x500\.(jpg|png)/, '-original.$1') : url;
}
/** Размер кадра 9:16 в окне: во всю высоту, а в узком окне во всю ширину */
export function verticalFrame(width: number, height: number): { width: number; height: number } {
    if (!(width > 0) || !(height > 0)) return { width: 0, height: 0 };
    const byHeight = Math.round((height * 9) / 16);
    return byHeight <= width ? { width: byHeight, height: Math.round(height) } : { width: Math.round(width), height: Math.round((width * 16) / 9) };
}
/** Номер строки, которая уже началась к моменту ms; -1 до первой */
export function clipLineAt(lines: Array<{ at: number }>, ms: number): number {
    let lo = 0;
    let hi = lines.length - 1;
    let found = -1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (lines[mid].at <= ms) {
            found = mid;
            lo = mid + 1;
        } else hi = mid - 1;
    }
    return found;
}
/** Перемотка на delta мс в пределах трека */
export function clipSeekStep(position: number, duration: number, delta: number): number {
    if (!(duration > 0)) return 0;
    return Math.max(0, Math.min(duration - 250, position + delta));
}
/** Следующий стиль текста по кругу: поток → удар → без текста */
export function clipNextStyle(style: string): ClipLyricStyle {
    return style === 'flow' ? 'punch' : style === 'punch' ? 'off' : 'flow';
}
/** Время для нижней панели: «м:сс», с часа «ч:мм:сс»; мусор — 0:00 */
export function clipTime(ms: number): string {
    const total = Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0;
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const sec = String(total % 60).padStart(2, '0');
    return h ? h + ':' + String(m).padStart(2, '0') + ':' + sec : m + ':' + sec;
}
/** Значок громкости: выключен, тихо (до половины), громко */
export function clipVolumeIcon(level: number): 'mute' | 'volLow' | 'vol' {
    if (!(level > 0)) return 'mute';
    return level < 0.5 ? 'volLow' : 'vol';
}
/** Громкость после шага клавишей или колесом: в пределах 0..1, сотыми */
export function clipVolumeStep(level: number, delta: number): number {
    const base = Number.isFinite(level) ? level : 0;
    return Math.max(0, Math.min(1, Math.round((base + delta) * 100) / 100));
}

/** Уровни полос волны 0..1 из спектра анализатора: частоты от 60 Гц до 14 кГц по логарифму, выше слышнее (наклон) */
export function clipBarLevels(freq: ArrayLike<number>, sampleRate: number, fftSize: number, count: number): number[] {
    const out: number[] = new Array(Math.max(0, count)).fill(0);
    if (!freq.length || !(sampleRate > 0) || !(fftSize > 0) || count <= 0) return out;
    const hz = sampleRate / fftSize;
    const low = 60;
    const high = Math.min(14000, sampleRate / 2);
    for (let i = 0; i < count; i++) {
        const a = low * Math.pow(high / low, i / count);
        const b = low * Math.pow(high / low, (i + 1) / count);
        const from = Math.max(1, Math.min(freq.length - 1, Math.floor(a / hz)));
        const to = Math.max(from, Math.min(freq.length - 1, Math.ceil(b / hz) - 1));
        let peak = 0;
        for (let k = from; k <= to; k++) if (freq[k] > peak) peak = freq[k];
        out[i] = Math.min(1, Math.pow(peak / 255, 1.5) * (1 + (0.6 * i) / count));
    }
    return out;
}
/** Бас 0..1 для бита: средняя энергия 40–160 Гц в квадрате, чтобы удар бочки был резче фона */
export function clipBassLevel(freq: ArrayLike<number>, sampleRate: number, fftSize: number): number {
    if (!freq.length || !(sampleRate > 0) || !(fftSize > 0)) return 0;
    const hz = sampleRate / fftSize;
    const from = Math.max(1, Math.floor(40 / hz));
    const to = Math.max(from, Math.min(freq.length - 1, Math.ceil(160 / hz)));
    let sum = 0;
    for (let k = from; k <= to; k++) sum += freq[k];
    const level = sum / (to - from + 1) / 255;
    return level * level;
}
/** Запасная «волна» без звука: одинаковая для одного трека, плавный силуэт с холмом посередине */
export function clipPseudoWave(seed: number, count: number): number[] {
    let state = (Math.floor(Math.abs(Number.isFinite(seed) ? seed : 0)) + 0x9e3779b9) >>> 0;
    const next = (): number => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const raw: number[] = [];
    for (let i = 0; i < count + 2; i++) raw.push(next());
    const out: number[] = [];
    for (let i = 0; i < count; i++) {
        const smooth = raw[i + 1] * 0.6 + (raw[i] + raw[i + 2]) * 0.2;
        out.push(Math.min(1, (0.22 + 0.78 * smooth) * (0.6 + 0.4 * Math.sin((Math.PI * (i + 0.5)) / count))));
    }
    return out;
}
/** Формат записи: MP4 с H.264 и AAC, если браузер его пишет, иначе любой MP4, иначе WebM */
export function clipRecordMime(supported: (type: string) => boolean): { mime: string; ext: 'mp4' | 'webm' } {
    for (const mime of ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4']) if (supported(mime)) return { mime, ext: 'mp4' };
    for (const mime of ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']) if (supported(mime)) return { mime, ext: 'webm' };
    return { mime: '', ext: 'webm' };
}
/** Размер файла: длинная сторона 1920, стороны чётные (1080×1920 для кадра 9:16, 1920×1080 для окна 16:9) */
export function clipOutputSize(width: number, height: number): { width: number; height: number } {
    if (!(width > 0) || !(height > 0)) return { width: 0, height: 0 };
    const scale = 1920 / Math.max(width, height);
    const even = (value: number): number => Math.max(2, Math.round(value / 2) * 2);
    return { width: even(width * scale), height: even(height * scale) };
}
/** Вырез кадра из снимка страницы: кадр стоит по центру окна, снимок может быть крупнее окна (плотность пикселей) */
export function clipCrop(frameW: number, frameH: number, viewW: number, viewH: number, videoW: number, videoH: number): { sx: number; sy: number; sw: number; sh: number; width: number; height: number } {
    const out = clipOutputSize(frameW, frameH);
    if (!(viewW > 0) || !(viewH > 0) || !(videoW > 0) || !(videoH > 0) || !out.width) return { sx: 0, sy: 0, sw: 0, sh: 0, width: 0, height: 0 };
    const kx = videoW / viewW;
    const ky = videoH / viewH;
    const sx = Math.max(0, Math.round(((viewW - frameW) / 2) * kx));
    const sy = Math.max(0, Math.round(((viewH - frameH) / 2) * ky));
    return { sx, sy, sw: Math.min(videoW - sx, Math.round(frameW * kx)), sh: Math.min(videoH - sy, Math.round(frameH * ky)), width: out.width, height: out.height };
}

export function installClip(core: ClipCore): ClipSection {
    const ru = core.lang === 'ru';
    const T = ru
        ? { mode: 'Для роликов', open: 'Обложка на всё окно для роликов', close: 'Свернуть, Esc', vertical: 'Кадр 9:16, V', text: 'Подписи, H', full: 'Полный экран, F', nothing: 'Сейчас ничего не играет', lyrics: 'Текст: {style}, L', side: 'Текст сбоку, P', flow: 'поток', punch: 'удар', off: 'выключен', searching: 'Ищу текст…', seek: 'Перемотка', controls: 'Управление', back: 'Назад на 10 с', forward: 'Вперёд на 10 с', play: 'Играть, пробел', pause: 'Пауза, пробел', mute: 'Выключить звук, M', unmute: 'Включить звук, M', volume: 'Громкость', like: 'Нравится', unlike: 'Убрать из понравившихся', noLike: 'Лайк недоступен', rec: 'Записать ролик, R (Shift+R: 15 с)', recStop: 'Остановить запись, R', fxLabel: 'Эффекты на бит, B', qr: 'Значок sc2 и QR, Q', recNo: 'Запись недоступна: клиент без поддержки захвата', recFail: 'Не удалось начать запись кадра', recNoAudio: 'Запись пойдёт без звука: звук сайта недоступен', recSaved: 'Ролик сохранён: {name}', recWebm: 'MP4 здесь не пишется, сохранён WebM: {name}', recSaveFail: 'Ролик не сохранился', recEmpty: 'Запись пустая, файл не создан', qrTitle: 'sc2 на GitHub' }
        : { mode: 'For videos', open: 'Full-window cover for videos', close: 'Close, Esc', vertical: '9:16 frame, V', text: 'Captions, H', full: 'Full screen, F', nothing: 'Nothing is playing', lyrics: 'Lyrics: {style}, L', side: 'Lyrics beside the cover, P', flow: 'flow', punch: 'punch', off: 'off', searching: 'Looking for lyrics…', seek: 'Seek', controls: 'Controls', back: 'Back 10 s', forward: 'Forward 10 s', play: 'Play, Space', pause: 'Pause, Space', mute: 'Mute, M', unmute: 'Unmute, M', volume: 'Volume', like: 'Like', unlike: 'Unlike', noLike: 'Like unavailable', rec: 'Record a clip, R (Shift+R: 15 s)', recStop: 'Stop recording, R', fxLabel: 'Beat effects, B', qr: 'sc2 badge and QR, Q', recNo: 'Recording unavailable: this client cannot capture', recFail: 'Could not start capturing the frame', recNoAudio: 'Recording without sound: the site audio is unavailable', recSaved: 'Clip saved: {name}', recWebm: 'MP4 is not supported here, saved WebM: {name}', recSaveFail: 'The clip could not be saved', recEmpty: 'Nothing was recorded, no file created', qrTitle: 'sc2 on GitHub' };
    const ICON: Record<string, string> = {
        clip: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 1h7A1.5 1.5 0 0 1 13 2.5v11a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 13.5v-11A1.5 1.5 0 0 1 4.5 1zm.2 1.5v11h6.6v-11zM6.9 5.6l3.2 2.1-3.2 2.1z"/></svg>',
        close: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 2.4 8 6.9l4.5-4.5 1.1 1.1L9.1 8l4.5 4.5-1.1 1.1L8 9.1l-4.5 4.5-1.1-1.1L6.9 8 2.4 3.5z"/></svg>',
        vertical: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 1h6a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1zm.5 1.5v11h5v-11z"/></svg>',
        text: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 2.5h12V5h-1.5V4h-3.75v8.5H10V14H6v-1.5h1.25V4H3.5v1H2z"/></svg>',
        lyrics: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v2H4zM4 9.5h11v2H4zM4 14h8v2H4zM17.5 12.2V18a2.5 2.5 0 1 1-1.5-2.3V10h4v2.2z"/></svg>',
        side: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 2h13v12h-13zM3 3.5v9h5v-9zM10 5h3v1.5h-3zm-1 2.5h4V9H9zm1 2.5h3v1.5h-3z"/></svg>',
        full: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 1.5H6V3H3v3H1.5zm8.5 0h4.5V6H13V3h-3zM1.5 10H3v3h3v1.5H1.5zm11.5 0h1.5v4.5H10V13h3z"/></svg>',
        // Нижняя панель (2.10.2): перемотка на 10 с — круговая стрелка с цифрой внутри, как в подкастах
        back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5V2.2a.5.5 0 0 0-.82-.38L7.1 5.12a.5.5 0 0 0 0 .76l4.08 3.3A.5.5 0 0 0 12 8.8V7a6 6 0 1 1-6 6 1 1 0 0 0-2 0 8 8 0 1 0 8-8z"/><text x="12" y="16" text-anchor="middle" font-size="6.6" font-weight="800" font-family="system-ui,sans-serif">10</text></svg>',
        forward: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5V2.2a.5.5 0 0 1 .82-.38l4.08 3.3a.5.5 0 0 1 0 .76l-4.08 3.3A.5.5 0 0 1 12 8.8V7a6 6 0 1 0 6 6 1 1 0 0 1 2 0 8 8 0 1 1-8-8z"/><text x="12" y="16" text-anchor="middle" font-size="6.6" font-weight="800" font-family="system-ui,sans-serif">10</text></svg>',
        play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.6v12.8a1.2 1.2 0 0 0 1.84 1.01l10.06-6.4a1.2 1.2 0 0 0 0-2.02L9.84 4.59A1.2 1.2 0 0 0 8 5.6z"/></svg>',
        pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.2 4.5h2.6c.66 0 1.2.54 1.2 1.2v12.6c0 .66-.54 1.2-1.2 1.2H7.2c-.66 0-1.2-.54-1.2-1.2V5.7c0-.66.54-1.2 1.2-1.2zm7 0h2.6c.66 0 1.2.54 1.2 1.2v12.6c0 .66-.54 1.2-1.2 1.2h-2.6c-.66 0-1.2-.54-1.2-1.2V5.7c0-.66.54-1.2 1.2-1.2z"/></svg>',
        vol: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9v6h4l5 5V4L7 9zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.47 4.47 0 0 0 2.5-4zM14 3.23v2.06a7 7 0 0 1 0 13.42v2.06A9 9 0 0 0 14 3.23z"/></svg>',
        volLow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9v6h4l5 5V4L9 9zm13.5 3A4.5 4.5 0 0 0 16 8v8a4.47 4.47 0 0 0 2.5-4z"/></svg>',
        mute: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16.5 12A4.5 4.5 0 0 0 14 8v2.18l2.45 2.45a4.3 4.3 0 0 0 .05-.63zM19 12c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.8 8.8 0 0 0 21 12a9 9 0 0 0-7-8.77v2.06A7 7 0 0 1 19 12zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25A7 7 0 0 1 14 18.7v2.06a9 9 0 0 0 3.69-1.81L19.73 21 21 19.73l-9-9zM12 4 9.91 6.09 12 8.18z"/></svg>',
        rec: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zm0 1.5a5 5 0 1 1 0 10A5 5 0 0 1 8 3zm0 2.4a2.6 2.6 0 1 1 0 5.2 2.6 2.6 0 0 1 0-5.2z"/></svg>',
        fx: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M7 1.5l1.5 4L12.5 7 8.5 8.5 7 12.5 5.5 8.5 1.5 7l4-1.5zM12.5 9l.8 2.2L15.5 12l-2.2.8-.8 2.2-.8-2.2L9.5 12l2.2-.8z"/></svg>',
        qr: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 2h5v5H2zm1.4 1.4v2.2h2.2V3.4zM9 2h5v5H9zm1.4 1.4v2.2h2.2V3.4zM2 9h5v5H2zm1.4 1.4v2.2h2.2v-2.2zM9 9h2v2H9zm3 0h2v2h-2zm-3 3h2v2H9zm3 1h2v1h-2z"/></svg>',
        heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.3s-7.6-4.55-9.33-9.4C1.5 7.6 3.6 4 7.15 4c2.05 0 3.56 1.1 4.85 2.85C13.29 5.1 14.8 4 16.85 4c3.55 0 5.65 3.6 4.48 6.9C19.6 15.75 12 20.3 12 20.3z"/></svg>',
    };
    const STYLE_ID = 'sc-clip-style';
    if (!document.getElementById(STYLE_ID)) {
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = [
            '.scc{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;overflow:hidden;background:#05060a;color:#fff;font-family:inherit;font-weight:600;font-size:14px;line-height:1.3;opacity:0;transition:opacity .3s ease;--k:var(--sca-kick,0);--sx:var(--sca-sx,0);--sy:var(--sca-sy,0)}',
            '.scc.on{opacity:1}',
            // Фон дышит под бит: ярче и чуть крупнее на ударе
            '.scc-bg{position:absolute;inset:-12%;background:center/cover no-repeat;filter:blur(60px) saturate(1.6) brightness(calc(.5 + var(--k) * .25));transform:scale(calc(1.1 + var(--k) * .05));transition:background-image .6s ease,transform 90ms ease-out,filter 90ms ease-out}',
            '.scc-bg::after{content:"";position:absolute;inset:0;background:radial-gradient(120% 90% at 50% 40%,transparent,rgba(0,0,0,.55))}',
            // Кадр: всё окно или вертикальный 9:16 по центру. Размер кадра ставит скрипт, внутри всё в долях кадра
            '.scc-frame{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:calc(var(--scc-h) * .035);box-sizing:border-box;padding:calc(var(--scc-h) * .06) calc(var(--scc-w) * .07);width:var(--scc-w);height:var(--scc-h);overflow:hidden}',
            '.scc.vertical .scc-frame{box-shadow:0 0 0 100vmax rgba(0,0,0,.55),0 30px 80px -20px rgba(0,0,0,.9)}',
            // Обложка трясётся под удар баса (--sca-sx/sy из переливов) и даёт толчок на новой строке (--scc-hit)
            '.scc-art{position:relative;flex:none;width:min(calc(var(--scc-w) * .86),calc(var(--scc-h) * .62));aspect-ratio:1;border-radius:calc(var(--scc-h) * .018);overflow:hidden;container-type:inline-size;background:center/cover no-repeat rgba(255,255,255,.06);--scc-hit:0;' +
                'box-shadow:0 40px 90px -30px rgba(0,0,0,.95),0 0 0 1px rgba(255,255,255,.08),0 0 calc(var(--k) * 80px) calc(var(--k) * 6px) color-mix(in srgb,var(--sca-c1,#8aa0ff) 45%,transparent);' +
                'transform:translate3d(calc(var(--sx) * 9px),calc(var(--sy) * 9px),0) rotate(calc(var(--sx) * .7deg)) scale(calc(1 + var(--k) * .045 + var(--scc-hit) * .03));transition:transform 80ms ease-out,box-shadow 120ms ease-out}',
            '.scc-art.hit{animation:scc-hit .32s cubic-bezier(.2,.8,.2,1)}',
            '@keyframes scc-hit{0%{--scc-hit:1}100%{--scc-hit:0}}',
            '@property --scc-hit{syntax:"<number>";inherits:true;initial-value:0}',
            '.scc:not(.playing) .scc-art{transform:scale(.97)}',
            // Тень общая на оба ряда (drop-shadow на блоке, а не text-shadow на строках): её не режет overflow заголовка, у исполнителя она
            // слабее сама, потому что берётся от прозрачности его букв. Заголовку запас снизу и сверху, чтобы хвосты «р», «у», «g», «y» не резались
            '.scc-text{width:100%;text-align:center;filter:drop-shadow(0 2px 14px rgba(0,0,0,.5));transition:opacity .25s ease}',
            '.scc-title{font-size:clamp(18px,calc(var(--scc-h) * .042),64px);line-height:1.24;font-weight:900;letter-spacing:-.02em;padding:.06em 0 .08em;margin:-.06em 0 -.08em;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}',
            '.scc-artist{margin-top:.4em;padding-bottom:.1em;font-size:clamp(13px,calc(var(--scc-h) * .026),36px);line-height:1.3;font-weight:700;color:rgba(255,255,255,.72);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
            // Полоса времени тянется: поле щелчка выше самой полосы
            // Полоса времени (2.10.3): волна на canvas, сыгранное белым, остальное 30%. Тянется и щёлкается, поле щелчка выше самой волны
            '.scc-bar{position:relative;flex:none;width:min(100%,calc(var(--scc-h) * .62));height:max(28px,calc(var(--scc-h) * .045));border-radius:6px;background:rgba(255,255,255,.22);cursor:pointer;touch-action:none;transition:opacity .25s ease}',
            '.scc-bar.wavy{background:none}',
            '.scc-bar.wavy>i{display:none}',
            '.scc-bar>canvas{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}',
            '.scc-bar::before{content:"";position:absolute;left:0;right:0;top:-8px;bottom:-8px}',
            '.scc-bar>i{position:absolute;left:0;top:50%;height:3px;margin-top:-1.5px;width:calc(var(--scc-p,0) * 100%);border-radius:inherit;background:#fff;transition:width .25s linear}',
            '.scc-bar.drag>i{transition:none}',
            '.scc-bar>b{position:absolute;top:50%;left:calc(var(--scc-p,0) * 100%);width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;background:#fff;box-shadow:0 1px 6px rgba(0,0,0,.5);opacity:0;transition:opacity .15s}',
            '.scc-bar:hover>b,.scc-bar.drag>b{opacity:1}',
            '.scc.bare .scc-text,.scc.bare .scc-bar{opacity:0}',
            '.scc.bare .scc-bar{pointer-events:none}',
            // ===== Текст на обложке =====
            '.scc-lyr{position:absolute;inset:0;container-type:inline-size;display:flex;flex-direction:column;justify-content:center;pointer-events:none;text-align:center;font-weight:900;letter-spacing:-.02em;color:#fff;' +
                // Затемнение под текстом: на светлой обложке белые буквы иначе тонули
                'background:linear-gradient(180deg,rgba(0,0,0,.42),rgba(0,0,0,.28) 35%,rgba(0,0,0,.28) 65%,rgba(0,0,0,.5));transition:opacity .3s ease}',
            '.scc-lyr.wait{background:none}',
            '.scc-lyr-note{align-self:center;padding:.5em 1em;border-radius:999px;background:rgba(0,0,0,.45);font-size:4cqw;font-weight:700;color:rgba(255,255,255,.8)}',
            // «Поток»: лента строк, текущая крупно посередине, соседние меньше и в дымке
            '.scc-lyr.flow{-webkit-mask:linear-gradient(transparent,#000 22%,#000 78%,transparent);mask:linear-gradient(transparent,#000 22%,#000 78%,transparent)}',
            '.scc-flow{position:absolute;left:6%;right:6%;top:50%;transition:transform .55s cubic-bezier(.2,.8,.2,1);will-change:transform}',
            '.scc-flow>p{margin:0;padding:1.6cqw 0;font-size:6.4cqw;line-height:1.12;color:rgba(255,255,255,.38);filter:blur(1.2px);transform:scale(.86);transform-origin:50% 50%;pointer-events:auto;cursor:pointer;' +
                'text-shadow:0 0 .3em rgba(0,0,0,.7),0 2px 18px rgba(0,0,0,.6);transition:transform .45s cubic-bezier(.2,.8,.2,1),color .3s,filter .3s,opacity .3s}',
            '.scc-flow>p.near{color:rgba(255,255,255,.6);filter:none;transform:scale(.92)}',
            '.scc-flow>p.now{color:rgba(255,255,255,.55);filter:none;transform:scale(calc(1.08 + var(--k) * .05))}',
            '.scc-flow>p.past{opacity:.55}',
            '.scc-flow>p>span{transition:color .18s,text-shadow .18s}',
            '.scc-flow>p.now>span.on{color:#fff;text-shadow:0 0 24px color-mix(in srgb,var(--sca-c1,#fff) 80%,transparent),0 2px 14px rgba(0,0,0,.7)}',
            // «Удар»: одна строка, слова выпрыгивают с поворотом, длинные слова цветом обложки, ушедшая строка улетает вверх
            '.scc-punch{position:absolute;inset:0;display:grid;place-items:center;padding:0 7%}',
            '.scc-pl{grid-area:1/1;display:flex;flex-wrap:wrap;justify-content:center;align-items:baseline;gap:.04em .2em;font-size:9.4cqw;line-height:1;text-transform:uppercase;' +
                // Montserrat Black (вшит в клиент, 2.10.1): геометрический гротеск в духе Proxima Nova, с кириллицей. «Поток» остаётся шрифтом сайта
                'font-family:"SC2 Montserrat",Montserrat,"Segoe UI Variable Display","Segoe UI",system-ui,sans-serif;font-weight:900;letter-spacing:-.02em;' +
                'text-shadow:0 .04em 0 rgba(0,0,0,.3),0 6px 26px rgba(0,0,0,.55)}',
            '.scc-pl>span{display:inline-block;opacity:0;transform:translateY(.35em) scale(1.7) rotate(-6deg);filter:blur(6px);transition:opacity .16s ease-out,transform .32s cubic-bezier(.2,1.6,.4,1),filter .2s ease-out}',
            '.scc-pl>span:nth-child(even){transform:translateY(.35em) scale(1.7) rotate(6deg)}',
            '.scc-pl>span.on{opacity:1;transform:none;filter:none}',
            '.scc-pl>span.big{color:color-mix(in srgb,var(--sca-c1,#ffd24a) 55%,#fff);}',
            '.scc-pl.small{font-size:7cqw}',
            '.scc-pl.tiny{font-size:5.2cqw}',
            '.scc-pl.out{animation:scc-out .38s cubic-bezier(.4,0,1,1) forwards}',
            '@keyframes scc-out{to{opacity:0;transform:translateY(-.6em) scale(.9);filter:blur(8px)}}',
            '.scc-lyr.punch .scc-pl.now{transform:scale(calc(1 + var(--k) * .06))}',
            // Текст сбоку (2.10.1): обложка слева без текста, колонка с текстом справа, как в Spotify. В кадре 9:16 колонка под обложкой
            '.scc.side .scc-frame{display:grid;grid-template-columns:min(calc(var(--scc-w) * .4),calc(var(--scc-h) * .6)) minmax(0,1fr);grid-template-rows:1fr auto auto auto 1fr;column-gap:calc(var(--scc-w) * .05);row-gap:calc(var(--scc-h) * .02);align-items:center;justify-content:center}',
            '.scc.side .scc-art{grid-column:1;grid-row:2;width:100%}',
            '.scc.side .scc-text{grid-column:1;grid-row:3}',
            '.scc.side .scc-bar{grid-column:1;grid-row:4;width:100%}',
            '.scc.side .scc-lyr{position:relative;inset:auto;grid-column:2;grid-row:1/-1;align-self:stretch;height:100%;background:none;text-align:left}',
            '.scc.side .scc-flow{left:0;right:0}',
            '.scc.side .scc-flow>p{font-size:6.6cqw;line-height:1.14;padding:1.4cqw 0;transform:none;filter:none;transform-origin:0 50%}',
            '.scc.side .scc-flow>p.near{transform:none}',
            '.scc.side .scc-flow>p.now{transform:none;color:rgba(255,255,255,.55)}',
            '.scc.side .scc-punch{padding:0;place-items:center start}',
            '.scc.side .scc-pl{justify-content:flex-start;text-align:left;font-size:9cqw}',
            '.scc.side .scc-pl.small{font-size:7cqw}',
            '.scc.side .scc-pl.tiny{font-size:5.4cqw}',
            '.scc.side .scc-lyr-note{align-self:flex-start}',
            '.scc.side.nolyr .scc-frame{grid-template-columns:min(calc(var(--scc-w) * .4),calc(var(--scc-h) * .6)) 0;column-gap:0}',
            '.scc.vertical.side .scc-frame{grid-template-columns:1fr;grid-template-rows:auto auto minmax(0,1fr) auto;row-gap:calc(var(--scc-h) * .02);align-content:center}',
            '.scc.vertical.side .scc-art{grid-column:1;grid-row:1;width:min(calc(var(--scc-w) * .64),calc(var(--scc-h) * .34));justify-self:center}',
            '.scc.vertical.side .scc-text{grid-column:1;grid-row:2}',
            '.scc.vertical.side .scc-lyr{grid-column:1;grid-row:3;min-height:0;text-align:center}',
            '.scc.vertical.side .scc-bar{grid-column:1;grid-row:4;justify-self:center}',
            '.scc.vertical.side .scc-flow>p{font-size:7.4cqw;transform-origin:50% 50%;text-align:center}',
            '.scc.vertical.side .scc-punch{place-items:center}',
            '.scc.vertical.side .scc-pl{justify-content:center;text-align:center;font-size:10cqw}',
            '.scc.vertical.side.nolyr .scc-frame{grid-template-rows:auto auto 0 auto}',
            // Панель кнопок: исчезает через 2 с без движения мыши, курсор тоже
            '.scc-tools{position:absolute;top:16px;right:16px;z-index:2;display:flex;gap:6px;padding:5px;border-radius:999px;background:rgba(10,11,16,.6);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);box-shadow:inset 0 0 0 1px rgba(255,255,255,.12);transition:opacity .25s ease,transform .25s ease}',
            '.scc.idle .scc-tools{opacity:0;transform:translateY(-6px);pointer-events:none}',
            '.scc.idle{cursor:none}',
            '.scc-tools button{all:unset;box-sizing:border-box;width:36px;height:36px;border-radius:999px;display:grid;place-items:center;cursor:pointer;color:rgba(255,255,255,.8);transition:background .15s,color .15s}',
            '.scc-tools button:hover{background:rgba(255,255,255,.14);color:#fff}',
            '.scc-tools button[aria-pressed="true"]{background:#fff;color:#0b0c10}',
            '.scc-tools button[data-style="punch"]{background:color-mix(in srgb,var(--sca-c1,#ffd24a) 70%,#fff);color:#0b0c10}',
            '.scc-tools button:focus-visible{outline:2px solid #fff;outline-offset:2px}',
            '.scc-tools svg{width:16px;height:16px;fill:currentColor}',
            // Нижняя панель (2.10.2): перемотка, пауза, громкость и лайк. Прячется вместе с верхней через 2 с без движения мыши,
            // в кадр ролика не попадает. Стоит у нижнего края окна, вне кадра 9:16 и ниже подписей
            '.scc-dock{position:absolute;left:50%;bottom:14px;z-index:2;display:flex;align-items:center;gap:2px;max-width:calc(100vw - 32px);box-sizing:border-box;padding:4px 6px 4px 12px;border-radius:999px;' +
                'background:linear-gradient(180deg,rgba(28,30,40,.62),rgba(10,11,16,.72));backdrop-filter:blur(24px) saturate(1.5);-webkit-backdrop-filter:blur(24px) saturate(1.5);' +
                'box-shadow:inset 0 0 0 1px rgba(255,255,255,.1),inset 0 1px 0 rgba(255,255,255,.14),0 24px 60px -20px rgba(0,0,0,.95);font-variant-numeric:tabular-nums;' +
                'transform:translateX(-50%);transition:opacity .3s ease,transform .4s cubic-bezier(.2,.8,.2,1)}',
            '.scc.idle .scc-dock{opacity:0;transform:translate(-50%,14px) scale(.98);pointer-events:none}',
            '.scc.none .scc-dock{display:none}',
            '.scc-dock button{all:unset;position:relative;box-sizing:border-box;width:38px;height:38px;flex:none;border-radius:999px;display:grid;place-items:center;cursor:pointer;color:rgba(255,255,255,.82);transition:background-color .15s,color .15s,transform .18s cubic-bezier(.2,.8,.2,1)}',
            '.scc-dock button:hover{background:rgba(255,255,255,.12);color:#fff}',
            '.scc-dock button:active{transform:scale(.88)}',
            '.scc-dock button:focus-visible,.scc-vtrack:focus-visible{outline:2px solid #fff;outline-offset:2px}',
            '.scc-dock svg{width:21px;height:21px;fill:currentColor;display:block;pointer-events:none}',
            // Главная кнопка: белый круг, на ударе баса светится цветом обложки
            '.scc-dock button[data-clip="play"]{width:44px;height:44px;margin:0 4px;background:#fff;color:#0b0c10;box-shadow:0 8px 22px -8px rgba(0,0,0,.7),0 0 calc(var(--k) * 26px) calc(var(--k) * 3px) color-mix(in srgb,var(--sca-c1,#fff) 55%,transparent)}',
            '.scc-dock button[data-clip="play"]:hover{background:#fff;color:#0b0c10;transform:scale(1.06)}',
            '.scc-dock button[data-clip="play"]:active{transform:scale(.92)}',
            '.scc-dock button[data-clip="play"] svg{width:24px;height:24px}',
            '.scc-time{min-width:44px;padding:0 4px;font-size:12px;font-weight:700;letter-spacing:.02em;color:rgba(255,255,255,.62);text-align:center;white-space:nowrap}',
            '.scc-sep{flex:none;width:1px;height:22px;margin:0 8px;background:rgba(255,255,255,.14)}',
            // Громкость: значок и горизонтальная дорожка; бегунок проявляется при наведении
            '.scc-vol{display:flex;align-items:center}',
            '.scc-vtrack{position:relative;flex:none;width:88px;height:28px;margin:0 6px 0 2px;border-radius:999px;cursor:pointer;touch-action:none;outline:none;--v:.5}',
            '.scc-vtrack::before{content:"";position:absolute;left:0;right:0;top:50%;height:4px;margin-top:-2px;border-radius:999px;background:rgba(255,255,255,.2)}',
            '.scc-vtrack>i{position:absolute;left:0;top:50%;height:4px;margin-top:-2px;width:calc(var(--v) * 100%);border-radius:999px;background:linear-gradient(90deg,rgba(255,255,255,.75),#fff)}',
            '.scc-vtrack>b{position:absolute;top:50%;left:calc(var(--v) * 100%);width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;background:#fff;box-shadow:0 1px 6px rgba(0,0,0,.5);transform:scale(0);transition:transform .16s cubic-bezier(.2,.8,.2,1)}',
            '.scc-vol:hover .scc-vtrack>b,.scc-vtrack.drag>b,.scc-vtrack:focus-visible>b{transform:scale(1)}',
            '.scc-vol[data-muted="true"] button{color:rgba(255,255,255,.5)}',
            // Сердце: контур, после лайка заливка, сжатие и отскок, кольцо и искры
            '.scc-dock button[data-clip="like"] svg{fill:transparent;stroke:currentColor;stroke-width:1.9;stroke-linejoin:round;overflow:visible;transition:fill .2s ease,stroke .2s ease}',
            '.scc-dock button[data-clip="like"][aria-pressed="true"]{color:#ff4f6d}',
            '.scc-dock button[data-clip="like"][aria-pressed="true"] svg{fill:currentColor}',
            '.scc-dock button[data-clip="like"][aria-disabled="true"]{opacity:.35;cursor:default}',
            '.scc-dock button[data-clip="like"].pop svg{animation:scc-heart .6s cubic-bezier(.2,.8,.2,1)}',
            '.scc-dock button[data-clip="like"]::before{content:"";position:absolute;inset:4px;border-radius:50%;border:3px solid #ff4f6d;opacity:0;transform:scale(.3);pointer-events:none}',
            '.scc-dock button[data-clip="like"].pop::before{animation:scc-ring .5s ease-out}',
            '.scc-dock button[data-clip="like"]>i{position:absolute;left:50%;top:50%;width:4px;height:4px;margin:-2px 0 0 -2px;border-radius:50%;opacity:0;pointer-events:none;' +
                'box-shadow:0 -17px #ff4f6d,15px -8px #ffb547,15px 8px #ff4f6d,0 17px #ffb547,-15px 8px #ff4f6d,-15px -8px #ffb547}',
            '.scc-dock button[data-clip="like"].pop>i{animation:scc-spark .6s ease-out}',
            '@keyframes scc-heart{0%{transform:scale(1)}15%{transform:scale(.72)}45%{transform:scale(1.28)}70%{transform:scale(.94)}100%{transform:scale(1)}}',
            '@keyframes scc-ring{0%{opacity:.9;transform:scale(.3);border-width:6px}100%{opacity:0;transform:scale(1.45);border-width:0}}',
            '@keyframes scc-spark{0%{opacity:0;transform:scale(.35)}25%{opacity:1}100%{opacity:0;transform:scale(1.3)}}',
            // Узкое окно: без времени и дорожки громкости, значок звука остаётся
            '@media (max-width:560px){.scc-time,.scc-vtrack{display:none}.scc-dock{padding:4px 6px}}',
            // ===== Запись ролика (2.10.3) =====
            // Идёт запись: панели, курсор и подсказки убраны, в кадр попадает только сам ролик. Метка записи стоит вне выреза
            '.scc.rec{cursor:none}',
            '.scc.rec .scc-tools,.scc.rec .scc-dock,.scc.rec .scc-toast{opacity:0!important;visibility:hidden;pointer-events:none;transition:none!important}',
            '.scc-tools button[data-clip="rec"][aria-pressed="true"]{background:#ff3b4f;color:#fff}',
            '.scc-rec{position:absolute;left:16px;top:16px;z-index:3;display:none;align-items:center;gap:8px;padding:6px 12px 6px 10px;border-radius:999px;background:rgba(10,11,16,.7);box-shadow:inset 0 0 0 1px rgba(255,255,255,.12);font-size:13px;font-weight:800;letter-spacing:.04em;font-variant-numeric:tabular-nums;pointer-events:none}',
            '.scc.rec .scc-rec.shown{display:flex}',
            '.scc-rec::before{content:"";width:10px;height:10px;border-radius:50%;background:#ff3b4f;animation:scc-blink 1.1s ease-in-out infinite}',
            '@keyframes scc-blink{50%{opacity:.25}}',
            '.scc-count{position:absolute;inset:0;z-index:3;display:none;place-items:center;pointer-events:none;font-size:min(32vh,240px);font-weight:900;color:#fff;text-shadow:0 8px 60px rgba(0,0,0,.6)}',
            '.scc.counting .scc-count{display:grid}',
            '.scc-count>span{animation:scc-pop .5s cubic-bezier(.2,.8,.2,1)}',
            '@keyframes scc-pop{0%{opacity:0;transform:scale(1.6)}100%{opacity:1;transform:scale(1)}}',
            '.scc-toast{position:absolute;left:50%;bottom:78px;z-index:3;max-width:min(560px,calc(100vw - 32px));box-sizing:border-box;padding:9px 16px;border-radius:999px;background:rgba(10,11,16,.8);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);box-shadow:inset 0 0 0 1px rgba(255,255,255,.12);font-size:13px;font-weight:700;text-align:center;opacity:0;transform:translate(-50%,8px);pointer-events:none;transition:opacity .25s ease,transform .25s ease}',
            '.scc-toast.on{opacity:1;transform:translate(-50%,0)}',
            // ===== Эффекты на бит (2.10.3): только transform и opacity, один canvas, огибающая удара --fxk 0..1 =====
            '.scc.fx .scc-frame{transform:scale(calc(1 + var(--fxk,0) * .02));will-change:transform}',
            '.scc-tint{position:absolute;left:-30%;top:-30%;width:160%;height:160%;pointer-events:none;mix-blend-mode:color;opacity:calc(.1 + var(--fxk,0) * .22);background:conic-gradient(#ff2a6d,#ffd23d,#2aff9c,#2ad4ff,#8a2aff,#ff2a6d);animation:scc-spin 22s linear infinite}',
            '.scc:not(.playing) .scc-tint{animation-play-state:paused}',
            '@keyframes scc-spin{to{transform:rotate(360deg)}}',
            '.scc-fx{position:absolute;inset:0;pointer-events:none}',
            '.scc-fxr{position:absolute;left:var(--fx-x,50%);top:var(--fx-y,50%);width:var(--fx-s,40%);height:var(--fx-s,40%);margin:calc(var(--fx-s,40%) / -2) 0 0 calc(var(--fx-s,40%) / -2);box-sizing:border-box;border-radius:calc(var(--scc-h) * .018);border:calc(var(--scc-h) * .004 + 1px) solid color-mix(in srgb,var(--sca-c1,#8aa0ff) 75%,#fff);opacity:0;will-change:transform,opacity}',
            '.scc-fxc{position:absolute;inset:0;width:100%;height:100%}',
            '.scc-fxf{position:absolute;inset:0;background:#fff;opacity:0;will-change:opacity}',
            // Разъезд RGB на обложке: две копии картинки, красная и синяя, складываются экраном и разъезжаются на ударе
            '.scc.fx .scc-art::before,.scc.fx .scc-art::after{content:"";position:absolute;inset:0;z-index:0;pointer-events:none;mix-blend-mode:screen;background:var(--scc-img,none) center/cover no-repeat #f00;background-blend-mode:multiply;opacity:calc(var(--fxk,0) * .8);will-change:transform,opacity}',
            '.scc.fx .scc-art::before{transform:translate3d(calc(var(--fxk,0) * -8px),0,0)}',
            '.scc.fx .scc-art::after{background-color:#00f;transform:translate3d(calc(var(--fxk,0) * 8px),0,0)}',
            '.scc.fx .scc-art>.scc-lyr{z-index:1}',
            // ===== Значок sc2 и QR (2.10.3): внутри кадра, в правом нижнем углу, под подписями и текстом =====
            '.scc-qr{position:absolute;right:calc(var(--scc-w) * .035);bottom:calc(var(--scc-h) * .02);z-index:1;display:flex;flex-direction:column;align-items:center;gap:calc(var(--scc-h) * .005);padding:calc(var(--scc-h) * .006);border-radius:calc(var(--scc-h) * .012);background:rgba(10,11,16,.55);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);box-shadow:inset 0 0 0 1px rgba(255,255,255,.1);pointer-events:none}',
            '.scc-qr>b{font:800 clamp(9px,calc(var(--scc-h) * .0145),17px)/1 system-ui,sans-serif;letter-spacing:.14em;color:rgba(255,255,255,.9)}',
            '.scc-qr>svg{display:block;width:clamp(64px,calc(var(--scc-h) * .1),150px);height:auto;border-radius:calc(var(--scc-h) * .008)}',
            '.scc-empty{font-size:18px;color:rgba(255,255,255,.7)}',
            // Кнопка режима в карточке и в баре
            '.scc-open{all:unset;box-sizing:border-box;width:32px;height:32px;border-radius:999px;display:inline-grid;place-items:center;flex:none;cursor:pointer;color:rgba(255,255,255,.75);transition:background-color .15s,color .15s,transform .15s}',
            '.scc-open:hover{background:rgba(255,255,255,.12);color:#fff}',
            '.scc-open:active{transform:scale(.9)}',
            '.scc-open:focus-visible{outline:2px solid var(--sc2-accent,#fff);outline-offset:2px}',
            '.scc-open svg{width:17px;height:17px;fill:currentColor}',
            '.playControls .scc-open{background:rgba(255,255,255,.06);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08);margin:0 4px;align-self:center}',
            '.playControls .scc-open svg{width:16px;height:16px}',
            'html.scm-reduce .scc,html.scm-reduce .scc *{transition:none!important;animation:none!important}',
            'html.scm-reduce .scc-art,html.scm-reduce .scc-bg{transform:none!important}',
            'html.scm-reduce .scc-fx,html.scm-reduce .scc-tint{display:none!important}',
            '@media (prefers-reduced-motion:reduce){.scc,.scc *{transition:none!important;animation:none!important}.scc-art{transform:none!important}.scc-fx,.scc-tint{display:none!important}}',
        ].join('\n');
        document.head.append(style);
    }

    // Шрифт «Удара»: Montserrat вшит в клиент и грузится из байтов (FontFace из буфера не идёт через CSP сайта)
    let fontLoaded = false;
    function ensureFont(): void {
        if (fontLoaded || !core.fonts || typeof FontFace === 'undefined') return;
        fontLoaded = true;
        const bytes = (base64: string): ArrayBuffer => {
            const raw = atob(base64);
            const out = new Uint8Array(raw.length);
            for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
            return out.buffer;
        };
        const faces: Array<[string, string]> = [
            [core.fonts.latin, 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'],
            [core.fonts.cyrillic, 'U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116'],
        ];
        for (const [data, range] of faces) {
            try {
                const face = new FontFace('SC2 Montserrat', bytes(data), { weight: '100 900', unicodeRange: range });
                void face.load().then(() => document.fonts.add(face)).catch(() => undefined);
            } catch {
                // шрифт не встал: запасной из системы
            }
        }
    }

    const opener = (): HTMLButtonElement => {
        const node = document.createElement('button');
        node.type = 'button';
        node.className = 'scc-open';
        node.dataset.clip = 'open';
        node.setAttribute('aria-label', T.open);
        node.title = T.open;
        node.innerHTML = ICON.clip;
        node.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (layer) close();
            else open();
        });
        return node;
    };
    let cardButton: HTMLButtonElement | null = null;
    let barButton: HTMLButtonElement | null = null;

    // Выбор кадра, подписей и стиля текста помнится между запусками режима
    const read = (key: string): string => {
        try {
            return localStorage.getItem(key) ?? '';
        } catch {
            return '';
        }
    };
    const save = (key: string, value: string): void => {
        try {
            localStorage.setItem(key, value);
        } catch {
            // не сохранилось: до перезагрузки страницы
        }
    };
    let vertical = read('sc2-clip-vertical') === 'on';
    let bare = read('sc2-clip-bare') === 'on';
    const savedStyle = read('sc2-clip-lyrics');
    let lyricStyle: ClipLyricStyle = savedStyle === 'punch' || savedStyle === 'off' ? savedStyle : 'flow';
    let side = read('sc2-clip-side') === 'on';
    // Эффекты на бит и значок с QR (2.10.3): по умолчанию выключены, помнятся между запусками
    let fx = read('sc2-clip-fx') === 'on';
    let qrOn = read('sc2-clip-qr') === 'on';
    const reduced = (): boolean => document.documentElement.classList.contains('scm-reduce') || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);

    let layer: HTMLElement | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    let frameId = 0;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    let shownArt = '';
    let returnFocus: HTMLElement | null = null;
    let dragging = false;
    // Что сейчас на обложке: трек, стиль и есть ли текст. Сменилось — слой текста собирается заново
    let lyrKey = '';
    let lyrLine = -2;
    let lyrWord = -2;
    let lyrLines: ClipLine[] | null = null;
    let lyrPlain: string[] = [];
    let lastNow: ClipNow | null = null;
    // Нижняя панель: курсор над ней, тянут громкость, лайк до ответа сайта
    let dockHover = false;
    let volDrag = false;
    let likeWant: boolean | null = null;
    let likeUntil = 0;
    const tool = (act: string, label: string, icon: string): HTMLButtonElement => {
        const node = document.createElement('button');
        node.type = 'button';
        node.dataset.clip = act;
        node.setAttribute('aria-label', label);
        node.title = label;
        node.innerHTML = ICON[icon];
        return node;
    };
    function layout(): void {
        if (!layer) return;
        const size = vertical ? verticalFrame(window.innerWidth, window.innerHeight) : { width: window.innerWidth, height: window.innerHeight };
        layer.style.setProperty('--scc-w', size.width + 'px');
        layer.style.setProperty('--scc-h', size.height + 'px');
        layer.classList.toggle('vertical', vertical);
        layer.classList.toggle('bare', bare);
        layer.classList.toggle('side', side);
        layer.classList.toggle('fx', fx && !reduced());
        layer.querySelector('[data-clip="fx"]')?.setAttribute('aria-pressed', String(fx));
        layer.querySelector('[data-clip="qr"]')?.setAttribute('aria-pressed', String(qrOn));
        syncFx();
        syncQr();
        const sideBtn = layer.querySelector<HTMLElement>('[data-clip="side"]');
        if (sideBtn) {
            sideBtn.setAttribute('aria-pressed', String(side));
            sideBtn.setAttribute('aria-label', T.side);
            sideBtn.title = T.side;
        }
        layer.querySelector('[data-clip="vertical"]')?.setAttribute('aria-pressed', String(vertical));
        layer.querySelector('[data-clip="text"]')?.setAttribute('aria-pressed', String(!bare));
        const lyr = layer.querySelector<HTMLElement>('[data-clip="lyrics"]');
        if (lyr) {
            const label = T.lyrics.replace('{style}', T[lyricStyle]);
            lyr.dataset.style = lyricStyle;
            lyr.setAttribute('aria-pressed', String(lyricStyle === 'flow'));
            lyr.setAttribute('aria-label', label);
            lyr.title = label;
        }
    }
    function paint(): void {
        if (!layer || core.disposed()) return;
        const now = core.now();
        lastNow = now;
        const frame = layer.querySelector<HTMLElement>('.scc-frame');
        if (!frame) return;
        const wasPlaying = layer.classList.contains('playing');
        layer.classList.toggle('playing', !!now?.playing);
        layer.classList.toggle('none', !now);
        paintDock(now);
        // Пуск после паузы (в том числе с клавиш сайта): панель снова начинает отсчёт до исчезновения
        if (wasPlaying !== !!now?.playing) wake();
        if (!now) {
            if (!frame.querySelector('.scc-empty')) {
                frame.textContent = '';
                const empty = document.createElement('div');
                empty.className = 'scc-empty';
                empty.textContent = T.nothing;
                frame.append(empty);
                lyrKey = '';
            }
            return;
        }
        if (!frame.querySelector('.scc-art')) {
            frame.textContent = '';
            const art = document.createElement('div');
            art.className = 'scc-art';
            const text = document.createElement('div');
            text.className = 'scc-text';
            const title = document.createElement('div');
            title.className = 'scc-title';
            const artist = document.createElement('div');
            artist.className = 'scc-artist';
            text.append(title, artist);
            const bar = document.createElement('div');
            bar.className = 'scc-bar';
            bar.setAttribute('role', 'slider');
            bar.setAttribute('aria-label', T.seek);
            bar.append(document.createElement('i'), document.createElement('b'));
            bar.addEventListener('pointerdown', startSeek);
            frame.append(art, text, bar);
            buildWave(bar);
            lyrKey = '';
            syncFx();
            syncQr();
        }
        const title = frame.querySelector<HTMLElement>('.scc-title');
        const artist = frame.querySelector<HTMLElement>('.scc-artist');
        if (title && title.textContent !== now.title) title.textContent = now.title;
        if (artist && artist.textContent !== now.artist) artist.textContent = now.artist;
        if (!dragging) {
            barP = Math.max(0, Math.min(1, now.progress));
            frame.querySelector<HTMLElement>('.scc-bar')?.style.setProperty('--scc-p', String(barP));
        }
        if (waveSeed !== now.id) {
            waveSeed = now.id;
            pseudo = clipPseudoWave(now.id, BARS);
        }
        if (now.art !== shownArt) {
            shownArt = now.art;
            const cover = (url: string): string => (url ? 'url("' + url.replace(/["\\]/g, '') + '")' : 'none');
            const art = frame.querySelector<HTMLElement>('.scc-art');
            const bg = layer.querySelector<HTMLElement>('.scc-bg');
            if (art) setArt(art, cover(now.art));
            if (bg) bg.style.backgroundImage = cover(now.art);
            // Крупная обложка подменяет 500×500, когда загрузится; нет её — остаётся 500×500
            const big = clipArtwork(now.art);
            if (big !== now.art) {
                const probe = new Image();
                probe.onload = () => {
                    if (shownArt !== now.art || !layer) return;
                    if (art) setArt(art, cover(big));
                };
                probe.src = big;
            }
        }
        buildLyrics(now);
    }

    // ===== Текст на обложке =====
    function buildLyrics(now: ClipNow): void {
        const art = layer?.querySelector<HTMLElement>('.scc-art');
        const frame = layer?.querySelector<HTMLElement>('.scc-frame');
        if (!art || !frame || !layer) return;
        // Сбоку текст лежит в кадре рядом с обложкой, иначе на самой обложке
        const host = side ? frame : art;
        const state = now.lyrics === undefined ? 'wait' : now.lyrics === null ? 'none' : now.lyrics.lines ? 'synced' : 'plain';
        const key = now.id + '|' + lyricStyle + '|' + state + '|' + side;
        if (key === lyrKey) return;
        lyrKey = key;
        lyrLine = -2;
        lyrWord = -2;
        layer.querySelectorAll('.scc-lyr').forEach((node) => node.remove());
        lyrLines = now.lyrics?.lines ?? null;
        lyrPlain = now.lyrics && !now.lyrics.lines ? now.lyrics.plain.split('\n').map((line) => line.trim()).filter(Boolean) : [];
        const empty = lyricStyle === 'off' || state === 'none';
        layer.classList.toggle('nolyr', empty);
        if (fx) fxPlace();
        if (empty) return;
        const box = document.createElement('div');
        box.className = 'scc-lyr ' + lyricStyle;
        if (state === 'wait') {
            box.classList.add('wait');
            const note = document.createElement('div');
            note.className = 'scc-lyr-note';
            note.textContent = T.searching;
            box.append(note);
            host.append(box);
            return;
        }
        if (lyricStyle === 'flow') {
            const flow = document.createElement('div');
            flow.className = 'scc-flow';
            const lines = lyrLines ?? lyrPlain.map((text, i) => ({ at: i, text, words: [] as ClipWord[] }));
            lines.forEach((line) => {
                const row = document.createElement('p');
                if (lyrLines) row.dataset.at = String(line.at);
                const words = line.words.length ? line.words : [{ at: line.at, text: line.text || '♪' }];
                words.forEach((word, n) => {
                    const span = document.createElement('span');
                    span.textContent = word.text;
                    span.dataset.at = String(word.at);
                    row.append(span);
                    if (n < words.length - 1) row.append(' ');
                });
                flow.append(row);
            });
            // Щелчок по строке — перемотка к ней
            flow.addEventListener('click', (event) => {
                const row = (event.target as Element | null)?.closest<HTMLElement>('p[data-at]');
                if (!row) return;
                event.stopPropagation();
                core.seek(Math.max(0, Number(row.dataset.at) - 150));
                lyrLine = -2;
            });
            box.append(flow);
        } else {
            const punch = document.createElement('div');
            punch.className = 'scc-punch';
            box.append(punch);
        }
        host.append(box);
    }
    /** Строка для текста без времени: по доле прослушанного */
    function plainIndex(now: ClipNow): number {
        if (!lyrPlain.length) return -1;
        return Math.min(lyrPlain.length - 1, Math.floor(Math.max(0, Math.min(1, now.progress)) * lyrPlain.length));
    }
    function kick(): void {
        const art = layer?.querySelector<HTMLElement>('.scc-art');
        if (!art || !lastNow?.playing) return;
        art.classList.remove('hit');
        void art.offsetWidth;
        art.classList.add('hit');
    }
    function punchLine(text: string, words: ClipWord[]): HTMLElement {
        const line = document.createElement('div');
        line.className = 'scc-pl now';
        const parts = words.length ? words : text.split(/\s+/).filter(Boolean).map((part) => ({ at: 0, text: part }));
        const length = parts.reduce((sum, part) => sum + part.text.length, 0);
        if (length > 34) line.classList.add('tiny');
        else if (length > 20) line.classList.add('small');
        parts.forEach((part) => {
            const span = document.createElement('span');
            span.textContent = part.text;
            span.dataset.at = String(part.at);
            if (part.text.replace(/[^\p{L}\p{N}]/gu, '').length >= 6) span.classList.add('big');
            line.append(span);
        });
        if (!parts.length) {
            const span = document.createElement('span');
            span.textContent = '♪';
            span.className = 'on';
            line.append(span);
        }
        return line;
    }
    function syncLyrics(): void {
        const now = lastNow;
        const box = layer?.querySelector<HTMLElement>('.scc-lyr:not(.wait)');
        if (!now || !box) return;
        // Позиция между опросами плеера догоняется по часам, чтобы слова не прыгали шагом в 250 мс
        const at = now.positionMs + (now.playing ? performance.now() - polledAt : 0) + 140;
        const index = lyrLines ? clipLineAt(lyrLines, at) : plainIndex(now);
        if (lyricStyle === 'flow') {
            const flow = box.querySelector<HTMLElement>('.scc-flow');
            if (!flow) return;
            const rows = flow.children;
            if (index !== lyrLine) {
                const first = lyrLine === -2;
                lyrLine = index;
                lyrWord = -2;
                for (let i = 0; i < rows.length; i++) {
                    const row = rows[i] as HTMLElement;
                    row.classList.toggle('now', i === index);
                    row.classList.toggle('past', i < index);
                    row.classList.toggle('near', Math.abs(i - index) === 1);
                    if (i !== index) for (const word of row.querySelectorAll('span.on')) word.classList.remove('on');
                }
                const row = rows[Math.max(0, index)] as HTMLElement | undefined;
                if (row) flow.style.transform = 'translate3d(0,' + (-(row.offsetTop + row.offsetHeight / 2)).toFixed(1) + 'px,0)';
                if (!first && index >= 0) kick();
            }
            const row = rows[index] as HTMLElement | undefined;
            if (!row) return;
            const words = row.querySelectorAll<HTMLElement>('span');
            let lit = -1;
            if (lyrLines) {
                for (let i = 0; i < words.length; i++) {
                    if (Number(words[i].dataset.at) <= at) lit = i;
                    else break;
                }
            } else lit = words.length - 1;
            if (lit === lyrWord) return;
            lyrWord = lit;
            words.forEach((word, i) => word.classList.toggle('on', i <= lit));
            return;
        }
        // «Удар»
        const stage = box.querySelector<HTMLElement>('.scc-punch');
        if (!stage) return;
        if (index !== lyrLine) {
            const first = lyrLine === -2;
            lyrLine = index;
            lyrWord = -2;
            for (const old of stage.querySelectorAll<HTMLElement>('.scc-pl.now')) {
                old.classList.remove('now');
                old.classList.add('out');
                setTimeout(() => old.remove(), 420);
            }
            const line = lyrLines ? lyrLines[index] : null;
            const text = line ? line.text : index >= 0 ? lyrPlain[index] ?? '' : '';
            if (index >= 0) stage.append(punchLine(text, line ? line.words : []));
            if (!first && index >= 0) kick();
        }
        const current = stage.querySelector<HTMLElement>('.scc-pl.now');
        if (!current) return;
        const words = current.querySelectorAll<HTMLElement>('span');
        let lit = -1;
        if (lyrLines && lyrLines[index]?.words.length) {
            for (let i = 0; i < words.length; i++) {
                if (Number(words[i].dataset.at) <= at) lit = i;
                else break;
            }
        } else {
            // Слов со временем нет: выпрыгивают по очереди за первые полсекунды строки
            lit = words.length - 1;
        }
        if (lit === lyrWord) return;
        // Новое слово — лёгкий толчок обложки, но не на каждом слове подряд: только на длинных
        if (lit > lyrWord && lyrWord >= 0 && words[lit]?.classList.contains('big')) kick();
        lyrWord = lit;
        words.forEach((word, i) => {
            if (i <= lit && !word.classList.contains('on')) {
                if (!(lyrLines && lyrLines[index]?.words.length)) word.style.transitionDelay = i * 70 + 'ms';
                word.classList.add('on');
            }
        });
    }
    let polledAt = 0;
    // ===== Волна на полосе времени и эффекты на бит (2.10.3) =====
    // Анализатор цепляется к регулятору звука сайта (как у переливов), раз в секунду проверяется, не сменился ли он вместе с треком.
    // Работает только пока режим открыт, трек играет и вкладка видна; на паузе волна рисуется один раз за опрос
    const BARS = 56;
    let barP = 0;
    let waveSeed = -1;
    let pseudo: number[] = clipPseudoWave(0, BARS);
    const levels: number[] = new Array(BARS).fill(0);
    let barCanvas: HTMLCanvasElement | null = null;
    let barBox = { w: 0, h: 0, dpr: 1 };
    let barObserver: ResizeObserver | undefined;
    let analyser: AnalyserNode | null = null;
    let tapGain: AudioNode | null = null;
    let tapAt = -1e9;
    let tapId = -1;
    let freqData: Uint8Array<ArrayBuffer> | null = null;
    let silentSince = 0;
    let stepAt = 0;
    let avgBass = 0;
    let lastBeat = 0;
    let lastStrobe = 0;
    let fxk = 0;
    let fxShown = -1;
    let fxRing = 0;
    let fxColor = '#8aa0ff';
    let fxDirty = false;
    let fxCanvas: HTMLCanvasElement | null = null;
    let fxGeo = { cx: 0, cy: 0, r: 0, w: 0, h: 0, dpr: 1 };
    let particles: Array<{ x: number; y: number; vx: number; vy: number; age: number; life: number; size: number; tint: boolean }> = [];
    let stepT = 0;
    function setArt(art: HTMLElement, css: string): void {
        art.style.backgroundImage = css;
        // Копии картинки для разъезда RGB берут её из переменной
        art.style.setProperty('--scc-img', css);
    }
    function buildWave(bar: HTMLElement): void {
        barObserver?.disconnect();
        const canvas = document.createElement('canvas');
        if (typeof canvas.getContext !== 'function') return;
        barCanvas = canvas;
        bar.classList.add('wavy');
        bar.prepend(canvas);
        if (typeof ResizeObserver === 'function') {
            barObserver = new ResizeObserver(sizeWave);
            barObserver.observe(bar);
        }
        sizeWave();
    }
    function sizeWave(): void {
        const bar = barCanvas?.parentElement;
        if (!barCanvas || !bar) return;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        barBox = { w: bar.clientWidth, h: bar.clientHeight, dpr };
        barCanvas.width = Math.max(1, Math.round(barBox.w * dpr));
        barCanvas.height = Math.max(1, Math.round(barBox.h * dpr));
        drawWave();
    }
    function drawWave(): void {
        const g = barCanvas?.getContext('2d');
        if (!barCanvas || !g || !barBox.w || !barBox.h) return;
        g.setTransform(barBox.dpr, 0, 0, barBox.dpr, 0, 0);
        g.clearRect(0, 0, barBox.w, barBox.h);
        const step = barBox.w / BARS;
        const width = Math.max(1.6, step * 0.58);
        const mid = barBox.h / 2;
        const room = barBox.h - 2;
        for (let pass = 0; pass < 2; pass++) {
            g.beginPath();
            for (let i = 0; i < BARS; i++) {
                const played = (i + 0.5) / BARS <= barP;
                if (played !== (pass === 0)) continue;
                const height = Math.max(width, 3 + levels[i] * (room - 3));
                const x = i * step + (step - width) / 2;
                if (typeof g.roundRect === 'function') g.roundRect(x, mid - height / 2, width, height, width / 2);
                else g.rect(x, mid - height / 2, width, height);
            }
            g.fillStyle = pass === 0 ? '#fff' : 'rgba(255,255,255,.3)';
            g.fill();
        }
    }
    function closeAnalyser(): void {
        try {
            if (tapGain && analyser) tapGain.disconnect(analyser);
        } catch {
            // регулятор прошлого трека уже снят
        }
        analyser = null;
        tapGain = null;
        freqData = null;
        tapAt = -1e9;
        silentSince = 0;
    }
    function tapUpdate(t: number): void {
        if (t - tapAt < 1000 && tapId === (lastNow?.id ?? -1)) return;
        tapAt = t;
        tapId = lastNow?.id ?? -1;
        const tap = core.audioTap?.() ?? null;
        if (!tap || tap.gain === tapGain) return;
        try {
            if (tapGain && analyser) tapGain.disconnect(analyser);
        } catch {
            // регулятор прошлого трека уже снят
        }
        try {
            if (!analyser || analyser.context !== tap.context) {
                analyser = tap.context.createAnalyser();
                analyser.fftSize = 1024;
                analyser.smoothingTimeConstant = 0.55;
                freqData = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
            }
            tap.gain.connect(analyser);
            tapGain = tap.gain;
            silentSince = 0;
        } catch {
            analyser = null;
            tapGain = null;
        }
    }
    /** true — спектр живой; пустой дольше 1,2 с считается тишиной анализатора, и волна идёт по запасному пути */
    function listen(t: number): boolean {
        if (!analyser || !freqData) return false;
        analyser.getByteFrequencyData(freqData);
        let sum = 0;
        for (let i = 0; i < 64; i++) sum += freqData[i];
        if (sum > 0) silentSince = 0;
        else if (!silentSince) silentSince = t;
        return !(silentSince && t - silentSince > 1200);
    }
    function setFx(value: number): void {
        const rounded = Math.round(value * 100) / 100;
        if (rounded === fxShown) return;
        fxShown = rounded;
        layer?.style.setProperty('--fxk', String(rounded));
    }
    function beat(strong: boolean, t: number): void {
        fxk = Math.max(fxk, strong ? 1 : 0.7);
        const rings = layer?.querySelectorAll<HTMLElement>('.scc-fxr');
        const ring = rings?.[fxRing++ % 2];
        if (ring && typeof ring.animate === 'function') {
            ring.animate([{ transform: 'scale(1)', opacity: 0.55 }, { transform: 'scale(' + (strong ? 1.9 : 1.55) + ')', opacity: 0 }], { duration: strong ? 720 : 540, easing: 'cubic-bezier(.2,.7,.2,1)' });
        }
        if (layer) fxColor = getComputedStyle(layer).getPropertyValue('--sca-c1').trim() || '#8aa0ff';
        if (fxCanvas && fxGeo.r > 0 && particles.length < 70) {
            const count = strong ? 20 : 9;
            const k = fxGeo.h / 900;
            for (let i = 0; i < count; i++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = fxGeo.h * (0.00012 + Math.random() * 0.00028);
                const edge = fxGeo.r * (0.85 + Math.random() * 0.3);
                particles.push({
                    x: fxGeo.cx + Math.cos(angle) * edge,
                    y: fxGeo.cy + Math.sin(angle) * edge,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed - fxGeo.h * 0.00006,
                    age: 0,
                    life: 500 + Math.random() * 450,
                    size: (2 + Math.random() * 3) * Math.max(0.6, k),
                    tint: Math.random() < 0.55,
                });
            }
        }
        // Редкая короткая вспышка кадра на сильном ударе: не чаще раза в 1,6 с и не на каждом
        if (strong && t - lastStrobe > 1600 && Math.random() < 0.7) {
            lastStrobe = t;
            const flash = layer?.querySelector<HTMLElement>('.scc-fxf');
            if (flash && typeof flash.animate === 'function') flash.animate([{ opacity: 0.2 }, { opacity: 0 }], { duration: 110, easing: 'ease-out' });
        }
    }
    function drawParticles(dt: number): void {
        const g = fxCanvas?.getContext('2d');
        if (!fxCanvas || !g) return;
        if (!particles.length) {
            if (fxDirty) {
                g.setTransform(1, 0, 0, 1, 0, 0);
                g.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
                fxDirty = false;
            }
            return;
        }
        fxDirty = true;
        g.setTransform(fxGeo.dpr, 0, 0, fxGeo.dpr, 0, 0);
        g.clearRect(0, 0, fxGeo.w, fxGeo.h);
        particles = particles.filter((p) => (p.age += dt) < p.life);
        for (const p of particles) {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            const r = p.size * (1 + 0.35 * Math.sin(p.age * 0.03));
            const a = 0.28;
            g.globalAlpha = Math.max(0, 1 - p.age / p.life);
            g.fillStyle = p.tint ? fxColor : '#fff';
            g.beginPath();
            g.moveTo(p.x, p.y - r);
            g.lineTo(p.x + r * a, p.y - r * a);
            g.lineTo(p.x + r, p.y);
            g.lineTo(p.x + r * a, p.y + r * a);
            g.lineTo(p.x, p.y + r);
            g.lineTo(p.x - r * a, p.y + r * a);
            g.lineTo(p.x - r, p.y);
            g.lineTo(p.x - r * a, p.y - r * a);
            g.closePath();
            g.fill();
        }
        g.globalAlpha = 1;
    }
    /** Эффекты на бит: слои собираются, когда включены и нет «уменьшить движение», и снимаются целиком, когда выключены */
    function syncFx(): void {
        if (!layer) return;
        const frame = layer.querySelector<HTMLElement>('.scc-frame');
        if (!(fx && !reduced())) {
            layer.querySelectorAll('.scc-fx,.scc-tint').forEach((node) => node.remove());
            layer.style.removeProperty('--fxk');
            fxShown = -1;
            fxk = 0;
            particles = [];
            fxCanvas = null;
            return;
        }
        if (!frame) return;
        const mk = (tag: string, cls: string): HTMLElement => {
            const node = document.createElement(tag);
            node.className = cls;
            return node;
        };
        if (!layer.querySelector('.scc-tint')) layer.querySelector('.scc-bg')?.after(mk('div', 'scc-tint'));
        if (!frame.querySelector('.scc-fx.under')) {
            const under = mk('div', 'scc-fx under');
            under.append(mk('div', 'scc-fxr'), mk('div', 'scc-fxr'));
            frame.prepend(under);
        }
        if (!frame.querySelector('.scc-fx.over')) {
            const over = mk('div', 'scc-fx over');
            fxCanvas = mk('canvas', 'scc-fxc') as HTMLCanvasElement;
            over.append(fxCanvas, mk('div', 'scc-fxf'));
            frame.append(over);
        } else fxCanvas = frame.querySelector<HTMLCanvasElement>('.scc-fxc');
        fxPlace();
    }
    /** Где стоит обложка в кадре: от этого кольца и искры. Читает размеры, поэтому зовётся только при смене раскладки */
    function fxPlace(): void {
        const frame = layer?.querySelector<HTMLElement>('.scc-frame');
        const art = frame?.querySelector<HTMLElement>('.scc-art');
        const under = frame?.querySelector<HTMLElement>('.scc-fx.under');
        if (!frame || !art || !under) return;
        const dpr = Math.min(1.5, window.devicePixelRatio || 1);
        fxGeo = { cx: art.offsetLeft + art.offsetWidth / 2, cy: art.offsetTop + art.offsetHeight / 2, r: art.offsetWidth / 2, w: frame.offsetWidth, h: frame.offsetHeight, dpr };
        under.style.setProperty('--fx-x', fxGeo.cx + 'px');
        under.style.setProperty('--fx-y', fxGeo.cy + 'px');
        under.style.setProperty('--fx-s', art.offsetWidth + 'px');
        if (fxCanvas) {
            fxCanvas.width = Math.max(1, Math.round(fxGeo.w * dpr));
            fxCanvas.height = Math.max(1, Math.round(fxGeo.h * dpr));
            fxDirty = true;
        }
    }
    /** Значок sc2 с QR-кодом в углу кадра */
    let qrHtml = '';
    function syncQr(): void {
        const frame = layer?.querySelector<HTMLElement>('.scc-frame');
        if (!frame) return;
        const have = frame.querySelector('.scc-qr');
        if (!qrOn) {
            have?.remove();
            return;
        }
        if (have) return;
        qrHtml ||= core.qr?.() ?? '';
        if (!qrHtml) return;
        const box = document.createElement('div');
        box.className = 'scc-qr';
        box.setAttribute('role', 'img');
        box.setAttribute('aria-label', T.qrTitle);
        box.innerHTML = '<b>sc2</b>' + qrHtml;
        frame.append(box);
    }
    /** Один шаг картинки (до 30 раз в секунду, пока играет): спектр, бит, уровни волны, огибающая эффектов */
    function visuals(t: number): void {
        if (!layer) return;
        const playing = !!lastNow?.playing && !document.hidden;
        const calm = reduced();
        let live = false;
        let kickCss = 0;
        if (playing && !calm) {
            tapUpdate(t);
            live = listen(t);
            if (!live) kickCss = Math.max(0, Math.min(1, parseFloat(getComputedStyle(layer).getPropertyValue('--k')) || 0));
        }
        const spec = live && analyser && freqData ? clipBarLevels(freqData, analyser.context.sampleRate, analyser.fftSize, BARS) : null;
        for (let i = 0; i < BARS; i++) {
            if (!playing || calm) levels[i] = pseudo[i] * 0.55;
            else {
                const target = spec ? spec[i] : pseudo[i] * (0.4 + 0.6 * kickCss);
                levels[i] += (target - levels[i]) * (target > levels[i] ? 0.7 : 0.25);
            }
        }
        drawWave();
        if (!(fx && !calm)) return;
        const dt = Math.min(100, t - stepT || 33);
        stepT = t;
        if (playing) {
            const bass = live && analyser && freqData ? clipBassLevel(freqData, analyser.context.sampleRate, analyser.fftSize) : kickCss;
            avgBass = avgBass * 0.94 + bass * 0.06;
            if (t - lastBeat > 190 && bass > avgBass * 1.3 + 0.05) {
                lastBeat = t;
                beat(bass > avgBass * 1.8 + 0.12 && bass > 0.35, t);
            }
            fxk *= 0.82;
            if (fxk < 0.01) fxk = 0;
        } else {
            fxk = 0;
            particles = [];
        }
        setFx(fxk);
        drawParticles(dt);
    }
    function loop(): void {
        frameId = 0;
        if (!layer || core.disposed()) return;
        syncLyrics();
        // На паузе и в скрытой вкладке цикл останавливается: опрос раз в 250 мс заведёт его, когда трек снова пойдёт
        if (!lastNow?.playing || document.hidden) {
            visuals(performance.now());
            return;
        }
        const t = performance.now();
        if (t - stepAt >= 32) {
            stepAt = t;
            visuals(t);
        }
        frameId = requestAnimationFrame(loop);
    }
    function poll(): void {
        paint();
        polledAt = performance.now();
        if (!layer) return;
        if (lastNow?.playing && !document.hidden) {
            if (!frameId) frameId = requestAnimationFrame(loop);
        } else {
            syncLyrics();
            visuals(performance.now());
        }
    }

    // ===== Запись ролика (2.10.3) =====
    type RecState = 'idle' | 'prep' | 'count' | 'live';
    let recState: RecState = 'idle';
    let recStop: ((save: boolean) => void) | null = null;
    let toastTimer: ReturnType<typeof setTimeout> | undefined;
    function toast(text: string): void {
        const node = layer?.querySelector<HTMLElement>('.scc-toast');
        if (!node) return;
        node.textContent = text;
        node.classList.add('on');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => node.classList.remove('on'), 4500);
    }
    function recButton(on: boolean): void {
        const node = layer?.querySelector<HTMLElement>('[data-clip="rec"]');
        if (!node) return;
        node.setAttribute('aria-pressed', String(on));
        setLabel(node, on ? T.recStop : T.rec);
    }
    const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
    function toggleRecord(short: boolean): void {
        if (recState !== 'idle') {
            recStop?.(true);
            return;
        }
        void startRecord(short ? 15000 : 0);
    }
    async function startRecord(limit: number): Promise<void> {
        const api = core.record;
        if (!layer || !api || !navigator.mediaDevices?.getDisplayMedia || typeof MediaRecorder === 'undefined') {
            toast(T.recNo);
            return;
        }
        const format = clipRecordMime((type) => MediaRecorder.isTypeSupported(type));
        if (!format.mime) {
            toast(T.recNo);
            return;
        }
        recState = 'prep';
        recButton(true);
        let cancelled = false;
        let want = true;
        let display: MediaStream | null = null;
        let video: HTMLVideoElement | null = null;
        let recorder: MediaRecorder | null = null;
        let audioDest: MediaStreamAudioDestinationNode | null = null;
        let audioGain: AudioNode | null = null;
        const timers: Array<ReturnType<typeof setInterval>> = [];
        const chunks: Blob[] = [];
        const label = lastNow ? (lastNow.artist ? lastNow.artist + ' - ' : '') + lastNow.title : 'clip';
        recStop = (save) => {
            if (recorder && recorder.state === 'recording') {
                want = save;
                recorder.stop();
            } else cancelled = true;
        };
        const cleanup = (): void => {
            for (const id of timers) {
                clearInterval(id);
                clearTimeout(id);
            }
            display?.getTracks().forEach((track) => track.stop());
            if (video) video.srcObject = null;
            try {
                if (audioGain && audioDest) audioGain.disconnect(audioDest);
            } catch {
                // регулятор уже отцеплен
            }
            audioDest?.stream.getTracks().forEach((track) => track.stop());
            layer?.classList.remove('rec', 'counting');
            layer?.querySelector('.scc-rec')?.classList.remove('shown');
            recState = 'idle';
            recStop = null;
            recButton(false);
            void api.arm('off').catch(() => undefined);
            wake();
        };
        const fail = (text: string): void => {
            cleanup();
            toast(text);
        };
        try {
            await api.arm('arm');
            display = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: false });
        } catch {
            fail(T.recFail);
            return;
        }
        if (!layer || cancelled) {
            cleanup();
            return;
        }
        display.getVideoTracks()[0]?.addEventListener('ended', () => recStop?.(true));
        video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.srcObject = display;
        try {
            await video.play();
        } catch {
            // кадры пойдут и без этого: проверка размера ниже
        }
        for (let n = 0; n < 20 && !video.videoWidth; n++) await sleep(100);
        if (!video.videoWidth) {
            fail(T.recFail);
            return;
        }
        // Звук трека: приёмник в цепочке сайта, тот же регулятор, что слышит пользователь (его громкость попадёт в ролик)
        const first = core.audioTap?.() ?? null;
        const context = first?.context as AudioContext | undefined;
        if (!first || !context || typeof context.createMediaStreamDestination !== 'function') toast(T.recNoAudio);
        // Отсчёт 3-2-1: сам кадр ещё не пишется, панели видны
        recState = 'count';
        layer.classList.add('counting');
        const count = layer.querySelector<HTMLElement>('.scc-count');
        for (let n = 3; n >= 1 && !cancelled; n--) {
            if (count) {
                count.textContent = '';
                const digit = document.createElement('span');
                digit.textContent = String(n);
                count.append(digit);
            }
            for (let k = 0; k < 4 && !cancelled; k++) await sleep(250);
        }
        if (!layer || cancelled) {
            cleanup();
            return;
        }
        // Всё лишнее убирается до первого кадра: панели, курсор, подсказки. Метка записи только вне выреза
        const frameEl = layer.querySelector<HTMLElement>('.scc-frame');
        if (!frameEl) {
            fail(T.recFail);
            return;
        }
        const frameW = frameEl.offsetWidth;
        const frameH = frameEl.offsetHeight;
        const gap = (window.innerWidth - frameW) / 2;
        layer.classList.remove('counting');
        layer.classList.add('rec');
        layer.querySelector('.scc-rec')?.classList.toggle('shown', vertical && gap >= 128);
        await sleep(400);
        if (!layer || cancelled) {
            cleanup();
            return;
        }
        const crop = clipCrop(frameW, frameH, window.innerWidth, window.innerHeight, video.videoWidth, video.videoHeight);
        const canvas = document.createElement('canvas');
        canvas.width = crop.width;
        canvas.height = crop.height;
        const g = canvas.getContext('2d', { alpha: false });
        if (!g || !crop.sw || !crop.sh) {
            fail(T.recFail);
            return;
        }
        const source = video;
        const draw = (): void => g.drawImage(source, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, crop.width, crop.height);
        draw();
        timers.push(setInterval(draw, 33));
        const out = canvas.captureStream(30);
        if (first && context && typeof context.createMediaStreamDestination === 'function') {
            try {
                audioDest = context.createMediaStreamDestination();
                first.gain.connect(audioDest);
                audioGain = first.gain;
                audioDest.stream.getAudioTracks().forEach((track) => out.addTrack(track));
            } catch {
                audioDest = null;
            }
            // Трек сменился, регулятор у звука другой: приёмник переезжает за ним
            timers.push(setInterval(() => {
                const next = core.audioTap?.() ?? null;
                if (!audioDest || !next || next.gain === audioGain || next.context !== context) return;
                try {
                    if (audioGain) audioGain.disconnect(audioDest);
                    next.gain.connect(audioDest);
                    audioGain = next.gain;
                } catch {
                    // оставляем прежний
                }
            }, 1000));
        }
        try {
            recorder = new MediaRecorder(out, { mimeType: format.mime, videoBitsPerSecond: 8000000, audioBitsPerSecond: 192000 });
        } catch {
            fail(T.recFail);
            return;
        }
        const rec = recorder;
        rec.ondataavailable = (event) => {
            if (event.data.size) chunks.push(event.data);
        };
        rec.onerror = () => recStop?.(false);
        rec.onstop = () => {
            const keep = want;
            cleanup();
            if (!keep) return;
            if (!chunks.length) {
                toast(T.recEmpty);
                return;
            }
            const blob = new Blob(chunks, { type: format.mime.split(';')[0] });
            chunks.length = 0;
            void blob
                .arrayBuffer()
                .then((data) => api.save(data, label, format.ext))
                .then((file) => {
                    if (typeof file !== 'string' || !file) {
                        toast(T.recSaveFail);
                        return;
                    }
                    toast((format.ext === 'mp4' ? T.recSaved : T.recWebm).replace('{name}', file.split(/[\\/]/).pop() ?? file));
                })
                .catch(() => toast(T.recSaveFail));
        };
        rec.start(1000);
        recState = 'live';
        void api.arm('live').catch(() => undefined);
        const started = performance.now();
        const dot = layer.querySelector<HTMLElement>('.scc-rec');
        timers.push(setInterval(() => {
            if (dot && dot.classList.contains('shown')) {
                const text = 'REC ' + clipTime(performance.now() - started);
                if (dot.textContent !== text) dot.textContent = text;
            }
        }, 500));
        // Shift+R пишет ровно 15 с, обычная запись — пока не остановят, но не дольше 5 минут
        timers.push(setTimeout(() => recStop?.(true), limit || 300000));
    }

    // ===== Нижняя панель =====
    function dockButton(act: string, label: string, icon: string): HTMLButtonElement {
        const node = tool(act, label, icon);
        node.dataset.icon = icon;
        return node;
    }
    function setIcon(node: HTMLElement | null, icon: string): void {
        if (!node || node.dataset.icon === icon) return;
        node.dataset.icon = icon;
        node.querySelector('svg')?.remove();
        node.insertAdjacentHTML('afterbegin', ICON[icon]);
    }
    function setLabel(node: HTMLElement | null, label: string): void {
        if (!node || node.getAttribute('aria-label') === label) return;
        node.setAttribute('aria-label', label);
        node.title = label;
    }
    function buildDock(): HTMLElement {
        const dock = document.createElement('div');
        dock.className = 'scc-dock';
        dock.setAttribute('role', 'toolbar');
        dock.setAttribute('aria-label', T.controls);
        const time = (kind: string): HTMLElement => {
            const node = document.createElement('span');
            node.className = 'scc-time';
            node.dataset.time = kind;
            node.textContent = '0:00';
            return node;
        };
        const sep = (): HTMLElement => {
            const node = document.createElement('span');
            node.className = 'scc-sep';
            node.setAttribute('aria-hidden', 'true');
            return node;
        };
        const vol = document.createElement('div');
        vol.className = 'scc-vol';
        const track = document.createElement('div');
        track.className = 'scc-vtrack';
        track.tabIndex = 0;
        track.setAttribute('role', 'slider');
        track.setAttribute('aria-label', T.volume);
        track.setAttribute('aria-valuemin', '0');
        track.setAttribute('aria-valuemax', '100');
        track.append(document.createElement('i'), document.createElement('b'));
        track.addEventListener('pointerdown', startVolume);
        vol.append(dockButton('mute', T.mute, 'vol'), track);
        // Колесо над громкостью меняет громкость, а не перематывает трек
        vol.addEventListener('wheel', (event) => {
            if (!event.deltaY) return;
            event.preventDefault();
            event.stopPropagation();
            setVolume(clipVolumeStep(core.volume(), event.deltaY < 0 ? 0.05 : -0.05));
            wake();
        }, { passive: false });
        const like = dockButton('like', T.like, 'heart');
        like.setAttribute('aria-pressed', 'false');
        like.append(document.createElement('i'));
        dock.append(time('at'), dockButton('back', T.back, 'back'), dockButton('play', T.play, 'play'), dockButton('forward', T.forward, 'forward'), time('total'), sep(), vol, sep(), like);
        dock.addEventListener('click', (event) => {
            const control = (event.target as Element | null)?.closest<HTMLElement>('button[data-clip]');
            switch (control?.dataset.clip) {
                case 'back': seekBy(-10000); break;
                case 'forward': seekBy(10000); break;
                case 'play': core.togglePlay(); setTimeout(poll, 80); break;
                case 'mute': toggleMute(); break;
                case 'like': toggleLike(); break;
            }
        });
        // Пока курсор над панелью, она не прячется
        dock.addEventListener('pointerenter', () => {
            dockHover = true;
            wake();
        });
        dock.addEventListener('pointerleave', () => {
            dockHover = false;
            wake();
        });
        return dock;
    }
    function paintDock(now: ClipNow | null): void {
        const dock = layer?.querySelector<HTMLElement>('.scc-dock');
        if (!dock || !now) return;
        const play = dock.querySelector<HTMLElement>('[data-clip="play"]');
        setIcon(play, now.playing ? 'pause' : 'play');
        setLabel(play, now.playing ? T.pause : T.play);
        const at = dock.querySelector<HTMLElement>('[data-time="at"]');
        const total = dock.querySelector<HTMLElement>('[data-time="total"]');
        const atText = clipTime(now.positionMs);
        if (at && at.textContent !== atText) at.textContent = atText;
        const totalText = clipTime(now.durationMs);
        if (total && total.textContent !== totalText) total.textContent = totalText;
        if (!volDrag) paintVolume(core.volume());
        // Лайк: до ответа сайта показывается то, что нажали, потом состояние кнопки сайта
        const like = dock.querySelector<HTMLElement>('[data-clip="like"]');
        const site = core.liked();
        if (likeWant !== null && (site === likeWant || performance.now() > likeUntil)) likeWant = null;
        const liked = likeWant ?? site;
        if (like) {
            like.setAttribute('aria-pressed', String(!!liked));
            like.setAttribute('aria-disabled', String(liked === null));
            setLabel(like, liked === null ? T.noLike : liked ? T.unlike : T.like);
        }
    }
    function paintVolume(level: number): void {
        const vol = layer?.querySelector<HTMLElement>('.scc-vol');
        if (!vol) return;
        const value = Math.max(0, Math.min(1, Number.isFinite(level) ? level : 0));
        const track = vol.querySelector<HTMLElement>('.scc-vtrack');
        track?.style.setProperty('--v', String(value));
        track?.setAttribute('aria-valuenow', String(Math.round(value * 100)));
        const button = vol.querySelector<HTMLElement>('[data-clip="mute"]');
        setIcon(button, clipVolumeIcon(value));
        setLabel(button, value > 0 ? T.mute : T.unmute);
        vol.dataset.muted = String(!(value > 0));
    }
    function setVolume(value: number): void {
        core.setVolume(value);
        paintVolume(value);
    }
    function toggleMute(): void {
        core.toggleMute();
        // Сайт отвечает с задержкой: значок догоняет его чуть позже
        setTimeout(() => {
            if (!volDrag) paintVolume(core.volume());
        }, 90);
    }
    function toggleLike(): void {
        const was = likeWant ?? core.liked();
        if (was === null) return;
        core.toggleLike();
        likeWant = !was;
        likeUntil = performance.now() + 1500;
        const like = layer?.querySelector<HTMLElement>('.scc-dock [data-clip="like"]');
        if (!like) return;
        like.setAttribute('aria-pressed', String(likeWant));
        setLabel(like, likeWant ? T.unlike : T.like);
        like.classList.remove('pop');
        if (likeWant) {
            void like.offsetWidth;
            like.classList.add('pop');
        }
    }
    function startVolume(event: PointerEvent): void {
        if (event.button !== 0) return;
        const track = event.currentTarget as HTMLElement;
        event.preventDefault();
        event.stopPropagation();
        track.focus({ preventScroll: true });
        volDrag = true;
        track.classList.add('drag');
        const move = (point: PointerEvent): void => {
            const rect = track.getBoundingClientRect();
            setVolume(rect.width > 0 ? Math.max(0, Math.min(1, (point.clientX - rect.left) / rect.width)) : 0);
            wake();
        };
        const stop = (): void => {
            window.removeEventListener('pointermove', move, true);
            window.removeEventListener('pointerup', stop, true);
            window.removeEventListener('pointercancel', stop, true);
            track.classList.remove('drag');
            volDrag = false;
            wake();
        };
        window.addEventListener('pointermove', move, true);
        window.addEventListener('pointerup', stop, true);
        window.addEventListener('pointercancel', stop, true);
        move(event);
    }

    // ===== Перемотка =====
    function seekBy(delta: number): void {
        const now = core.now();
        if (!now || !(now.durationMs > 0)) return;
        core.seek(clipSeekStep(now.positionMs, now.durationMs, delta));
        lyrLine = -2;
        setTimeout(poll, 60);
    }
    function startSeek(event: PointerEvent): void {
        if (event.button !== 0) return;
        const bar = event.currentTarget as HTMLElement;
        event.preventDefault();
        event.stopPropagation();
        dragging = true;
        bar.classList.add('drag');
        let fraction = 0;
        const move = (point: PointerEvent): void => {
            const rect = bar.getBoundingClientRect();
            fraction = rect.width > 0 ? Math.max(0, Math.min(1, (point.clientX - rect.left) / rect.width)) : 0;
            bar.style.setProperty('--scc-p', String(fraction));
            barP = fraction;
            drawWave();
        };
        const stop = (): void => {
            window.removeEventListener('pointermove', move, true);
            window.removeEventListener('pointerup', stop, true);
            window.removeEventListener('pointercancel', stop, true);
            bar.classList.remove('drag');
            dragging = false;
            const now = core.now();
            if (now && now.durationMs > 0) core.seek(clipSeekStep(0, now.durationMs, fraction * now.durationMs));
            lyrLine = -2;
            setTimeout(poll, 60);
        };
        window.addEventListener('pointermove', move, true);
        window.addEventListener('pointerup', stop, true);
        window.addEventListener('pointercancel', stop, true);
        move(event);
    }
    let wheelAt = 0;
    const onWheel = (event: WheelEvent): void => {
        if (!layer || !event.deltaY) return;
        event.preventDefault();
        // Тачпад шлёт десятки событий: шаг не чаще раза в 120 мс
        const stamp = performance.now();
        if (stamp - wheelAt < 120) return;
        wheelAt = stamp;
        seekBy(event.deltaY > 0 ? 5000 : -5000);
        wake();
    };

    const wake = (): void => {
        if (!layer) return;
        layer.classList.remove('idle');
        clearTimeout(idleTimer);
        idleTimer = setTimeout(rest, 2000);
    };
    // Панели прячутся, только пока трек играет и курсор не над нижней панелью: на паузе управление нужно под рукой
    function rest(): void {
        if (!layer || dockHover || volDrag || (lastNow && !lastNow.playing)) return;
        layer.classList.add('idle');
    }
    const onKey = (event: KeyboardEvent): void => {
        if (!layer || event.ctrlKey || event.metaKey || event.altKey) return;
        const key = event.key.toLowerCase();
        const target = event.target instanceof Element ? event.target : null;
        // Дорожка громкости в фокусе: стрелки и Home/End меняют громкость, а не перематывают
        const volumeKeys: Record<string, number> = { ArrowUp: 0.05, ArrowRight: 0.05, ArrowDown: -0.05, ArrowLeft: -0.05, Home: -1, End: 1 };
        if (target?.closest('.scc-vtrack') && event.key in volumeKeys) {
            setVolume(clipVolumeStep(core.volume(), volumeKeys[event.key]));
            event.preventDefault();
            event.stopPropagation();
            wake();
            return;
        }
        // Пробел и Enter на кнопке панели нажимают её саму, а не ставят паузу второй раз
        if ((event.key === ' ' || event.key === 'Enter') && target?.closest('.scc-dock button, .scc-tools button')) {
            wake();
            return;
        }
        // Идёт запись или отсчёт: Esc останавливает её, раскладка кадра не меняется
        const recording = recState !== 'idle';
        if (event.key === 'Escape' && recording) {
            event.preventDefault();
            event.stopPropagation();
            recStop?.(true);
            return;
        }
        if (recording && (key === 'v' || key === 'м' || key === 'p' || key === 'з' || key === 'f' || key === 'а')) {
            event.preventDefault();
            event.stopPropagation();
            return;
        }
        if (event.key === 'Escape') {
            // В полном экране Esc сначала выходит из него сам браузер
            if (document.fullscreenElement) return;
            event.preventDefault();
            close();
        } else if (key === 'v' || key === 'м') toggleVertical();
        else if (key === 'h' || key === 'р') toggleText();
        else if (key === 'l' || key === 'д') cycleLyrics();
        else if (key === 'p' || key === 'з') toggleSide();
        else if (key === 'f' || key === 'а') void toggleFull();
        else if (key === 'm' || key === 'ь') toggleMute();
        else if (key === 'r' || key === 'к') {
            if (!event.repeat) toggleRecord(event.shiftKey);
        } else if (key === 'b' || key === 'и') {
            if (!event.repeat) toggleFx();
        } else if (key === 'q' || key === 'й') {
            if (!event.repeat) toggleQr();
        }
        else if (event.key === ' ') core.togglePlay();
        else if (event.key === 'ArrowRight') seekBy(event.shiftKey ? 15000 : 5000);
        else if (event.key === 'ArrowLeft') seekBy(event.shiftKey ? -15000 : -5000);
        else return;
        event.preventDefault();
        event.stopPropagation();
        wake();
    };
    function toggleVertical(): void {
        vertical = !vertical;
        save('sc2-clip-vertical', vertical ? 'on' : 'off');
        layout();
        lyrLine = -2;
    }
    function toggleText(): void {
        bare = !bare;
        save('sc2-clip-bare', bare ? 'on' : 'off');
        layout();
    }
    function toggleFx(): void {
        fx = !fx;
        save('sc2-clip-fx', fx ? 'on' : 'off');
        layout();
    }
    function toggleQr(): void {
        qrOn = !qrOn;
        save('sc2-clip-qr', qrOn ? 'on' : 'off');
        layout();
    }
    function cycleLyrics(): void {
        lyricStyle = clipNextStyle(lyricStyle);
        save('sc2-clip-lyrics', lyricStyle);
        layout();
        lyrKey = '';
        paint();
    }
    function toggleSide(): void {
        side = !side;
        save('sc2-clip-side', side ? 'on' : 'off');
        layout();
        lyrKey = '';
        paint();
    }
    async function toggleFull(): Promise<void> {
        try {
            if (document.fullscreenElement) await document.exitFullscreen();
            else await layer?.requestFullscreen?.();
        } catch {
            // полный экран запрещён: остаётся на всё окно
        }
    }
    function onResize(): void {
        // Вырез кадра при записи взят один раз: смена размера окна ломает его, запись на этом заканчивается
        if (recState === 'live') recStop?.(true);
        layout();
        lyrLine = -2;
    }
    function open(): void {
        if (layer || core.disposed()) return;
        returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        layer = document.createElement('div');
        layer.className = 'scc';
        layer.setAttribute('role', 'dialog');
        layer.setAttribute('aria-modal', 'true');
        layer.setAttribute('aria-label', T.mode);
        const bg = document.createElement('div');
        bg.className = 'scc-bg';
        const frame = document.createElement('div');
        frame.className = 'scc-frame';
        const tools = document.createElement('div');
        tools.className = 'scc-tools';
        tools.append(tool('vertical', T.vertical, 'vertical'), tool('lyrics', T.lyrics, 'lyrics'), tool('side', T.side, 'side'), tool('text', T.text, 'text'), tool('rec', T.rec, 'rec'), tool('fx', T.fxLabel, 'fx'), tool('qr', T.qr, 'qr'), tool('full', T.full, 'full'), tool('close', T.close, 'close'));
        tools.addEventListener('click', (event) => {
            const control = (event.target as Element | null)?.closest<HTMLElement>('[data-clip]');
            switch (control?.dataset.clip) {
                case 'vertical': toggleVertical(); break;
                case 'lyrics': cycleLyrics(); break;
                case 'side': toggleSide(); break;
                case 'text': toggleText(); break;
                case 'rec': toggleRecord(false); break;
                case 'fx': toggleFx(); break;
                case 'qr': toggleQr(); break;
                case 'full': void toggleFull(); break;
                case 'close': close(); break;
            }
        });
        // Щелчок по обложке ставит на паузу и снова включает
        frame.addEventListener('click', (event) => {
            if ((event.target as Element | null)?.closest('.scc-art')) core.togglePlay();
        });
        ensureFont();
        dockHover = false;
        volDrag = false;
        likeWant = null;
        const recDot = document.createElement('div');
        recDot.className = 'scc-rec';
        recDot.textContent = 'REC 0:00';
        const countNode = document.createElement('div');
        countNode.className = 'scc-count';
        countNode.setAttribute('aria-hidden', 'true');
        const toastNode = document.createElement('div');
        toastNode.className = 'scc-toast';
        toastNode.setAttribute('role', 'status');
        layer.append(bg, frame, tools, buildDock(), recDot, countNode, toastNode);
        document.body.append(layer);
        layer.addEventListener('pointermove', wake);
        layer.addEventListener('wheel', onWheel, { passive: false });
        window.addEventListener('keydown', onKey, true);
        window.addEventListener('resize', onResize);
        shownArt = '';
        lyrKey = '';
        layout();
        poll();
        wake();
        void layer.offsetWidth;
        layer.classList.add('on');
        tools.querySelector<HTMLElement>('[data-clip="close"]')?.focus({ preventScroll: true });
        timer = setInterval(poll, 250);
        frameId = requestAnimationFrame(loop);
        for (const node of [cardButton, barButton]) node?.setAttribute('aria-pressed', 'true');
    }
    function close(): void {
        if (!layer) return;
        // Запись, идущая при закрытии, заканчивается и сохраняется
        if (recState !== 'idle') recStop?.(true);
        const node = layer;
        layer = null;
        clearInterval(timer);
        clearTimeout(toastTimer);
        closeAnalyser();
        barObserver?.disconnect();
        barCanvas = null;
        fxCanvas = null;
        particles = [];
        fxk = 0;
        fxShown = -1;
        clearTimeout(idleTimer);
        if (frameId) cancelAnimationFrame(frameId);
        frameId = 0;
        window.removeEventListener('keydown', onKey, true);
        window.removeEventListener('resize', onResize);
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
        node.remove();
        for (const button of [cardButton, barButton]) button?.setAttribute('aria-pressed', 'false');
        if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
        returnFocus = null;
    }
    function sync(): void {
        if (core.disposed()) return;
        // Кнопка в баре рядом с громкостью: обложку на всё окно можно открыть с любой страницы сайта
        const host = document.querySelector('.playControls .scv[data-kind="bar"]')?.parentElement;
        if (!host) return;
        barButton ??= opener();
        const volume = host.querySelector('.scv[data-kind="bar"]');
        if (barButton.parentElement !== host || barButton.nextElementSibling !== volume) host.insertBefore(barButton, volume);
    }
    return {
        button() {
            cardButton ??= opener();
            cardButton.setAttribute('aria-pressed', String(!!layer));
            return cardButton;
        },
        open,
        close,
        isOpen: () => !!layer,
        sync,
        dispose() {
            close();
            cardButton?.remove();
            barButton?.remove();
            document.getElementById(STYLE_ID)?.remove();
        },
    };
}
