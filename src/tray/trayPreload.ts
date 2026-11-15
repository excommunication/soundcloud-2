import { contextBridge, ipcRenderer } from 'electron';

// Меню трея: только состояние и действия своего окна
contextBridge.exposeInMainWorld('trayAPI', {
    state: (): Promise<unknown> => ipcRenderer.invoke('tray-popup:state'),
    act: (act: string, value?: unknown) => ipcRenderer.send('tray-popup:act', act, value),
    onState: (listener: (state: unknown) => void) => {
        ipcRenderer.on('tray-popup:state', (_event, state: unknown) => listener(state));
    },
});
