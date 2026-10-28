import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

test("palettes preview both modes, follow system, support keyboard, cancel and persist", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "readly-themes-"));
  const app = await electron.launch({ args: [".", "--ozone-platform=x11"],
    env: { ...process.env, XDG_DATA_HOME: path.join(dir, "xdg"), READLY_DATA_DIR: dir } });
  try {
    let page = await app.firstWindow();
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
    await page.reload();
    const openSettings = async () => {
      await page.getByRole("button", { name: "Настройки", exact: true }).click();
      await page.getByRole("tab", { name: "Оформление" }).click();
    };
    await openSettings();
    const picker = page.getByRole("combobox", { name: /^Тема/ });
    const choose = async (name: string) => {
      await picker.click();
      await page.getByRole("option", { name, exact: true }).click();
    };
    for (const [id, name] of [["readly", "Readly"], ["sepia", "Сепия"], ["github", "GitHub"], ["catppuccin", "Catppuccin"], ["matrix", "Matrix"], ["gruvbox", "Gruvbox"], ["nord", "Nord"]]) {
      await choose(name);
      for (const [mode, label] of [["light", "Светлая"], ["dark", "Тёмная"]]) {
        await page.getByRole("radio", { name: label, exact: true }).check();
        await expect(page.locator("html")).toHaveAttribute("data-color-theme", id);
        await expect(page.locator("html")).toHaveAttribute("data-theme", mode);
        await picker.click();
        const option = page.getByRole("option", { name, exact: true });
        await expect(option).toHaveAttribute("aria-selected", "true");
        const colors = await option.evaluate(el => ({
          option: getComputedStyle(el).backgroundColor,
          app: getComputedStyle(document.querySelector(".window")!).backgroundColor,
        }));
        expect(colors.option).toBe(colors.app);
        await picker.press("Escape");
      }
    }
    await choose("Catppuccin");
    await page.getByRole("radio", { name: "Авто", exact: true }).check();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await picker.click();
    await expect(page.getByRole("option", { name: "Catppuccin", exact: true })).toHaveCSS("background-color", "rgb(30, 30, 46)");
    await page.screenshot({ path: "test-results/themes-dark-menu.png" });
    await picker.press("Escape");
    await picker.press("ArrowDown");
    await picker.press("End");
    await picker.press("Enter");
    await expect(page.locator("html")).toHaveAttribute("data-color-theme", "nord");
    await picker.click();
    await page.getByRole("heading", { name: "Тема", exact: true }).click();
    await expect(page.getByRole("listbox")).toBeHidden();
    await page.getByRole("button", { name: "Отменить", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-color-theme", "readly");
    await expect(page.getByRole("radio", { name: "Светлая", exact: true })).toBeChecked();
    await choose("Gruvbox");
    await page.getByRole("radio", { name: "Авто", exact: true }).check();
    await page.getByRole("button", { name: "Сохранить", exact: true }).click();
    await expect(page.locator("#save-status")).toContainText("Настройки сохранены");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-color-theme", "gruvbox");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await openSettings();
    await expect(page.getByRole("radio", { name: "Авто", exact: true })).toBeChecked();
    await expect(picker).toContainText("Gruvbox");
    expect(errors).toEqual([]);
  } finally { await app.close(); await rm(dir, { recursive: true, force: true }); }
});
