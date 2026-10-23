import { contextBridge, ipcRenderer } from "electron";
import type { Command } from "../src/types";
contextBridge.exposeInMainWorld("readly", {
  desktop: true,
  reconnect: () => ipcRenderer.invoke("readly:reconnect"),
  importText: () => ipcRenderer.invoke("readly:import-text"),
  exportLibrary: () => ipcRenderer.invoke("readly:export-library"),
  importLibrary: () => ipcRenderer.invoke("readly:import-library"),
  request: (command: Command) => ipcRenderer.invoke("readly:request", command),
  window: (action: string) => {
    if (["minimize", "maximize", "close"].includes(action))
      ipcRenderer.send("readly:window", action);
  },
});
