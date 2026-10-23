import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

for (const correct of [false, true]) {
  test(`navigation during a pending ${correct ? "correct" : "incorrect"} answer preserves the settings form`, async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "readly-pending-"));
    const app = await electron.launch({
      args: [".", "--ozone-platform=x11"],
      env: { ...process.env, XDG_DATA_HOME: path.join(dir, "xdg"), READLY_DATA_DIR: dir },
    });
    try {
      const page = await app.firstWindow();
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.getByRole("button", { name: "Начать учить", exact: true }).click();
      await expect(page.locator("#answer")).toBeVisible();
      const result = await page.evaluate(() => window.readly.request({ op: "load" }));
      // Hold the IPC response until after navigation, without relying on timing.
      await app.evaluate(({ ipcMain }, response) => {
        ipcMain.removeHandler("readly:request");
        ipcMain.handle("readly:request", () => new Promise((resolve) => {
          (globalThis as any).finishAnswer = () => resolve(response);
        }));
      }, { ...result, correct, message: "Есть неточности." });
      await page.locator("#answer").fill("Ответ");
      await page.evaluate(() => {
        document.querySelector<HTMLButtonElement>("#submit")!.click();
        document.querySelector<HTMLButtonElement>('[data-page="settings"]')!.click();
      });
      await expect.poll(() => app.evaluate(() => typeof (globalThis as any).finishAnswer)).toBe("function");
      await page.locator('[name="title"]').evaluate((input: HTMLInputElement) => {
        input.value = "Несохранённый черновик";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.focus();
      });
      await app.evaluate(() => (globalThis as any).finishAnswer());
      await expect(page.locator("#app")).not.toHaveAttribute("aria-busy", "true");
      await page.evaluate(() => undefined);
      expect(errors).toEqual([]);
      await expect(page.locator('[name="title"]')).toHaveValue("Несохранённый черновик");
      await expect(page.locator('[name="title"]')).toBeFocused();
      await expect(page.getByRole("heading", { name: "Настройки", exact: true })).toBeVisible();
    } finally {
      await app.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
}

for (const tab of ["poem", "appearance"]) {
  test(`navigation during a pending ${tab} save preserves the new page`, async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "readly-save-"));
    const app = await electron.launch({ args: [".", "--ozone-platform=x11"], env: { ...process.env, READLY_DATA_DIR: dir, XDG_DATA_HOME: path.join(dir, "xdg") } });
    try {
      const page = await app.firstWindow();
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      const response = await page.evaluate(() => window.readly.request({ op: "load" }));
      await app.evaluate(({ ipcMain }, response) => {
        ipcMain.removeHandler("readly:request");
        ipcMain.handle("readly:request", () => new Promise(resolve => {
          (globalThis as any).finishSave = () => resolve(response);
        }));
      }, response);
      await page.getByRole("button", { name: "Настройки", exact: true }).click();
      if (tab === "poem") await page.locator('[name="title"]').fill("Изменённое название");
      else await page.getByRole("tab", { name: "Оформление" }).click();
      await page.getByRole("button", { name: tab === "poem" ? "Сохранить стихотворение" : "Сохранить", exact: true }).click();
      await expect.poll(() => app.evaluate(() => typeof (globalThis as any).finishSave)).toBe("function");
      await page.getByRole("button", { name: "Мои стихотворения", exact: true }).click();
      await page.locator("#personal-search").fill("Несохранённый поиск");
      await app.evaluate(() => (globalThis as any).finishSave());
      await expect(page.locator("#app")).not.toHaveAttribute("aria-busy", "true");
      await expect(page.locator("#personal-search")).toHaveValue("Несохранённый поиск");
      await expect(page.getByRole("heading", { name: "Мои стихотворения", exact: true })).toBeVisible();
      expect(errors).toEqual([]);
    } finally { await app.close(); await rm(dir, { recursive: true, force: true }); }
  });
}
