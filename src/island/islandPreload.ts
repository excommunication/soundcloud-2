import { contextBridge, ipcRenderer } from 'electron';

// Остров: только своё состояние, действия и то, над плашкой ли мышь
contextBridge.exposeInMainWorld('islandAPI', {
    state: (): Promise<unknown> => ipcRenderer.invoke('island:state'),
    act: (act: string) => ipcRenderer.send('island:act', act),
    hover: (inside: boolean | 'ghost') => ipcRenderer.send('island:hover', inside === 'ghost' ? 'ghost' : inside === true),
    drag: (phase: 'press' | 'start' | 'end') => ipcRenderer.send('island:drag', phase),
    shape: (rect: { x: number; y: number; width: number; height: number; radius: number }) => ipcRenderer.send('island:shape', rect),
    volume: (value?: number | 'mute'): Promise<number> => ipcRenderer.invoke('island:volume', value),
    seek: (fraction: number) => ipcRenderer.send('island:seek', fraction),
    onState: (listener: (state: unknown) => void) => {
        ipcRenderer.on('island:state', (_event, state: unknown) => listener(state));
    },
    /** main сам начал или кончил перетаскивание по кнопке мыши */
    onDragState: (listener: (on: boolean) => void) => {
        ipcRenderer.on('island:drag-state', (_event, on: unknown) => listener(on === true));
    },
    /** Сквозной режим кончился: wake — курсор остановился на плашке, sleep — ушёл */
    onWake: (listener: (wake: boolean) => void) => {
        ipcRenderer.on('island:wake', () => listener(true));
        ipcRenderer.on('island:sleep', () => listener(false));
    },
    /** Удар в играющем треке, сила 0..1: приходит, только пока остров виден и трек играет */
    onBeat: (listener: (strength: number) => void) => {
        ipcRenderer.on('island:beat', (_event, strength: unknown) => listener(typeof strength === 'number' && Number.isFinite(strength) ? Math.max(0, Math.min(1, strength)) : 0.6));
    },
    onAnnounce: (listener: () => void) => {
        ipcRenderer.on('island:announce', () => listener());
    },
});
