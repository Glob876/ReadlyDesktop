import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { Command, Poem } from "../src/types";
export const MAX_REQUEST_BYTES = 10 * 1024 * 1024;
export const MAX_IMPORT_BYTES = 256 * 1024 * 1024;
export const MAX_TEXT_BYTES = 100_000;
// Leave room for the command envelope and transport id around an exported file.
const MAX_LIBRARY_COMMAND_BYTES = MAX_IMPORT_BYTES + 1024;
const operations = new Set([
  "load", "start", "restart", "savePoem", "settings", "submit", "selectPoem", "favorite",
  "draft", "hint", "importLibrary", "exportLibrary", "restoreBackup", "resetRecovery",
]);
export function validateCommand(command: unknown): asserts command is { op: string } {
  if (!command || typeof command !== "object" || Array.isArray(command) ||
    Object.getPrototypeOf(command) !== Object.prototype || !("op" in command) ||
    typeof command.op !== "string" || !operations.has(command.op) ||
    Buffer.byteLength(JSON.stringify(command), "utf8") > (command.op === "importLibrary" ? MAX_LIBRARY_COMMAND_BYTES : MAX_REQUEST_BYTES)) {
    throw new Error("Некорректный запрос");
  }
}
export async function readImportFile(file: string, maximum = MAX_IMPORT_BYTES): Promise<string> {
  const message = `Файл слишком большой. Максимум — ${maximum <= MAX_TEXT_BYTES + 3 ? "100 КБ" : "256 МБ"}.`;
  if ((await stat(file)).size > maximum) throw new Error(message);
  const bytes = await readFile(file);
  if (bytes.length > maximum) throw new Error(message);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
  } catch {
    throw new Error("Сохраните файл в кодировке UTF-8.");
  }
}
export function textPoem(file: string, text: string): Poem {
  if (text.includes("\0")) throw new Error("Выберите текстовый файл UTF-8.");
  text = text.replace(/\r\n?/g, "\n").replace(/^\n+|\n+$/g, "");
  if (!text.trim()) throw new Error("В файле нет текста.");
  if (Buffer.byteLength(text, "utf8") > MAX_TEXT_BYTES) throw new Error("Стихотворение слишком длинное. Максимум — 100 КБ.");
  return { title: path.basename(file, path.extname(file)), author: "", text };
}

export function libraryImportCommand(data: unknown): Command {
  if (Array.isArray(data)) data = { poems: data };
  if (!data || typeof data !== "object") throw new Error("Некорректный формат библиотеки.");
  const imported = data as { format?: string; version?: number; snapshot?: unknown; poems?: unknown };
  if (imported.format !== undefined && (imported.format !== "readly-library" || imported.version !== 1))
    throw new Error("Эта версия формата библиотеки не поддерживается.");
  const isPoem = (poem: unknown): poem is Poem => {
    if (!poem || typeof poem !== "object") return false;
    const value = poem as Poem;
    return typeof value.title === "string" && typeof value.author === "string" && typeof value.text === "string" && !!value.text.trim();
  };
  let command: Command;
  if (imported.snapshot !== undefined) {
    const snapshot = imported.snapshot as { library?: unknown; poem?: unknown } | null;
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot) ||
      !(Array.isArray(snapshot.library) && snapshot.library.length > 0 || isPoem(snapshot.poem)))
      throw new Error("В файле нет стихотворений для импорта.");
    command = { op: "importLibrary", snapshot };
  } else {
    if (!Array.isArray(imported.poems) || !imported.poems.length || !imported.poems.every(isPoem))
      throw new Error("Укажите непустой массив стихотворений с полями title, author и text.");
    command = { op: "importLibrary", poems: imported.poems };
  }
  validateCommand(command);
  return command;
}
export function libraryExportFile(snapshot: unknown): string {
  const serialized = JSON.stringify({ format: "readly-library", version: 1, snapshot }) + "\n";
  if (Buffer.byteLength(serialized, "utf8") > MAX_IMPORT_BYTES)
    throw new Error("Библиотека превышает лимит экспорта 256 МБ. Уменьшите объём данных перед переносом.");
  // Validate our own exported envelope using exactly the same rules as import.
  libraryImportCommand(JSON.parse(serialized));
  return serialized;
}
