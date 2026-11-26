import { contextBridge, ipcRenderer } from 'electron';

// Меню острова: получить пункты и сказать, какой выбран
contextBridge.exposeInMainWorld('islandMenuAPI', {
    items: (): Promise<unknown> => ipcRenderer.invoke('island-menu:items'),
    pick: (id: string) => ipcRenderer.send('island-menu:pick', id),
});
