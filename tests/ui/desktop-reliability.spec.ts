import { test, expect, _electron as electron } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

test("desktop: one instance per profile, reconnect and window geometry", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "readly-desktop-reliable-"));
  const env = { ...process.env, XDG_DATA_HOME: path.join(dir, "xdg"), READLY_DATA_DIR: dir };
  const start = () => electron.launch({ args: [".", "--ozone-platform=x11"], env });
  let app = await start();
  try {
    let page = await app.firstWindow();
    await page.evaluate(() => window.readly.request({ op: "load" }));
    const duplicate = spawn(app.process().spawnfile, [".", "--ozone-platform=x11"], { env, stdio: "ignore" });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { duplicate.kill(); reject(new Error("Второй экземпляр не завершился")); }, 10_000);
      duplicate.once("error", (error) => { clearTimeout(timer); reject(error); });
      duplicate.once("exit", (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`Exit ${code}`)); });
    });
    const other = await electron.launch({ args: [".", "--ozone-platform=x11"], env: { ...env, READLY_DATA_DIR: path.join(dir, "other-profile") } });
    try {
      const otherPage = await other.firstWindow();
      expect((await otherPage.evaluate(() => window.readly.request({ op: "load" }))).state.poem.text).toBeTruthy();
    } finally { await other.close(); }
    expect((await page.evaluate(() => window.readly.reconnect())).state.poem.text).toBeTruthy();
    await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      window.unmaximize();
      window.setBounds({ x: 30, y: 30, width: 1000, height: 720 });
    });
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getNormalBounds().width)).toBe(1000);
    await app.close();
    const saved = JSON.parse(await readFile(path.join(dir, "window.json"), "utf8"));
    expect(saved.width).toBe(1000);
    expect(saved.height).toBe(720);
    app = await start();
    page = await app.firstWindow();
    // Chromium clamps initial bounds to the display, including small Xvfb screens.
    const expectedWidth = await app.evaluate(({ screen }, width) => Math.max(880, Math.min(width, screen.getPrimaryDisplay().workArea.width)), saved.width);
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds().width)).toBe(expectedWidth);
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds().x)).toBe(saved.x);
    expect((await page.evaluate(() => window.readly.request({ op: "load" }))).state.poem.text).toBeTruthy();
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("desktop: native TXT import and library JSON preserve progress", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "readly-dialogs-"));
  const app = await electron.launch({ args: [".", "--ozone-platform=x11"], env: { ...process.env, READLY_DATA_DIR: dir, XDG_DATA_HOME: path.join(dir, "xdg") } });
  try {
    const page = await app.firstWindow();
    const file = path.join(dir, "Импорт.txt");
    await writeFile(file, "Строка первая.\n\nВторая строфа.");
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [file] })) as typeof dialog.showOpenDialog;
    }, file);
    const poem = await page.evaluate(() => window.readly.importText());
    expect(poem?.title).toBe("Импорт");
    await page.evaluate((poem) => window.readly.request({ op: "savePoem", poem: poem! }), poem);
    await page.evaluate(() => window.readly.request({ op: "start" }));
    await page.evaluate(() => window.readly.request({ op: "submit", answer: "Строка первая." }));
    const exported = path.join(dir, "library.json");
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = (async () => ({ canceled: false, filePath: file })) as typeof dialog.showSaveDialog;
    }, exported);
    expect(await page.evaluate(() => window.readly.exportLibrary())).toBe(true);
    const json = JSON.parse(await readFile(exported, "utf8"));
    expect(json.format).toBe("readly-library");
    expect(JSON.stringify(json.snapshot)).toContain("Строка первая.");
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [file] })) as typeof dialog.showOpenDialog;
    }, exported);
    const imported = await page.evaluate(() => window.readly.importLibrary());
    expect(imported?.state.position).toBe(1);
    await app.evaluate(({ dialog }) => {
      dialog.showOpenDialog = (async () => ({ canceled: true, filePaths: [] })) as typeof dialog.showOpenDialog;
    });
    expect(await page.evaluate(() => window.readly.importText())).toBeNull();
    expect(await page.evaluate(() => window.readly.importLibrary())).toBeNull();
    await writeFile(exported, "{broken");
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [file] })) as typeof dialog.showOpenDialog;
    }, exported);
    await expect(page.evaluate(() => window.readly.importLibrary())).rejects.toThrow(/корректный JSON/);
    expect((await page.evaluate(() => window.readly.request({ op: "load" }))).state.position).toBe(1);
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});
