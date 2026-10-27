import { app, BrowserWindow, dialog, ipcMain, nativeImage, screen, shell } from "electron";
import path from "node:path";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { CoreConnection } from "./core";
import { libraryExportFile, libraryImportCommand, MAX_TEXT_BYTES, readImportFile, textPoem, validateCommand } from "./files";
import type { Command, Result } from "../src/types";
let win: BrowserWindow | null = null;
let core: CoreConnection;
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
interface WindowState { x?: number; y?: number; width: number; height: number; maximized?: boolean }
function loadWindowState(): WindowState {
  const fallback = { width: 1260, height: 850 };
  try {
    const state = JSON.parse(readFileSync(path.join(app.getPath("userData"), "window.json"), "utf8")) as WindowState;
    if (![state.width, state.height, state.x, state.y].every(Number.isFinite) || state.width < 880 || state.height < 640) return fallback;
    const visible = screen.getAllDisplays().some(({ workArea: area }) =>
      Math.min(state.x! + state.width, area.x + area.width) - Math.max(state.x!, area.x) >= 100 &&
      Math.min(state.y! + state.height, area.y + area.height) - Math.max(state.y!, area.y) >= 100);
    return visible ? state : fallback;
  } catch { return fallback; }
}
function createWindow() {
  const savedWindow = loadWindowState();
  win = new BrowserWindow({
    ...savedWindow,
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
  if (savedWindow.maximized) win.maximize();
  win.on("close", () => {
    if (!win) return;
    const file = path.join(app.getPath("userData"), "window.json");
    try {
      writeFileSync(file + ".tmp", JSON.stringify({ ...win.getNormalBounds(), maximized: win.isMaximized() }));
      renameSync(file + ".tmp", file);
    } catch (error) { console.warn("Не удалось сохранить положение окна:", error); }
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
const ownsProfile = app.requestSingleInstanceLock();
if (!ownsProfile) app.quit();
app.on("second-instance", () => {
  if (win?.isMinimized()) win.restore();
  win?.show();
  win?.focus();
});
if (ownsProfile) app.whenReady().then(async () => {
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
  core = new CoreConnection(binary, [path.join(app.getPath("userData"), "progress.json")]);
  const assertSender = (event: Electron.IpcMainInvokeEvent) => {
    if (event.sender !== win?.webContents || event.senderFrame !== win.webContents.mainFrame)
      throw new Error("Недопустимый отправитель");
  };
  ipcMain.handle("readly:request", (event, command: Command) => {
    assertSender(event);
    validateCommand(command);
    return core.request(command);
  });
  ipcMain.handle("readly:reconnect", (event) => {
    assertSender(event);
    return core.reconnect();
  });
  ipcMain.handle("readly:import-text", async (event) => {
    assertSender(event);
    const selected = await dialog.showOpenDialog(win!, {
      title: "Импорт стихотворения", properties: ["openFile"],
      filters: [{ name: "Текст UTF-8", extensions: ["txt"] }],
    });
    if (selected.canceled || !selected.filePaths[0]) return null;
    const file = selected.filePaths[0];
    return textPoem(file, await readImportFile(file, MAX_TEXT_BYTES + 3));
  });
  ipcMain.handle("readly:export-library", async (event) => {
    assertSender(event);
    const selected = await dialog.showSaveDialog(win!, {
      title: "Экспорт библиотеки с прогрессом", defaultPath: "readly-library.json",
      filters: [{ name: "Библиотека Readly", extensions: ["json"] }],
    });
    if (selected.canceled || !selected.filePath) return false;
    const result = await core.request({ op: "exportLibrary" } as Command) as Result & { snapshot?: unknown };
    if (!result.snapshot) throw new Error("Ядро не вернуло библиотеку.");
    const temporary = selected.filePath + "." + randomUUID() + ".tmp";
    try {
      await writeFile(temporary, libraryExportFile(result.snapshot), { flag: "wx", mode: 0o600 });
      await rename(temporary, selected.filePath);
    } finally { await rm(temporary, { force: true }); }
    return true;
  });
  ipcMain.handle("readly:import-library", async (event) => {
    assertSender(event);
    const selected = await dialog.showOpenDialog(win!, {
      title: "Импорт библиотеки", properties: ["openFile"],
      filters: [{ name: "Библиотека Readly", extensions: ["json"] }],
    });
    if (selected.canceled || !selected.filePaths[0]) return null;
    let data: unknown;
    try { data = JSON.parse(await readImportFile(selected.filePaths[0])); }
    catch (error) {
      if (error instanceof SyntaxError) throw new Error("Файл не содержит корректный JSON.");
      throw error;
    }
    return core.request(libraryImportCommand(data));
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
  core?.close();
});
