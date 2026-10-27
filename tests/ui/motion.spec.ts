import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

test("navigation animates and smooth caret follows editing, selection and scrolling", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "readly-motion-"));
  const app = await electron.launch({
    args: ["."],
    env: { ...process.env, XDG_DATA_HOME: path.join(dir, "xdg"), READLY_DATA_DIR: dir },
  });
  try {
    const page = await app.firstWindow();
    await expect(page.locator(".titlebar")).toHaveCSS("height", "36px");
    const navigation = await page.evaluate(() => {
      document.querySelector<HTMLButtonElement>('[data-page="settings"]')!.click();
      return [".nav-indicator", "#main > .page"].map((selector) => document.querySelector(selector)!.getAnimations().length);
    });
    expect(navigation.every((count) => count > 0)).toBe(true);
    const tabs = await page.evaluate(() => {
      document.querySelector<HTMLButtonElement>('[data-tab="appearance"]')!.click();
      return [".tab-indicator", "#settings-form"].map((selector) => document.querySelector(selector)!.getAnimations().length);
    });
    expect(tabs.every((count) => count > 0)).toBe(true);
    await page.getByRole("tab", { name: "Стихотворение", exact: true }).click();
    await page.locator('[name="title"]').fill("Черновик");
    await page.getByRole("tab", { name: "Проверка текста", exact: true }).click();
    await page.getByRole("tab", { name: "Стихотворение", exact: true }).click();
    await expect(page.locator('[name="title"]')).toHaveValue("Черновик");

    await page.getByRole("button", { name: "Занятие", exact: true }).click();
    await page.getByRole("button", { name: "Начать учить", exact: true }).click();
    const answer = page.locator("#answer");
    await expect(page.locator(".caret-overlay")).toBeVisible();
    const caretX = async () => page.locator(".smooth-caret").evaluate((el) => el.getBoundingClientRect().x);
    const initialX = await caretX();
    await answer.pressSequentially("Мороз");
    await expect.poll(caretX).toBeGreaterThan(initialX + 20);
    const moving = await answer.evaluate(async (el: HTMLTextAreaElement) => {
      el.setRangeText("!", el.selectionStart, el.selectionEnd, "end");
      el.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise(requestAnimationFrame);
      return document.querySelector(".smooth-caret")!.getAnimations().some((a) => (a as CSSTransition).transitionProperty === "transform");
    });
    expect(moving).toBe(true);
    await answer.press("Control+a");
    await expect(page.locator(".caret-overlay")).toBeHidden();
    await answer.press("ArrowRight");
    await expect(page.locator(".caret-overlay")).toBeVisible();
    const firstLineY = (await page.locator(".smooth-caret").boundingBox())!.y;
    await answer.fill("Очень длинная строка ".repeat(8));
    await expect.poll(async () => (await page.locator(".smooth-caret").boundingBox())!.y).toBeGreaterThan(firstLineY + 40);
    await answer.dispatchEvent("compositionstart");
    await expect(page.locator(".caret-overlay")).toBeHidden();
    await expect(answer).not.toHaveClass(/has-smooth-caret/);
    await answer.dispatchEvent("compositionend");
    await expect(page.locator(".caret-overlay")).toBeVisible();
    await answer.fill("Строка\n".repeat(40) + "Конец");
    await expect.poll(() => answer.evaluate((el: HTMLTextAreaElement) => el.scrollTop)).toBeGreaterThan(0);
    await expect.poll(async () => {
      const caret = await page.locator(".smooth-caret").boundingBox();
      const field = await answer.boundingBox();
      return !!caret && !!field && caret.y >= field.y - 1 && caret.y + caret.height <= field.y + field.height + 1;
    }).toBe(true);
    await expect.poll(() => page.locator(".smooth-caret").evaluate((el) => el.getAnimations().some((a) => (a as CSSTransition).transitionProperty === "transform"))).toBe(false);
    await page.screenshot({ path: "test-results/smooth-caret.png" });
    await answer.press("Control+Home");
    await expect.poll(async () => Math.abs(await caretX() - initialX)).toBeLessThan(2);
    await page.getByRole("button", { name: "Стихотворение", exact: true }).click();
    await expect(page.locator(".caret-overlay")).toBeHidden();

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.getByRole("button", { name: "Занятие", exact: true }).click();
    await answer.focus();
    await expect(page.locator(".caret-overlay")).toBeHidden();
    await expect(answer).not.toHaveClass(/has-smooth-caret/);
    expect(await page.locator(".nav-indicator").evaluate((el) => el.getAnimations().length)).toBe(0);
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});
