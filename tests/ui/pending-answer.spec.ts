import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

for (const correct of [false, true]) {
  test(`navigation during a pending ${correct ? "correct" : "incorrect"} answer preserves the settings form`, async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "readly-pending-"));
    const app = await electron.launch({
      args: ["."],
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
