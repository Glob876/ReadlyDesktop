import { app, BrowserWindow, ipcMain, nativeImage, shell } from "electron";
import { spawn, ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import type { Command, Result } from "../src/types";
let win: BrowserWindow | null = null;
let core: ChildProcessWithoutNullStreams;
let serial = 0;
let failure = "";
if (process.platform === "linux") app.setDesktopName("readly-desktop.desktop");

async function registerDesktopIcon() {
  if (process.platform !== "linux") return;
  const directory = path.join(process.env.XDG_DATA_HOME || path.join(homedir(), ".local/share"), "applications");
  const quote = (value: string) => '"' + value.replace(/[\\"\x60$]/g, "\\$&").replace(/%/g, "%%") + '"';
  const command = app.isPackaged
    ? quote(process.execPath)
    : `${quote(process.execPath)} ${quote(app.getAppPath())}`;
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "readly-desktop.desktop"),
    `[Desktop Entry]\nType=Application\nName=Readly\nComment=Заучивание стихотворений\nExec=${command}\nIcon=${path.join(app.getAppPath(), "assets/icon.png")}\nTerminal=false\nCategories=Education;\nStartupWMClass=readly-desktop\n`);
}
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
    icon: path.join(app.getAppPath(), "assets/icon.png"),
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
  const window = win;
  const syncWindowState = () => {
    window.webContents.send("readly:window-expanded", window.isMaximized() || window.isFullScreen());
  };
  window.on("maximize", syncWindowState);
  window.on("unmaximize", syncWindowState);
  window.on("enter-full-screen", syncWindowState);
  window.on("leave-full-screen", syncWindowState);
  window.webContents.on("did-finish-load", syncWindowState);
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
app.whenReady().then(async () => {
  // Wayland resolves taskbar icons through the desktop entry, not window.icon.
  await registerDesktopIcon().catch((error) => console.warn("Не удалось зарегистрировать значок Readly:", error));
  if (process.platform === "darwin")
    app.dock?.setIcon(nativeImage.createFromPath(path.join(app.getAppPath(), "assets/icon.png")));
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
