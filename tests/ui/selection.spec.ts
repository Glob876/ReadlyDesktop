import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

test("select all fades in the accent highlight while native editing remains immediate", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "readly-selection-"));
  const app = await electron.launch({
    args: ["."],
    env: { ...process.env, XDG_DATA_HOME: path.join(dir, "xdg"), READLY_DATA_DIR: dir },
  });
  try {
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "Настройки", exact: true }).click();
    await page.getByRole("tab", { name: "Оформление" }).click();
    await page.getByRole("radio", { name: "Синий", exact: true }).check();
    await page.getByRole("tab", { name: "Стихотворение", exact: true }).click();
    const title = page.locator('[name="title"]');
    await title.fill("Текст для выделения");
    await title.press("Control+a");
    const colors = await title.evaluate((field: HTMLInputElement) => {
      const animation = field.getAnimations().find((a) => a.effect instanceof KeyframeEffect && a.effect.getKeyframes().some((key) => "--selection-strength" in key))!;
      animation.pause();
      return [0, 110, 220].map((time) => {
        animation.currentTime = time;
        return getComputedStyle(field, "::selection").backgroundColor;
      });
    });
    expect(new Set(colors).size).toBe(3);
    expect(colors[0]).toMatch(/\/ 0\)/);
    expect(colors[2]).toMatch(/\/ 0.32\)/);
    // Blue is #3e6694; assert the highlight uses that palette, not the OS selection color.
    expect(colors[2]).toMatch(/0.243137 0.4 0.580392/);
    await expect(title).toHaveJSProperty("selectionStart", 0);
    await expect(title).toHaveJSProperty("selectionEnd", "Текст для выделения".length);
    await title.press("Backspace");
    await expect(title).toHaveValue("");

    const poem = page.locator('[name="poem"]');
    const text = "Первая строка\nВторая строка\n\nНовая строфа";
    await poem.fill(text);
    await poem.press("Control+a");
    await expect(poem).toHaveJSProperty("selectionEnd", text.length);
    await poem.evaluate((field) => {
      const animation = field.getAnimations().find((a) => a.effect instanceof KeyframeEffect && a.effect.getKeyframes().some((key) => "--selection-strength" in key))!;
      animation.pause();
      animation.currentTime = 0;
    });
    await page.screenshot({ path: "test-results/selection-start.png" });
    await poem.evaluate((field) => {
      const animation = field.getAnimations().find((a) => a.effect instanceof KeyframeEffect && a.effect.getKeyframes().some((key) => "--selection-strength" in key))!;
      animation.currentTime = 220;
    });
    await page.screenshot({ path: "test-results/selection-end.png" });
    // Replacing the selection works even while the effect is in progress.
    await poem.pressSequentially("Замена");
    await expect(poem).toHaveValue("Замена");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await poem.press("Control+a");
    await expect(poem).toHaveJSProperty("selectionEnd", "Замена".length);
    expect(await poem.evaluate((field) => field.getAnimations().length)).toBe(0);
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});
