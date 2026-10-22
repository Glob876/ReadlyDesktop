import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

test("offline classics: search, author filter, preview, safe replacement and persistence", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "readly-library-"));
  const start = () => electron.launch({ args: ["."], env: { ...process.env, XDG_DATA_HOME: path.join(dir, "xdg"), READLY_DATA_DIR: dir } });
  let app = await start();
  try {
    let page = await app.firstWindow();
    await page.context().setOffline(true);
    await page.getByRole("button", { name: "Классика", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Русская классика" })).toBeVisible();
    const query = page.getByRole("searchbox", { name: "Поиск" });
    await query.fill("ЗИМНЕЕ УТРО");
    await expect(page.locator(".library-item")).toHaveCount(1);
    await expect(page.locator(".library-text")).toContainText("И берег, милый для меня.");
    await page.getByLabel("Автор", { exact: true }).selectOption("Михаил Лермонтов");
    await expect(page.locator(".library-item")).toHaveCount(0);
    await expect(page.getByText("Ничего не найдено.", { exact: false })).toBeVisible();
    await query.fill("БЕЛЕЕТ ПАРУС");
    await expect(page.locator(".library-item")).toHaveCount(1);
    await expect(page.locator("#library-preview h2")).toHaveText("Парус");
    await page.getByRole("button", { name: "Выбрать для занятия" }).click();
    await expect(page.getByRole("heading", { name: "Парус", exact: true, level: 1 })).toBeVisible();
    await page.getByRole("button", { name: "Начать учить", exact: true }).click();
    await page.locator("#answer").fill("Белеет парус одинокой");
    await page.locator("#submit").click();
    await page.getByRole("button", { name: "Классика", exact: true }).click();
    await page.getByLabel("Автор", { exact: true }).selectOption("");
    await page.getByRole("searchbox").fill("мороз и солнце");
    await page.getByRole("button", { name: "Выбрать для занятия" }).click();
    await page.getByRole("button", { name: "Отмена", exact: true }).click();
    let saved = await page.evaluate(() => window.readly.request({ op: "load" }));
    expect(saved.state.poem.title).toBe("Парус");
    expect(saved.state.position).toBe(1);
    await page.screenshot({ path: "test-results/library.png" });
    await page.getByRole("button", { name: "Выбрать для занятия" }).click();
    await page.getByRole("button", { name: "Выбрать стихотворение", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Зимнее утро", exact: true, level: 1 })).toBeVisible();
    saved = await page.evaluate(() => window.readly.request({ op: "load" }));
    expect(saved.state.stanzas).toHaveLength(5);
    expect(saved.state.position).toBe(0);
    await app.close();
    app = await start();
    page = await app.firstWindow();
    await expect(page.getByRole("heading", { name: "Зимнее утро", exact: true, level: 1 })).toBeVisible();
    saved = await page.evaluate(() => window.readly.request({ op: "load" }));
    expect(saved.state.stanzas).toHaveLength(5);
    await page.getByRole("button", { name: "Классика", exact: true }).click();
    await page.getByRole("searchbox").fill("ЕЩЕ МАЙСКАЯ НОЧЬ");
    await expect(page.locator(".library-item")).toHaveCount(1);
    await expect(page.locator("#library-preview h2")).toHaveText("Ещё майская ночь");
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});
