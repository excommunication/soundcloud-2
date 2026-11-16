import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

// Экрану обновления нужны три канала: получать состояние, «Позже»/«Закрыть» и главная кнопка («Повторить», «Открыть страницу»)
contextBridge.exposeInMainWorld('updateScreen', {
    onState: (listener: (state: unknown) => void) => {
        if (typeof listener !== 'function') return;
        ipcRenderer.on('update-screen-state', (_event: IpcRendererEvent, state: unknown) => listener(state));
    },
    later: () => ipcRenderer.send('update-screen-later'),
    action: () => ipcRenderer.send('update-screen-action'),
});
