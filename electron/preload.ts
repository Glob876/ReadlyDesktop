import { contextBridge, ipcRenderer } from "electron";
import type { Command } from "../src/types";
contextBridge.exposeInMainWorld("readly", {
  desktop: true,
  onWindowExpanded: (callback: (expanded: boolean) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, expanded: boolean) => callback(expanded);
    ipcRenderer.on("readly:window-expanded", listener);
    return () => ipcRenderer.removeListener("readly:window-expanded", listener);
  },
  request: (command: Command) => ipcRenderer.invoke("readly:request", command),
  window: (action: string) => {
    if (["minimize", "maximize", "close"].includes(action))
      ipcRenderer.send("readly:window", action);
  },
});
