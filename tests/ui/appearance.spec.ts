import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

test("window corners follow native state and appearance colors animate", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "readly-appearance-"));
  const app = await electron.launch({
    args: ["."],
    env: { ...process.env, XDG_DATA_HOME: path.join(dir, "xdg"), READLY_DATA_DIR: dir },
  });
  try {
    const page = await app.firstWindow();
    await expect(page.locator(".window")).toHaveCSS("border-top-left-radius", "10px");
    const window = await app.browserWindow(page);
    await page.getByRole("button", { name: "Развернуть", exact: true }).click();
    await expect.poll(() => window.evaluate((win) => win.isMaximized())).toBe(true);
    await expect(page.locator(".window")).toHaveCSS("border-top-left-radius", "0px");
    await page.reload();
    await expect(page.locator(".window")).toHaveCSS("border-top-left-radius", "0px");
    await page.getByRole("button", { name: "Развернуть", exact: true }).click();
    await expect(page.locator(".window")).toHaveCSS("border-top-left-radius", "10px");
    await window.evaluate((win) => win.setFullScreen(true));
    await expect(page.locator(".window")).toHaveCSS("border-top-left-radius", "0px");
    await window.evaluate((win) => win.setFullScreen(false));
    await expect(page.locator(".window")).toHaveCSS("border-top-left-radius", "10px");

    await page.getByRole("button", { name: "Настройки", exact: true }).click();
    await page.getByRole("tab", { name: "Оформление" }).click();
    // Capture actual CSS transitions immediately after a change, in the same frame.
    const animatedProperties = async (selector: string, target: string) => page.evaluate(({ selector, target }) => {
      const element = document.querySelector(target)!;
      getComputedStyle(element).backgroundColor;
      document.querySelector<HTMLInputElement>(selector)!.click();
      getComputedStyle(element).backgroundColor;
      return element.getAnimations().map((animation) => (animation as CSSTransition).transitionProperty);
    }, { selector, target });
    expect(await animatedProperties('[name="accent"][value="blue"]', '.primary')).toContain("background-color");
    await expect(page.locator(".primary").first()).toHaveCSS("background-color", "rgb(62, 102, 148)");
    expect(await animatedProperties('[name="theme"][value="dark"]', '.window')).toContain("background-color");
    await expect(page.locator(".primary").first()).toHaveCSS("background-color", "rgb(155, 188, 229)");
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(await animatedProperties('[name="theme"][value="light"]', '.window')).toEqual([]);
    await expect(page.locator(".primary").first()).toHaveCSS("background-color", "rgb(62, 102, 148)");
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});
