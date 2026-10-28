import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

test("startup logo grows, docks after five seconds and releases the interface", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "readly-splash-"));
  const app = await electron.launch({
    args: [".", "--ozone-platform=x11"],
    env: { ...process.env, XDG_DATA_HOME: path.join(dir, "xdg"), READLY_DATA_DIR: dir },
  });
  try {
    const page = await app.firstWindow();
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await expect(page.locator(".startup-splash")).toBeVisible();
    await expect.poll(() => page.locator(".startup-logo").evaluate(el => el.getAnimations().length)).toBe(1);
    const sample = (time: number) => page.evaluate(time => {
      const logo = document.querySelector<HTMLElement>(".startup-logo")!;
      for (const el of document.querySelectorAll(".startup-splash *")) {
        for (const animation of el.getAnimations()) { animation.pause(); animation.currentTime = time; }
      }
      const rect = logo.getBoundingClientRect();
      const target = document.querySelector(".brand-mark")!.getBoundingClientRect();
      return {
        width: rect.width, x: rect.x, y: rect.y,
        target: { width: target.width, x: target.x, y: target.y },
        shimmer: getComputedStyle(document.querySelector(".startup-shimmer")!).opacity,
        duration: logo.getAnimations()[0].effect!.getTiming().duration,
        inert: document.querySelector<HTMLElement>("#app")!.inert,
      };
    }, time);
    const start = await sample(0);
    expect(start.duration).toBe(5000);
    expect(start.width).toBeGreaterThan(300);
    expect(start.inert).toBe(true);
    await page.screenshot({ path: "test-results/splash-start.png" });
    expect((await sample(2700)).width).toBeGreaterThan(start.width * 1.14);
    await page.screenshot({ path: "test-results/splash-middle.png" });
    const end = await sample(4999);
    await expect(page.locator(".brand-mark")).toBeHidden();
    expect(end.width).toBeCloseTo(end.target.width, 0);
    expect(end.x).toBeCloseTo(end.target.x, 0);
    expect(end.y).toBeCloseTo(end.target.y, 0);
    expect(Number(end.shimmer)).toBe(0);
    await page.evaluate(() => {
      for (const el of document.querySelectorAll(".startup-splash *"))
        for (const animation of el.getAnimations()) animation.play();
    });
    await expect(page.locator(".startup-splash")).toHaveCount(0);
    await expect(page.locator(".brand-mark")).toBeVisible();
    await page.getByRole("button", { name: "Настройки", exact: true }).click();
    await expect(page.getByRole("tab", { name: "Оформление" })).toBeVisible();

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload();
    await expect(page.locator(".brand-mark")).toBeVisible();
    await expect(page.locator(".startup-splash")).toHaveCount(0);
    expect(await page.locator("#app").evaluate(el => el.inert)).toBe(false);

    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler("readly:request");
      ipcMain.handle("readly:request", () => { throw new Error("Splash test: load failed"); });
    });
    await page.reload();
    await expect(page.locator("#error")).toContainText("Splash test: load failed");
    await expect(page.locator(".startup-splash")).toHaveCount(0);
    expect(await page.locator("#app").evaluate(el => el.inert)).toBe(false);
    expect(errors).toEqual([]);
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});
