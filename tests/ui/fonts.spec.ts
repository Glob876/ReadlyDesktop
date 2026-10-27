import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

test("bundled fonts render Cyrillic offline and persist after restart", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "readly-fonts-"));
  const launch = () => electron.launch({
    args: [".", "--ozone-platform=x11"],
    env: { ...process.env, XDG_DATA_HOME: path.join(dir, "xdg"), READLY_DATA_DIR: dir },
  });
  let app = await launch();
  try {
    let page = await app.firstWindow();
    await page.context().setOffline(true);
    await page.getByRole("button", { name: "Настройки", exact: true }).click();
    await page.getByRole("tab", { name: "Оформление" }).click();
    for (const [id, family] of [["onest", "Onest"], ["manrope", "Manrope"], ["inter", "Inter"], ["golos-text", "Golos Text"], ["rubik", "Rubik"]]) {
      await page.locator('[name="fontFamily"]').selectOption(id);
      await expect(page.locator(".font-preview")).toHaveCSS("font-family", new RegExp(family));
      // A returned FontFace confirms a bundled font loaded, rather than a system fallback.
      expect(await page.evaluate(async (family) => {
        const faces = await document.fonts.load(`24px "${family}"`, "Мороз и солнце; день чудесный! Hello");
        return faces.length > 0 && faces.every((face) => face.status === "loaded");
      }, family)).toBe(true);
      await page.getByRole("button", { name: "Сохранить", exact: true }).click();
      await expect(page.getByText("Настройки сохранены", { exact: true })).toBeVisible();
    }
    await page.locator('[name="fontFamily"]').selectOption("onest");
    await page.getByRole("button", { name: "Сохранить", exact: true }).click();
    await expect(page.getByText("Настройки сохранены", { exact: true })).toBeVisible();
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await page.context().setOffline(true);
    await page.getByRole("button", { name: "Настройки", exact: true }).click();
    await page.getByRole("tab", { name: "Оформление" }).click();
    await expect(page.locator('[name="fontFamily"]')).toHaveValue("onest");
    await page.getByRole("button", { name: "Стихотворение", exact: true }).click();
    await page.getByRole("button", { name: "Начать учить", exact: true }).click();
    await expect(page.locator(".source-text")).toHaveCSS("font-family", "Onest, sans-serif");
    await expect(page.locator("#answer")).toHaveCSS("font-family", "Onest, sans-serif");
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});
