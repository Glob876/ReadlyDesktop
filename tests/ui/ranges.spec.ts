import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

test("minimal ranges fill from the minimum, support pointer and keyboard and survive cancel", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "readly-ranges-"));
  const app = await electron.launch({ args: [".", "--ozone-platform=x11"],
    env: { ...process.env, XDG_DATA_HOME: path.join(dir, "xdg"), READLY_DATA_DIR: dir } });
  try {
    const page = await app.firstWindow();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload();
    await page.getByRole("button", { name: "Настройки", exact: true }).click();
    await page.getByRole("tab", { name: "Оформление" }).click();
    const opacity = page.locator('[name="opacity"]');
    const progress = () => opacity.evaluate(el => el.style.getPropertyValue("--range-progress"));
    await expect(opacity).toHaveCSS("appearance", "none");
    await expect(opacity).toHaveCSS("height", "24px");
    await expect.poll(progress).toBe("100%");
    await opacity.focus();
    await opacity.press("Home");
    await expect(opacity).toHaveValue("55");
    await expect(page.locator("#opacity-value")).toHaveText("55%");
    await expect.poll(progress).toBe("0%");
    await opacity.press("ArrowRight");
    await expect(opacity).toHaveValue("56");
    await expect.poll(async () => parseFloat(await progress())).toBeGreaterThan(2);
    await opacity.press("End");
    await expect.poll(progress).toBe("100%");
    const bounds = (await opacity.boundingBox())!;
    await opacity.click({position: {x: bounds.width / 2, y: bounds.height / 2}});
    const value = Number(await opacity.inputValue());
    expect(value).toBeGreaterThanOrEqual(76); expect(value).toBeLessThanOrEqual(79);
    await page.getByRole("button", { name: "Отменить", exact: true }).click();
    await expect(opacity).toHaveValue("100");
    await expect.poll(progress).toBe("100%");
    const size = page.locator('[name="fontSize"]');
    await size.focus(); await size.press("End");
    await expect(size).toHaveValue("34");
    await page.getByRole("button", { name: "Сохранить", exact: true }).click();
    await expect(page.locator("#save-status")).toContainText("Настройки сохранены");
    await expect(size).toHaveValue("34");
    await size.locator("..").screenshot({path:"test-results/minimal-ranges.png"});
  } finally { await app.close(); await rm(dir, {recursive:true, force:true}); }
});
