import { test, expect, _electron as electron, type Page } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

async function addPoem(page: Page, title: string, text: string) {
  await page.getByRole("button", { name: "Мои стихотворения", exact: true }).click();
  await page.getByRole("button", { name: "Добавить текст", exact: true }).click();
  await page.locator('[name="title"]').fill(title);
  await page.locator('[name="poem"]').fill(text);
  await page.getByRole("button", { name: "Сохранить стихотворение" }).click();
  await expect(page.getByText("Стихотворение сохранено", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Стихотворение", exact: true }).click();
}

async function openPersonal(page: Page, title: string) {
  await page.getByRole("button", { name: "Мои стихотворения", exact: true }).click();
  await page.locator("#personal-search").fill("");
  await page.locator("#personal-filter").selectOption("all");
  await page.locator(".personal-card").filter({ has: page.getByRole("heading", { name: title, exact: true }) }).getByRole("button", { name: /^Открыть/ }).click();
  await expect(page.getByRole("heading", { name: title, exact: true, level: 1 })).toBeVisible();
}

function profile(dir: string) {
  return electron.launch({ args: [".", "--ozone-platform=x11"], env: { ...process.env, XDG_DATA_HOME: path.join(dir, "xdg"), READLY_DATA_DIR: dir } });
}

test("personal poems retain independent progress and drafts across switching and restart", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "readly-personal-"));
  let app = await profile(dir);
  try {
    let page = await app.firstWindow();
    await addPoem(page, "Первый текст", "Первая строка.\nВторая строка.");
    await page.getByRole("button", { name: "Начать учить", exact: true }).click();
    await page.locator("#answer").fill("Первая строка.");
    await page.locator("#answer").press("Control+Enter");
    await expect(page.locator("#answer")).toHaveValue("");
    await page.locator("#answer").fill("Неоконченный ответ первого");
    await addPoem(page, "Второй текст", "Другой текст.");
    await page.getByRole("button", { name: "Начать учить", exact: true }).click();
    await page.locator("#answer").fill("Черновик второго");
    await openPersonal(page, "Первый текст");
    await page.getByRole("button", { name: "Продолжить", exact: true }).click();
    await expect(page.getByText(/^Шаг 2 из/)).toBeVisible();
    await expect(page.locator("#answer")).toHaveValue("Неоконченный ответ первого");
    await app.close();
    app = await profile(dir);
    page = await app.firstWindow();
    await page.getByRole("button", { name: "Продолжить", exact: true }).click();
    await expect(page.locator("#answer")).toHaveValue("Неоконченный ответ первого");
    await openPersonal(page, "Второй текст");
    await page.getByRole("button", { name: "Продолжить", exact: true }).click();
    await expect(page.getByText(/^Шаг 1 из/)).toBeVisible();
    await expect(page.locator("#answer")).toHaveValue("Черновик второго");
  } finally { await app.close(); await rm(dir, { recursive: true, force: true }); }
});

test("selected stanzas, graduated hints, feedback and difficult practice work together", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "readly-learning-"));
  const app = await profile(dir);
  try {
    const page = await app.firstWindow();
    await addPoem(page, "Две строфы", "Мимо первая строфа.\n\nНужная вторая строка.\nНужная третья строка.");
    await page.getByText("Параметры занятия", { exact: true }).click();
    await page.locator("#lesson-mode").selectOption("recall");
    await page.locator('[data-stanza="1"]').check();
    await page.locator("#apply-plan").click();
    await expect(page.locator(".source-text")).toHaveCount(0);
    await page.locator("#answer").fill("Нужная чужая строка.");
    await page.locator("#submit").click();
    await expect(page.getByRole("region", { name: "Разбор ошибок" })).toContainText("чужая");
    await expect(page.getByRole("region", { name: "Разбор ошибок" })).toContainText("вторая");
    await page.getByRole("button", { name: "Показать подсказку" }).click();
    await expect(page.locator(".source-text")).toHaveText("Нужная …");
    await page.getByRole("button", { name: "Следующая подсказка" }).click();
    await expect(page.locator(".source-text")).toHaveText("Н… в… с…");
    await page.getByRole("button", { name: "Следующая подсказка" }).click();
    await page.getByRole("button", { name: "Следующая подсказка" }).click();
    await expect(page.locator(".source-text")).toHaveText("Нужная вторая строка.");
    await page.locator("#answer").fill("Нужная вторая строка.");
    await page.locator("#submit").click();
    await expect(page.getByText(/^Шаг 1 из/)).toBeVisible();
    await expect(page.locator(".source-text")).toHaveCount(0);
    await page.locator("#answer").fill("Нужная вторая строка.");
    await page.locator("#answer").press("Control+Enter");
    await expect(page.getByText(/^Шаг 2 из/)).toBeVisible();
    await page.getByRole("button", { name: "Статистика", exact: true }).click();
    await expect(page.locator(".data-table")).toContainText("Строфа 2, строка 1");
    for (const [label, value] of [["Попытки", "3"], ["Верные ответы", "1"], ["Подсказки", "4"]]) {
      await expect(page.locator(".stats-grid > div").filter({ has: page.getByText(label, { exact: true }) }).locator("dd")).toHaveText(value);
    }
    await expect(page.locator(".history-list li")).toHaveCount(3);
    await page.getByRole("button", { name: "Повторить трудные места", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Начать занятие", exact: true }).click();
    await expect(page.getByText(/^Шаг 1 из/)).toBeVisible();
    await expect(page.locator(".source-text")).toHaveCount(0);
    const state = (await page.evaluate(() => window.readly.request({ op: "load" }))).state;
    expect(state.plan.mode).toBe("difficult");
    expect(state.tasks.every(task => task.stanza === 1 && task.recall)).toBe(true);
  } finally { await app.close(); await rm(dir, { recursive: true, force: true }); }
});

test("favorites and catalog filters retain the selected poems", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "readly-favorite-"));
  const app = await profile(dir);
  try {
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "Классика", exact: true }).click();
    await page.locator("#library-search").fill("БЕЛЕЕТ ПАРУС");
    await page.locator("#library-length").selectOption("short");
    await expect(page.locator(".library-item")).toHaveCount(1);
    await page.getByRole("button", { name: "Выбрать для занятия" }).click();
    await page.getByRole("button", { name: "Мои стихотворения", exact: true }).click();
    await page.locator("#personal-search").fill("парус");
    await page.getByRole("button", { name: "В избранное", exact: true }).click();
    await page.locator("#personal-filter").selectOption("favorite");
    await expect(page.locator(".personal-card")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Убрать из избранного", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Классика", exact: true }).click();
    await page.locator("#library-search").fill("");
    await page.locator("#library-status").selectOption("favorite");
    await expect(page.locator(".library-item")).toHaveCount(1);
    await expect(page.locator("#library-preview h2")).toHaveText("Парус");
    await page.locator("#library-length").selectOption("long");
    await expect(page.locator(".library-item")).toHaveCount(0);
    await page.locator("#library-length").selectOption("short");
    await page.locator("#library-sort").selectOption("length");
    await expect(page.locator(".library-item")).toHaveCount(1);
  } finally { await app.close(); await rm(dir, { recursive: true, force: true }); }
});

test("appearance tabs support keyboard navigation and focus mode preserves a draft", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "readly-accessibility-"));
  let app = await profile(dir);
  try {
    let page = await app.firstWindow();
    await page.getByRole("button", { name: "Настройки", exact: true }).click();
    const firstTab = page.getByRole("tab").first();
    await firstTab.focus();
    await firstTab.press("ArrowRight");
    await expect(page.getByRole("tab", { selected: true })).toBeFocused();
    await expect(page.getByRole("tabpanel")).toBeVisible();
    await page.getByRole("tab", { name: "Оформление" }).click();
    await page.locator('[name="fontFamily"]').selectOption("mono");
    await page.locator('[name="lineHeight"]').fill("2");
    await page.getByRole("button", { name: "Сохранить", exact: true }).click();
    await expect(page.getByText("Настройки сохранены", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Стихотворение", exact: true }).click();
    await page.getByRole("button", { name: "Начать учить", exact: true }).click();
    await page.locator("#answer").fill("Черновик в фокусе");
    await page.getByRole("button", { name: "Режим фокуса", exact: true }).click();
    await expect(page.locator(".sidebar")).not.toBeVisible();
    await expect(page.locator("#answer")).toHaveValue("Черновик в фокусе");
    await app.close();
    app = await profile(dir);
    page = await app.firstWindow();
    await page.getByRole("button", { name: "Продолжить", exact: true }).click();
    await expect(page.locator(".sidebar")).not.toBeVisible();
    await expect(page.locator("#answer")).toHaveValue("Черновик в фокусе");
    await page.getByRole("button", { name: "Показать панель", exact: true }).click();
    await expect(page.locator(".sidebar")).toBeVisible();
    await page.getByRole("button", { name: "Настройки", exact: true }).click();
    await page.getByRole("tab", { name: "Оформление" }).click();
    await expect(page.locator('[name="fontFamily"]')).toHaveValue("mono");
    await expect(page.locator('[name="lineHeight"]')).toHaveValue("2");
  } finally { await app.close(); await rm(dir, { recursive: true, force: true }); }
});

test("a completed exam enters the review queue and becomes due with elapsed time", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "readly-review-"));
  const app = await profile(dir);
  try {
    const page = await app.firstWindow();
    await addPoem(page, "Короткое повторение", "Запомнить эту строку.");
    await page.getByText("Параметры занятия", { exact: true }).click();
    await page.locator("#lesson-mode").selectOption("exam");
    await page.locator("#apply-plan").click();
    await expect(page.locator(".source-text")).toHaveCount(0);
    await page.locator("#answer").fill("Запомнить эту строку.");
    await page.locator("#submit").click();
    await expect(page.getByRole("heading", { name: "Занятие завершено", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Повторение", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Пора повторить · 0" })).toBeVisible();
    await expect(page.locator(".personal-card")).toContainText("Короткое повторение");
    const state = (await page.evaluate(() => window.readly.request({ op: "load" }))).state;
    const due = state.library.find(entry => entry.id === state.activeId)!.dueAt!;
    expect(due).toBeGreaterThan(Date.now());
    await page.clock.setFixedTime(new Date(due + 1000));
    await page.getByRole("button", { name: "Стихотворение", exact: true }).click();
    await page.getByRole("button", { name: "Повторение", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Пора повторить · 1" })).toBeVisible();
    await page.locator(".personal-card").getByRole("button", { name: /^Открыть/ }).click();
    await expect(page.getByRole("heading", { name: "Короткое повторение", exact: true, level: 1 })).toBeVisible();
  } finally { await app.close(); await rm(dir, { recursive: true, force: true }); }
});

test("restarting a lesson discards the old answer instead of restoring it at step zero", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "readly-restart-draft-"));
  const app = await profile(dir);
  try {
    const page = await app.firstWindow();
    await addPoem(page, "Перезапуск", "Первая строка.\nВторая строка.");
    await page.getByRole("button", { name: "Начать учить", exact: true }).click();
    await page.locator("#answer").fill("Первая строка.");
    await page.locator("#submit").click();
    await expect(page.getByText(/^Шаг 2 из/)).toBeVisible();
    await page.locator("#answer").fill("Незавершённый ответ перед сбросом");
    await page.getByRole("button", { name: "С начала", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Начать заново", exact: true }).click();
    await expect(page.getByText(/^Шаг 1 из/)).toBeVisible();
    await expect(page.locator("#answer")).toHaveValue("");
    const state = (await page.evaluate(() => window.readly.request({ op: "load" }))).state;
    expect(state.position).toBe(0);
    expect(state.draftAnswer).toBe("");
    await page.reload();
    await page.getByRole("button", { name: "Продолжить", exact: true }).click();
    await expect(page.locator("#answer")).toHaveValue("");
  } finally { await app.close(); await rm(dir, { recursive: true, force: true }); }
});

test("finishing selected stanzas does not schedule review for the whole poem", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "readly-partial-review-"));
  const app = await profile(dir);
  try {
    const page = await app.firstWindow();
    await addPoem(page, "Частичное занятие", "Первая строфа.\n\nВторая строфа.");
    await page.getByText("Параметры занятия", { exact: true }).click();
    await page.locator("#lesson-mode").selectOption("exam");
    await page.locator('[data-stanza="1"]').check();
    await page.locator("#apply-plan").click();
    await page.locator("#answer").fill("Вторая строфа.");
    await page.locator("#submit").click();
    await expect(page.getByRole("heading", { name: "Занятие завершено", exact: true })).toBeVisible();
    await expect(page.getByText("Следующее повторение:", { exact: false })).toHaveCount(0);
    const state = (await page.evaluate(() => window.readly.request({ op: "load" }))).state;
    const entry = state.library.find(item => item.id === state.activeId)!;
    expect(entry.dueAt).toBeNull();
    expect(entry.completedAt).toBeNull();
    await page.getByRole("button", { name: "Повторение", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Пора повторить · 0" })).toBeVisible();
    await expect(page.locator(".personal-card")).toHaveCount(0);
  } finally { await app.close(); await rm(dir, { recursive: true, force: true }); }
});
