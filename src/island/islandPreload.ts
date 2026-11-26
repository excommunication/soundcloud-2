import { contextBridge, ipcRenderer } from 'electron';

// Остров: только своё состояние, действия и то, над плашкой ли мышь
contextBridge.exposeInMainWorld('islandAPI', {
    state: (): Promise<unknown> => ipcRenderer.invoke('island:state'),
    act: (act: string) => ipcRenderer.send('island:act', act),
    hover: (inside: boolean) => ipcRenderer.send('island:hover', inside === true),
    volume: (value?: number | 'mute'): Promise<number> => ipcRenderer.invoke('island:volume', value),
    onState: (listener: (state: unknown) => void) => {
        ipcRenderer.on('island:state', (_event, state: unknown) => listener(state));
    },
    onAnnounce: (listener: () => void) => {
        ipcRenderer.on('island:announce', () => listener());
    },
});
