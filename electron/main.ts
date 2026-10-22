import { app, BrowserWindow, ipcMain, shell } from "electron";
import { spawn, ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import path from "node:path";
import type { Command, Result } from "../src/types";
let win: BrowserWindow | null = null;
let core: ChildProcessWithoutNullStreams;
let serial = 0;
let failure = "";
const pending = new Map<
  number,
  {
    resolve: (v: Result) => void;
    reject: (e: Error) => void;
    timer: NodeJS.Timeout;
  }
>();
function rejectAll(message: string) {
  failure = message;
  for (const p of pending.values()) {
    clearTimeout(p.timer);
    p.reject(new Error(message));
  }
  pending.clear();
}
function request(command: Command): Promise<Result> {
  if (failure) return Promise.reject(new Error(failure));
  return new Promise((resolve, reject) => {
    const id = ++serial;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("Превышено время ожидания ядра."));
    }, 15000);
    pending.set(id, { resolve, reject, timer });
    core.stdin.write(JSON.stringify({ ...command, id }) + "\n", (error) => {
      if (error) rejectAll("Нет связи с ядром: " + error.message);
    });
  });
}
function createWindow() {
  win = new BrowserWindow({
    width: 1260,
    height: 850,
    minWidth: 880,
    minHeight: 640,
    title: "Readly",
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event) => event.preventDefault());
  const url = process.env.READLY_DEV_URL;
  if (url) void win.loadURL(url);
  else void win.loadFile(path.join(__dirname, "../../dist/index.html"));
  win.on("closed", () => {
    win = null;
  });
}
if (process.env.READLY_DATA_DIR)
  app.setPath("userData", path.resolve(process.env.READLY_DATA_DIR));
app.whenReady().then(() => {
  const binary = app.isPackaged
    ? path.join(
        process.resourcesPath,
        "readly-core" + (process.platform === "win32" ? ".exe" : ""),
      )
    : path.join(
        app.getAppPath(),
        "native/target/release/readly-core" +
          (process.platform === "win32" ? ".exe" : ""),
      );
  core = spawn(binary, [path.join(app.getPath("userData"), "progress.json")], {
    stdio: "pipe",
    windowsHide: true,
  });
  let diagnostics = "";
  core.stderr.on("data", (b) => {
    diagnostics = (diagnostics + String(b)).slice(-4000);
  });
  core.on("error", (e) => rejectAll("Не удалось запустить Rust: " + e.message));
  core.on("exit", () =>
    rejectAll(
      diagnostics || "Ядро завершило работу. Перезапустите приложение.",
    ),
  );
  core.stdin.on("error", () =>
    rejectAll("Нет связи с ядром. Перезапустите приложение."),
  );
  createInterface({ input: core.stdout }).on("line", (line) => {
    try {
      const msg = JSON.parse(line);
      const p = pending.get(msg.id);
      if (!p) return;
      clearTimeout(p.timer);
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error));
      else p.resolve(msg.result);
    } catch {
      rejectAll("Некорректный ответ ядра.");
    }
  });
  ipcMain.handle("readly:request", (event, command: Command) => {
    if (
      event.sender !== win?.webContents ||
      event.senderFrame !== win.webContents.mainFrame
    )
      throw new Error("Недопустимый отправитель");
    if (!command || JSON.stringify(command).length > 150_000)
      throw new Error("Некорректный запрос");
    return request(command);
  });
  ipcMain.on("readly:window", (event, action) => {
    if (event.sender !== win?.webContents) return;
    if (action === "minimize") win?.minimize();
    if (action === "maximize") {
      if (win?.isMaximized()) win.unmaximize();
      else win?.maximize();
    }
    if (action === "close") win?.close();
  });
  createWindow();
  app.on("activate", () => {
    if (!win) createWindow();
  });
});
app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => {
  core?.kill();
});
