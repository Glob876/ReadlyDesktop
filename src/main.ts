import "./style.css";
import type { Command, State, Settings, Poem } from "./types";
const icons: Record<string, string> = {
  book: '<path d="M4 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-2H4z"/><path d="M20 4h-4a3 3 0 0 0-3 3v14a4 4 0 0 1 4-2h3z"/>',
  feather: '<path d="m5 19 8-8M5 19l1-6L16 3l5 5-10 10zM9 10l5 5"/>',
  settings:
    '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="16" cy="17" r="3"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12"/><circle cx="12" cy="12" r="3"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 5m0 3h.01"/>',
  back: '<path d="M20 12H4m6-6-6 6 6 6"/>',
  repeat: '<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  minus: '<path d="M5 12h14"/>',
  square: '<rect x="5" y="5" width="14" height="14" rx="1"/>',
};
const icon = (name: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || ""}</svg>`;
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const root = document.querySelector<HTMLDivElement>("#app")!;
let state: State;
let page: "home" | "learn" | "settings" = "home";
let settingsTab: "poem" | "checking" | "appearance" = "poem";
let busy = false;
let hinted = false;
let feedback = "";
let feedbackType = "";
let draft: Settings;
let poemDraft: Poem;
const system = matchMedia("(prefers-color-scheme: dark)");
function appearance(s: Settings) {
  document.documentElement.dataset.theme =
    s.theme === "system" ? (system.matches ? "dark" : "light") : s.theme;
  document.documentElement.style.setProperty(
    "--surface-opacity",
    String(s.opacity / 100),
  );
  document.documentElement.style.setProperty("--poem-size", s.fontSize + "px");
}
system.addEventListener("change", () =>
  appearance(page === "settings" ? draft : state.settings),
);
async function send(command: Command) {
  if (busy) return;
  busy = true;
  root.setAttribute("aria-busy", "true");
  try {
    const result = await window.readly.request(command);
    state = result.state;
    return result;
  } catch (e) {
    showError(e);
    return undefined;
  } finally {
    busy = false;
    root.removeAttribute("aria-busy");
  }
}
function showError(e: unknown) {
  const box = document.querySelector("#error")!;
  box.textContent = String(e instanceof Error ? e.message : e);
  (box as HTMLElement).hidden = false;
}
function learned() {
  return state.stanzas.filter((_, i) =>
    state.tasks.some(
      (t, p) =>
        t.kind === "stanza" && t.stanza === i && t.recall && p < state.position,
    ),
  ).length;
}
function percent() {
  return state.tasks.length
    ? Math.round((state.position / state.tasks.length) * 100)
    : 0;
}
function count(n: number, forms: [string, string, string]) {
  const last = n % 10;
  const teen = n % 100 >= 11 && n % 100 <= 14;
  return `${n} ${forms[teen ? 2 : last === 1 ? 0 : last >= 2 && last <= 4 ? 1 : 2]}`;
}
function render() {
  appearance(page === "settings" ? draft : state.settings);
  root.innerHTML = `<div class="window"><header class="titlebar"><div class="brand">${icon("book")}<span>Readly</span></div><span class="window-caption">Стихотворения</span>${window.readly.desktop ? `<div class="window-controls"><button data-window="minimize" aria-label="Свернуть">${icon("minus")}</button><button data-window="maximize" aria-label="Развернуть">${icon("square")}</button><button data-window="close" aria-label="Закрыть">${icon("close")}</button></div>` : '<span class="preview-label">Предпросмотр</span>'}</header>
    <div class="workspace"><aside class="sidebar"><div class="nav-label">БИБЛИОТЕКА</div><nav aria-label="Основная навигация"><button data-page="home" class="nav-item ${page === "home" ? "active" : ""}">${icon("book")}<span>Стихотворение</span></button><button data-page="learn" class="nav-item ${page === "learn" ? "active" : ""}">${icon("feather")}<span>Занятие</span>${state.started && state.position < state.tasks.length ? '<span class="nav-dot"></span>' : ""}</button></nav>
    <div class="sidebar-progress"><div class="progress-caption"><span>Выучено строф</span><span>${learned()} / ${state.stanzas.length}</span></div><div class="progress-track"><div style="width:${state.stanzas.length ? (learned() / state.stanzas.length) * 100 : 0}%"></div></div><p>${state.position === state.tasks.length ? "Занятие завершено" : state.started ? "Прогресс сохранён" : "Занятие ещё не начато"}</p></div>
    <div class="sidebar-bottom"><button data-page="settings" class="nav-item ${page === "settings" ? "active" : ""}">${icon("settings")}Настройки</button><button id="help" class="nav-item">${icon("help")}Как заниматься</button><div class="local-note"><span class="status-dot"></span>Локально на компьютере</div></div></aside>
    <main id="main"><div id="error" class="error-banner" role="alert" hidden></div>${page === "home" ? home() : page === "learn" ? lesson() : settings()}</main></div><footer class="statusbar"><span>${count(state.stanzas.length, ["строфа", "строфы", "строф"])} <span class="dot-separator">·</span> ${count(state.stanzas.flat().length, ["строка", "строки", "строк"])}</span><span>${page === "learn" ? "Ctrl + Enter — проверить" : "Readly · 0.1.0"}</span></footer></div><dialog id="dialog"></dialog>`;
  bind();
}
function home() {
  const complete = state.position >= state.tasks.length;
  return `<div class="page home-page"><div class="page-topline"><span class="eyebrow">СТИХОТВОРЕНИЕ</span><button class="text-button" id="edit">${icon("settings")}Изменить текст</button></div><div class="poem-heading"><h1>${escape(state.poem.title)}</h1><p>${escape(state.poem.author || "Автор не указан")}</p></div><div class="home-columns"><article class="poem" aria-label="Текст стихотворения">${state.stanzas.map((s, i) => `<div class="poem-stanza"><span class="stanza-number">${String(i + 1).padStart(2, "0")}</span><p>${s.map(escape).join("<br>")}</p></div>`).join("")}</article><aside class="study-card"><div class="card-icon">${icon("feather")}</div><h2>${complete ? "Стихотворение выучено" : state.started ? "Продолжить занятие" : "Начать занятие"}</h2><p>${complete ? "Все строки и строфы пройдены. Можно повторить стихотворение с начала." : "Сначала перепишите текст, затем воспроизведите его по памяти."}</p><div class="study-facts"><div><span>Строфы</span><strong>${state.stanzas.length}</strong></div><div><span>Строки</span><strong>${state.stanzas.flat().length}</strong></div></div>${state.started ? `<div class="progress-caption"><span>Пройдено шагов</span><span>${state.position} / ${state.tasks.length}</span></div><div class="progress-track"><div style="width:${percent()}%"></div></div>` : ""}<button id="begin" class="primary wide">${complete ? "Повторить с начала" : state.started ? "Продолжить" : "Начать учить"}${icon("arrow")}</button><div class="card-footnote">Можно остановиться в любой момент</div></aside></div></div>`;
}
const names = {
  line: "Строка",
  stanza: "Строфа целиком",
  previous: "Предыдущая строфа",
  cumulative: "Все выученные строфы",
};
function lesson() {
  if (!state.started)
    return `<div class="empty-state">${icon("feather")}<h1>Занятие ещё не начато</h1><p>Учите строки по очереди, затем соединяйте их в строфы.</p><button id="begin" class="primary">Начать учить${icon("arrow")}</button></div>`;
  const task = state.tasks[state.position];
  if (!task)
    return `<div class="empty-state complete-state"><div class="completion-mark">${icon("check")}</div><span class="eyebrow">ЗАНЯТИЕ ЗАВЕРШЕНО</span><h1>Стихотворение выучено</h1><p>«${escape(state.poem.title)}»<br>${count(state.stanzas.length, ["строфа", "строфы", "строф"])} · ${count(state.stanzas.flat().length, ["строка", "строки", "строк"])}</p><div class="button-row"><button data-page="home" class="secondary">К стихотворению</button><button id="restart" class="primary">Повторить${icon("repeat")}</button></div></div>`;
  return `<div class="page lesson-page"><div class="page-topline"><button data-page="home" class="text-button">${icon("back")}К стихотворению</button><span class="muted">Шаг ${state.position + 1} из ${state.tasks.length}</span></div><div class="lesson-heading"><div><span class="eyebrow">${task.kind === "previous" || task.kind === "cumulative" ? "ПОВТОРЕНИЕ" : `СТРОФА ${task.stanza + 1} ИЗ ${state.stanzas.length}`}</span><h1>${names[task.kind]}${task.line !== null ? ` ${task.line + 1}` : ""}</h1><p>${task.recall ? "Напишите текст по памяти." : "Перепишите текст из левого поля."}</p></div><div class="phase"><span class="${!task.recall ? "current" : "done"}">${!task.recall ? "1" : icon("check")}<b>С образцом</b></span><i></i><span class="${task.recall ? "current" : ""}">2<b>По памяти</b></span></div></div>
    <div class="lesson-progress progress-track"><div style="width:${percent()}%"></div></div>
    <div class="writing-grid"><section class="writing-panel source-panel"><div class="panel-label"><span>${task.recall ? "ПО ПАМЯТИ" : "ОБРАЗЕЦ"}</span>${task.recall ? icon("feather") : `<span>${escape(state.poem.title)}</span>`}</div>${!task.recall || hinted ? `<div class="source-text poem-text">${escape(task.text)}</div>${hinted ? '<div class="hint-note">После подсказки этот шаг нужно повторить по памяти.</div>' : ""}` : `<div class="memory-placeholder">${icon("feather")}<p>Теперь без образца</p><span>${task.kind === "line" ? "Вспомните строку, которую только что написали." : "Сохраните порядок строк и строф."}</span><button id="hint" class="text-button">${icon("eye")}Показать подсказку</button></div>`}</section>
    <section class="writing-panel answer-panel"><label class="panel-label" for="answer"><span>ВАШ ТЕКСТ</span><span id="char-count">0 символов</span></label><textarea id="answer" class="poem-text" placeholder="${task.recall ? "Вспомните и напишите…" : "Начните переписывать…"}" spellcheck="false" autocapitalize="off" autocomplete="off" aria-describedby="feedback"></textarea></section></div>
    <div class="lesson-actions"><div id="feedback" class="feedback ${feedbackType}" role="status">${feedback ? escape(feedback) : "Проверка — после ввода всего текста."}</div><button id="submit" class="primary" disabled>${hinted ? "Повторить по памяти" : "Проверить"}${icon("arrow")}</button></div>
    <div class="lesson-bottom"><span>${state.settings.caseSensitive ? "Регистр учитывается" : "Без учёта регистра"} <span class="dot-separator">·</span> ${state.settings.punctuation ? "Пунктуация учитывается" : "Без учёта пунктуации"} <span class="dot-separator">·</span> ${state.settings.distinguishYo ? "Ё ≠ Е" : "Ё = Е"}</span><button id="restart" class="text-button">${icon("repeat")}С начала</button></div></div>`;
}
function toggle(key: keyof Settings, title: string, desc: string) {
  return `<label class="setting-row"><span><strong>${title}</strong><small>${desc}</small></span><input role="switch" type="checkbox" data-setting="${key}" ${draft[key] ? "checked" : ""}><span class="switch" aria-hidden="true"></span></label>`;
}
function settings() {
  return `<div class="page settings-page"><span class="eyebrow">ПАРАМЕТРЫ ПРИЛОЖЕНИЯ</span><h1>Настройки</h1><div class="tabs" role="tablist" aria-label="Раздел настроек">${(
    [
      ["poem", "Стихотворение"],
      ["checking", "Проверка текста"],
      ["appearance", "Оформление"],
    ] as const
  )
    .map(
      ([id, label]) =>
        `<button role="tab" aria-selected="${settingsTab === id}" data-tab="${id}" class="${settingsTab === id ? "selected" : ""}">${label}</button>`,
    )
    .join("")}</div>
    <form id="settings-form">${
      settingsTab === "poem"
        ? `<section class="settings-section"><h2>Текст для заучивания</h2><p class="section-description">Отделяйте строфы пустой строкой. Каждая строка изучается отдельно.</p><div class="field-grid"><label>Название<input name="title" maxlength="200" value="${escape(poemDraft.title)}" required></label><label>Автор<input name="author" maxlength="200" value="${escape(poemDraft.author)}"></label></div><label class="text-label">Стихотворение<textarea name="poem" class="poem-editor" required maxlength="100000" spellcheck="false">${escape(poemDraft.text)}</textarea></label><p class="form-note">При замене текста прогресс занятия начнётся заново.</p><div class="form-footer"><span id="save-status" role="status"></span><button class="primary" type="submit">Сохранить стихотворение${icon("check")}</button></div></section>`
        : settingsTab === "checking"
          ? `<section class="settings-section"><h2>Правила сравнения</h2><p class="section-description">Выберите, какие различия считать ошибками.</p>${toggle("caseSensitive", "Учитывать регистр", "«Мороз» и «мороз» — разные слова.")}${toggle("punctuation", "Учитывать знаки препинания", "Проверять запятые, точки, тире и другие знаки.")}${toggle("distinguishYo", "Различать ё и е", "«Ещё» и «еще» — разные слова.")}${toggle("lineBreaks", "Учитывать переносы строк", "Сохранять разделение стихотворения на строки.")}${toggle("strictWhitespace", "Точные пробелы и отступы", "Лишние пробелы и пустые строки считаются ошибкой.")}<p class="form-note">Если точные пробелы отключены, повторные пробелы и пустые строки игнорируются.</p>${settingsFooter()}</section>`
          : `<section class="settings-section"><h2>Тема</h2><p class="section-description">Цвета интерфейса и вид текста.</p><div class="theme-options">${(
              [
                ["light", "Светлая"],
                ["dark", "Тёмная"],
                ["sepia", "Сепия"],
                ["system", "Системная"],
              ] as const
            )
              .map(
                ([v, label]) =>
                  `<label class="theme-option"><input type="radio" name="theme" value="${v}" ${draft.theme === v ? "checked" : ""}><span class="theme-swatch ${v}"><i></i><b></b><b></b><b></b></span><span>${label}</span></label>`,
              )
              .join(
                "",
              )}</div><label class="range-setting"><span><strong>Непрозрачность фона</strong><small>Прозрачность окна зависит от поддержки композитора системы.</small></span><output id="opacity-value">${draft.opacity}%</output><input aria-label="Непрозрачность фона" type="range" name="opacity" min="55" max="100" value="${draft.opacity}"></label><label class="range-setting"><span><strong>Размер текста стихотворения</strong><small>В образце и поле для ввода.</small></span><output id="font-value">${draft.fontSize} px</output><input aria-label="Размер текста" type="range" name="fontSize" min="18" max="34" value="${draft.fontSize}"></label><div class="font-preview poem-text">Мороз и солнце; день чудесный!</div>${settingsFooter()}</section>`
    }</form></div>`;
}
function settingsFooter() {
  return (
    '<div class="form-footer"><span id="save-status" role="status">Изменения применяются после сохранения</span><button class="secondary" id="cancel-settings" type="button">Отменить</button><button class="primary" type="submit">Сохранить' +
    icon("check") +
    "</button></div>"
  );
}
function navigate(next: typeof page) {
  if (page === "settings") appearance(state.settings);
  page = next;
  draft = { ...state.settings };
  poemDraft = { ...state.poem };
  feedback = "";
  hinted = false;
  render();
  if (page === "learn")
    document.querySelector<HTMLTextAreaElement>("#answer")?.focus();
}
async function confirmAction(
  title: string,
  text: string,
  action: string,
): Promise<boolean> {
  const dialog = document.querySelector<HTMLDialogElement>("#dialog")!;
  dialog.innerHTML = `<form method="dialog"><h2>${title}</h2><p>${text}</p><div class="button-row"><button class="secondary" value="cancel">Отмена</button><button class="primary" value="ok">${action}</button></div></form>`;
  dialog.returnValue = "";
  dialog.showModal();
  return new Promise((resolve) =>
    dialog.addEventListener(
      "close",
      () => resolve(dialog.returnValue === "ok"),
      { once: true },
    ),
  );
}
function bind() {
  for (const [name, key] of [
    ["title", "title"],
    ["author", "author"],
    ["poem", "text"],
  ] as const) {
    const field = document.querySelector<
      HTMLInputElement | HTMLTextAreaElement
    >(`[name="${name}"]`);
    field?.addEventListener("input", () => {
      poemDraft[key] = field.value;
    });
  }
  document
    .querySelectorAll<HTMLButtonElement>("[data-window]")
    .forEach(
      (b) =>
        (b.onclick = () => window.readly.window(b.dataset.window as "close")),
    );
  document
    .querySelectorAll<HTMLButtonElement>("[data-page]")
    .forEach(
      (b) => (b.onclick = () => navigate(b.dataset.page as typeof page)),
    );
  document
    .querySelector<HTMLButtonElement>("#edit")
    ?.addEventListener("click", () => {
      settingsTab = "poem";
      navigate("settings");
    });
  document.querySelector("#begin")?.addEventListener("click", async () => {
    if (state.position >= state.tasks.length) {
      if (
        !(await confirmAction(
          "Повторить стихотворение?",
          "Текущий прогресс будет сброшен.",
          "Начать заново",
        ))
      )
        return;
      if (!(await send({ op: "restart" }))) return;
    } else if (!(await send({ op: "start" }))) return;
    navigate("learn");
  });
  document.querySelector("#restart")?.addEventListener("click", async () => {
    if (
      !(await confirmAction(
        "Начать с первой строки?",
        "Сохранённый прогресс этого занятия будет сброшен.",
        "Начать заново",
      ))
    )
      return;
    if (await send({ op: "restart" })) navigate("learn");
  });
  const answer = document.querySelector<HTMLTextAreaElement>("#answer");
  answer?.addEventListener("input", () => {
    document.querySelector("#char-count")!.textContent =
      `${[...answer.value].length} символов`;
    document.querySelector<HTMLButtonElement>("#submit")!.disabled =
      !answer.value.trim();
  });
  answer?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void submit();
    }
  });
  document
    .querySelector("#submit")
    ?.addEventListener("click", () => void submit());
  document.querySelector("#hint")?.addEventListener("click", () => {
    const value = answer?.value || "";
    hinted = true;
    render();
    const a = document.querySelector<HTMLTextAreaElement>("#answer")!;
    a.value = value;
    a.dispatchEvent(new Event("input"));
    a.focus();
  });
  document.querySelector("#help")?.addEventListener("click", () => {
    const d = document.querySelector<HTMLDialogElement>("#dialog")!;
    d.innerHTML = `<form method="dialog"><span class="eyebrow">ПОРЯДОК ЗАНЯТИЯ</span><h2>Как учить стихотворение</h2><ol class="help-list"><li>Перепишите первую строку с образца, затем напишите её по памяти.</li><li>Повторите это для каждой строки строфы.</li><li>Перепишите строфу целиком и воспроизведите по памяти.</li><li>Выучив следующую строфу, повторите предыдущую, затем все выученные вместе — с образцом и по памяти.</li></ol><p>Enter переносит строку. Ctrl + Enter проверяет ответ. Подсказка позволяет посмотреть текст, после чего шаг по памяти нужно пройти заново.</p><div class="button-row"><button class="primary">Понятно</button></div></form>`;
    d.showModal();
  });
  document.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach(
    (b) =>
      (b.onclick = () => {
        settingsTab = b.dataset.tab as typeof settingsTab;
        render();
      }),
  );
  document.querySelectorAll<HTMLInputElement>("[data-setting]").forEach(
    (input) =>
      (input.onchange = () => {
        (draft as unknown as Record<string, unknown>)[input.dataset.setting!] =
          input.checked;
      }),
  );
  document.querySelectorAll<HTMLInputElement>('[name="theme"]').forEach(
    (input) =>
      (input.onchange = () => {
        draft.theme = input.value as Settings["theme"];
        appearance(draft);
      }),
  );
  for (const [name, output, unit] of [
    ["opacity", "opacity-value", "%"],
    ["fontSize", "font-value", " px"],
  ] as const) {
    const input = document.querySelector<HTMLInputElement>(`[name="${name}"]`);
    if (input)
      input.oninput = () => {
        draft[name] = Number(input.value);
        document.getElementById(output)!.textContent = input.value + unit;
        appearance(draft);
      };
  }
  document.querySelector("#cancel-settings")?.addEventListener("click", () => {
    draft = { ...state.settings };
    poemDraft = { ...state.poem };
    render();
  });
  document
    .querySelector("#settings-form")
    ?.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (settingsTab === "poem") {
        const data = new FormData(e.target as HTMLFormElement);
        const poem = {
          title: String(data.get("title")).trim(),
          author: String(data.get("author")).trim(),
          text: String(data.get("poem")).replace(/^\n+|\n+$/g, ""),
        };
        if (JSON.stringify(poem) === JSON.stringify(state.poem)) {
          document.querySelector("#save-status")!.textContent =
            "Текст сохранён";
          return;
        }
        if (
          state.position > 0 &&
          !(await confirmAction(
            "Заменить стихотворение?",
            "Прогресс текущего стихотворения будет сброшен.",
            "Заменить текст",
          ))
        )
          return;
        if (await send({ op: "savePoem", poem })) {
          poemDraft = { ...state.poem };
          render();
          document.querySelector("#save-status")!.textContent =
            "Стихотворение сохранено";
        }
      } else if (await send({ op: "settings", settings: draft })) {
        draft = { ...state.settings };
        render();
        document.querySelector("#save-status")!.textContent =
          "Настройки сохранены";
      }
    });
}
async function submit() {
  const answer = document.querySelector<HTMLTextAreaElement>("#answer");
  if (!answer?.value.trim() || busy) return;
  if (hinted) {
    hinted = false;
    feedback = "Подсказка скрыта. Теперь напишите текст по памяти.";
    feedbackType = "";
    render();
    document.querySelector<HTMLTextAreaElement>("#answer")?.focus();
    return;
  }
  const button = document.querySelector<HTMLButtonElement>("#submit")!;
  button.disabled = true;
  const result = await send({ op: "submit", answer: answer.value });
  if (!result) {
    button.disabled = false;
    return;
  }
  if (result.correct) {
    feedback = "Верно. Следующий шаг.";
    feedbackType = "success";
    render();
    document.querySelector<HTMLTextAreaElement>("#answer")?.focus();
  } else {
    const f = document.querySelector("#feedback")!;
    f.textContent = result.message!;
    f.className = "feedback incorrect";
    answer.setAttribute("aria-invalid", "true");
    button.disabled = false;
    answer.focus();
  }
}
async function init() {
  root.innerHTML =
    '<div class="loading"><span>Readly</span><p>Открываем стихотворение…</p><div id="error" role="alert" hidden></div></div>';
  if (!window.readly) {
    document.querySelector("#error")!.textContent =
      "Откройте приложение командой npm run dev. Для работы нужен Rust-процесс через Electron.";
    (document.querySelector("#error") as HTMLElement).hidden = false;
    return;
  }
  const result = await send({ op: "load" });
  if (result) {
    draft = { ...state.settings };
    poemDraft = { ...state.poem };
    render();
  }
}
void init();
