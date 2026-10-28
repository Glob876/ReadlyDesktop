import type { Settings } from "./types";

export type ColorTheme = "readly" | "sepia" | "github" | "catppuccin" | "matrix" | "gruvbox" | "nord";
type Colors = { bg: string; side: string; card: string; text: string; muted: string; border: string; accent: string; danger: string };
const colors = (bg: string, side: string, card: string, text: string, muted: string, border: string, accent: string, danger: string): Colors =>
  ({ bg, side, card, text, muted, border, accent, danger });

// UI adaptations of the original palettes; see docs/themes.md for sources.
export const colorThemes: { id: ColorTheme; label: string; light: Colors; dark: Colors }[] = [
  { id: "readly", label: "Readly",
    light: colors("#fafaf8", "#f3f4f1", "#fffffd", "#303831", "#848a83", "#dfe3dc", "#466b50", "#a64c3e"),
    dark: colors("#1f2220", "#1a1d1b", "#232724", "#d9ded8", "#939d94", "#3a423b", "#a0bba1", "#e4a090") },
  { id: "sepia", label: "Сепия",
    light: colors("#f8f3e8", "#efe8db", "#fcf8ef", "#514c40", "#948b78", "#e0d6c4", "#7a714d", "#a0523b"),
    dark: colors("#2b2720", "#242119", "#332e25", "#e8dfcc", "#b1a48b", "#514837", "#d6c18a", "#e0a08b") },
  { id: "github", label: "GitHub",
    light: colors("#ffffff", "#f6f8fa", "#ffffff", "#1f2328", "#59636e", "#d1d9e0", "#0969da", "#d1242f"),
    dark: colors("#0d1117", "#010409", "#161b22", "#e6edf3", "#9198a1", "#3d444d", "#79c0ff", "#ff7b72") },
  { id: "catppuccin", label: "Catppuccin",
    light: colors("#eff1f5", "#e6e9ef", "#ffffff", "#4c4f69", "#6c6f85", "#bcc0cc", "#8839ef", "#d20f39"),
    dark: colors("#1e1e2e", "#181825", "#313244", "#cdd6f4", "#a6adc8", "#585b70", "#cba6f7", "#f38ba8") },
  { id: "matrix", label: "Matrix",
    light: colors("#eff8ee", "#e1efdf", "#f9fff7", "#153b22", "#4c7153", "#b5d2b7", "#236b37", "#a63e32"),
    dark: colors("#08100a", "#050b06", "#0d1b10", "#b3efb9", "#7aaa80", "#294b30", "#7ce58b", "#f49a8b") },
  { id: "gruvbox", label: "Gruvbox",
    light: colors("#fbf1c7", "#ebdbb2", "#f9f5d7", "#3c3836", "#7c6f64", "#bdae93", "#427b58", "#9d0006"),
    dark: colors("#282828", "#1d2021", "#3c3836", "#ebdbb2", "#bdae93", "#665c54", "#b8bb26", "#fb4934") },
  { id: "nord", label: "Nord",
    light: colors("#eceff4", "#e5e9f0", "#f5f7fa", "#2e3440", "#4c566a", "#b4bfce", "#456988", "#a53c4d"),
    dark: colors("#2e3440", "#292e39", "#3b4252", "#eceff4", "#b5bfce", "#4c566a", "#88c0d0", "#e099a3") },
];
const rgb = (hex: string) => hex.slice(1).match(/../g)!.map(value => parseInt(value, 16)).join(" ");
export const themeMode = (s: Settings) => s.theme === "system"
  ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
  : s.theme === "dark" ? "dark" : "light";
export const selectedTheme = (s: Settings) => colorThemes.find(theme => theme.id === (s.theme === "sepia" ? "sepia" : s.colorTheme)) ?? colorThemes[0];
export function applyColorTheme(s: Settings) {
  const mode = themeMode(s);
  const theme = selectedTheme(s);
  const palette = theme[mode];
  const root = document.documentElement;
  root.dataset.theme = mode;
  root.dataset.colorTheme = theme.id;
  root.style.colorScheme = mode;
  for (const [key, value] of Object.entries(palette)) {
    root.style.setProperty(`--${key}`, ["bg", "side", "card"].includes(key) ? rgb(value) : value);
  }
  root.style.setProperty("--hover", `color-mix(in srgb, var(--accent) 9%, ${palette.bg})`);
  root.style.setProperty("--selected", `color-mix(in srgb, var(--accent) 15%, ${palette.bg})`);
}
const rowStyle = (palette: Colors) => `--theme-bg:${palette.bg};--theme-text:${palette.text};--theme-accent:${palette.accent};--theme-border:${palette.border}`;
export function themeControls(s: Settings, translate: (text: string) => string = text => text) {
  const theme = selectedTheme(s);
  return `<fieldset class="appearance-mode"><legend>${translate("Режим оформления")}</legend><div class="mode-switch">${[
    ["light", "Светлая"], ["dark", "Тёмная"], ["system", "Авто"],
  ].map(([value, label]) => `<label><input type="radio" name="theme" value="${value}" ${(s.theme === "sepia" ? "light" : s.theme) === value ? "checked" : ""}><span>${translate(label)}</span></label>`).join("")}</div></fieldset>
  <div class="theme-picker"><span id="color-theme-label" class="theme-picker-label">${translate("Тема")}</span>
  <button type="button" id="color-theme-trigger" role="combobox" aria-labelledby="color-theme-label color-theme-value" aria-haspopup="listbox" aria-controls="color-theme-list" aria-expanded="false" style="${rowStyle(theme[themeMode(s)])}"><span class="theme-color-dot" aria-hidden="true"></span><span id="color-theme-value">${translate(theme.label)}</span><span class="theme-chevron" aria-hidden="true">⌄</span></button>
  <div id="color-theme-list" role="listbox" aria-labelledby="color-theme-label" hidden>${colorThemes.map(item => `<button type="button" role="option" tabindex="-1" id="theme-${item.id}" data-color-theme="${item.id}" data-label="${translate(item.label)}" aria-selected="${item.id === theme.id}" style="${rowStyle(item[themeMode(s)])}"><span class="theme-color-dot" aria-hidden="true"></span><span>${translate(item.label)}</span><span class="theme-check" aria-hidden="true">✓</span></button>`).join("")}</div></div>`;
}
let pickerEvents: AbortController | undefined;
export function refreshThemePicker(s: Settings) {
  const theme = selectedTheme(s);
  document.querySelector<HTMLElement>(".accent-setting")?.toggleAttribute("hidden", theme.id !== "readly");
  for (const item of colorThemes) {
    const row = document.querySelector<HTMLElement>(`#theme-${item.id}`);
    if (!row) continue;
    row.setAttribute("style", rowStyle(item[themeMode(s)]));
    row.setAttribute("aria-selected", String(item.id === theme.id));
    if (item.id === theme.id) {
      document.querySelector("#color-theme-trigger")!.setAttribute("style", rowStyle(item[themeMode(s)]));
      document.querySelector("#color-theme-value")!.textContent = row.dataset.label!;
    }
  }
}
export function bindThemePicker(s: Settings, onChange: () => void) {
  pickerEvents?.abort();
  pickerEvents = new AbortController();
  const trigger = document.querySelector<HTMLButtonElement>("#color-theme-trigger");
  const list = document.querySelector<HTMLElement>("#color-theme-list");
  if (!trigger || !list) return;
  const rows = Array.from(list.querySelectorAll<HTMLButtonElement>("[role=option]"));
  let active = Math.max(0, colorThemes.findIndex(item => item.id === selectedTheme(s).id));
  const highlight = () => {
    rows.forEach((row, i) => row.classList.toggle("theme-active", i === active));
    trigger.setAttribute("aria-activedescendant", rows[active].id);
    rows[active].scrollIntoView({ block: "nearest" });
  };
  const close = () => {
    list.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    trigger.removeAttribute("aria-activedescendant");
  };
  const open = () => {
    active = Math.max(0, rows.findIndex(row => row.getAttribute("aria-selected") === "true"));
    list.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    highlight();
  };
  const choose = (row: HTMLButtonElement) => {
    s.colorTheme = row.dataset.colorTheme as ColorTheme;
    onChange();
    refreshThemePicker(s);
    close();
    trigger.focus();
  };
  trigger.onclick = () => list.hidden ? open() : close();
  rows.forEach(row => { row.onclick = () => choose(row); });
  trigger.onkeydown = event => {
    if (event.key === "Escape" || event.key === "Tab") { close(); return; }
    if (!["ArrowDown", "ArrowUp", "Home", "End", "Enter", " "].includes(event.key)) return;
    event.preventDefault();
    if (list.hidden) { open(); return; }
    if (event.key === "Enter" || event.key === " ") { choose(rows[active]); return; }
    active = event.key === "Home" ? 0 : event.key === "End" ? rows.length - 1
      : (active + (event.key === "ArrowDown" ? 1 : -1) + rows.length) % rows.length;
    highlight();
  };
  document.addEventListener("pointerdown", event => {
    if (!(event.target instanceof Node) || !trigger.parentElement!.contains(event.target)) close();
  }, { signal: pickerEvents.signal });
  document.addEventListener("focusin", event => {
    if (!(event.target instanceof Node) || !trigger.parentElement!.contains(event.target)) close();
  }, { signal: pickerEvents.signal });
  refreshThemePicker(s);
}
