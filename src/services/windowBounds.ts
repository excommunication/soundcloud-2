// Размер окна (2.9.0): у окна не было минимума, его можно было сжать до полоски, и сайт с блоком волны ломался
// (название трека по букве в строке). Сохранённый размер из прошлого запуска тоже мог оказаться меньше минимума
// или больше экрана после смены монитора. Здесь только расчёт, окно и экран подставляет main
export const WINDOW_MIN = { width: 860, height: 600 } as const;

export interface Size { width: number; height: number }
export interface Box extends Size { x?: number; y?: number }

/** Размер не меньше минимума и не больше рабочей области экрана; позиция остаётся, если окно целиком на экране */
export function fitWindowBounds(saved: Box, work: Box & { x: number; y: number }): Box {
    const cap = (value: number, min: number, max: number): number => Math.round(Math.max(Math.min(min, max), Math.min(Number.isFinite(value) ? value : max, max)));
    const width = cap(saved.width, WINDOW_MIN.width, work.width);
    const height = cap(saved.height, WINDOW_MIN.height, work.height);
    const fits = saved.x !== undefined && saved.y !== undefined && Number.isFinite(saved.x) && Number.isFinite(saved.y) &&
        saved.x >= work.x - 8 && saved.y >= work.y - 8 && saved.x + width <= work.x + work.width + 8 && saved.y + height <= work.y + work.height + 8;
    // Окно вылезло за экран: без позиции Electron ставит его по центру
    return fits ? { x: saved.x, y: saved.y, width, height } : { width, height };
}

/** Места видов под шапкой: шапка во всю ширину, страница под ней, без отрицательной высоты в крошечном окне */
export function contentLayout(size: Size, header: number): { header: Box & { x: number; y: number }; page: Box & { x: number; y: number } } {
    const width = Math.max(0, Math.round(size.width));
    const height = Math.max(0, Math.round(size.height));
    const top = Math.min(header, height);
    return { header: { x: 0, y: 0, width, height: top }, page: { x: 0, y: top, width, height: Math.max(0, height - top) } };
}
