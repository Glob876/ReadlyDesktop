import { contextBridge, ipcRenderer } from "electron";
import type { Command } from "../src/types";
contextBridge.exposeInMainWorld("readly", {
  desktop: true,
  request: (command: Command) => ipcRenderer.invoke("readly:request", command),
  window: (action: string) => {
    if (["minimize", "maximize", "close"].includes(action))
      ipcRenderer.send("readly:window", action);
  },
});
