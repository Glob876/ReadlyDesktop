import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
test("desktop: poem editing, full lesson, hints, appearance and persistence", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "readly-ui-"));
  const start = () =>
    electron.launch({
      args: [".", "--ozone-platform=x11"],
      env: { ...process.env, XDG_DATA_HOME: path.join(dir, "xdg"), READLY_DATA_DIR: dir },
    });
  let app = await start();
  try {
    let page = await app.firstWindow();
    await expect(
      page.getByRole("heading", { name: "Зимнее утро", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Локально на компьютере", { exact: true })).toHaveCount(0);
    await page.screenshot({ path: "test-results/home.png" });
    await page.getByRole("button", { name: "Изменить текст" }).click();
    await page.locator("[name=title]").fill("Проверка");
    await page
      .locator("[name=poem]")
      .fill("Мороз и солнце!\nДень чудесный.\n\nПора проснуться.");
    await page.getByRole("button", { name: "Сохранить стихотворение" }).click();
    await expect(
      page.getByText("Стихотворение сохранено", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Стихотворение", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Начать учить", exact: true })
      .click();
    await page.locator("#answer").fill("Неправильно");
    await page.locator("#submit").click();
    await expect(
      page.getByText("Есть неточности.", { exact: false }),
    ).toBeVisible();
    await page.locator("#answer").fill("мороз и солнце");
    await page.locator("#submit").click();
    await expect(
      page.getByText("Теперь без образца", { exact: true }),
    ).toBeVisible();
    await expect(page.locator(".source-text")).toHaveCount(0);
    await page.getByRole("button", { name: "Показать подсказку" }).click();
    await expect(page.locator(".source-text")).toHaveText("Мороз …");
    await page.locator("#answer").fill("Мороз и солнце!");
    await page.locator("#submit").click();
    await expect(page.getByText("Шаг 2 из 14", { exact: true })).toBeVisible();
    await page.screenshot({ path: "test-results/recall.png" });
    const state = await page.evaluate(() =>
      window.readly.request({ op: "load" }),
    );
    for (const task of state.state.tasks.slice(1)) {
      await page.locator("#answer").fill(task.text);
      await page.locator("#answer").press("Control+Enter");
      if (task !== state.state.tasks.at(-1))
        await expect(page.locator("#answer")).toHaveValue("");
    }
    await expect(
      page.getByRole("heading", { name: "Занятие завершено" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Настройки", exact: true }).click();
    await page.getByRole("tab", { name: "Оформление" }).click();
    await page.getByRole("radio", { name: "Синий", exact: true }).check();
    await expect(page.locator(".primary").first()).toHaveCSS("background-color", "rgb(62, 102, 148)");
    await page.getByRole("button", { name: "Отменить", exact: true }).click();
    await expect(page.getByRole("radio", { name: "Зелёный", exact: true })).toBeChecked();
    await page.getByRole("radio", { name: "Фиолетовый", exact: true }).check();
    await page.getByText("Тёмная", { exact: true }).click();
    await expect(page.locator(".primary").first()).toHaveCSS("background-color", "rgb(196, 169, 223)");
    await page.locator("[name=opacity]").evaluate((el: HTMLInputElement) => {
      el.value = "75";
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.getByRole("button", { name: "Сохранить", exact: true }).click();
    await expect(
      page.getByText("Настройки сохранены", { exact: true }),
    ).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.screenshot({ path: "test-results/settings-dark.png" });
    await app.close();
    app = await start();
    page = await app.firstWindow();
    await expect(
      page.getByRole("heading", { name: "Проверка", exact: true }),
    ).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator(".primary").first()).toHaveCSS("background-color", "rgb(196, 169, 223)");
    await expect(
      page.getByRole("heading", {name: "Занятие завершено", exact: true}),
    ).toBeVisible();
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});
