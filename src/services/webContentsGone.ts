/** Вид, у которого webContents уже снят или уничтожен (после сбоя отрисовки и при выходе webContents бывает undefined) */
export function webContentsGone(view: { webContents?: { isDestroyed(): boolean } | null } | null | undefined): boolean {
    const contents = view?.webContents;
    return !contents || contents.isDestroyed();
}
