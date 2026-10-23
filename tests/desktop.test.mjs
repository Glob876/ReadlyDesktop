import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, writeFile, truncate, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
const require = createRequire(import.meta.url);
const { CoreConnection } = require("../dist-electron/electron/core.js");
const { validateCommand, textPoem, readImportFile, MAX_REQUEST_BYTES, MAX_IMPORT_BYTES, MAX_TEXT_BYTES, libraryImportCommand, libraryExportFile } = require("../dist-electron/electron/files.js");

test("desktop IPC accepts library-sized payloads and rejects invalid operations", () => {
  validateCommand({ op: "importLibrary", poems: [{ text: "я".repeat(100_000) }] });
  for (const value of [null, [], "load", {}, { op: "anything" }, { op: "load", text: "я".repeat(MAX_REQUEST_BYTES) }]) {
    assert.throws(() => validateCommand(value), /Некорректный запрос/);
  }
});

test("library export above 10 MB is importable while ordinary IPC stays bounded", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "readly-large-library-"));
  try {
    const poem = { title: "Текст", author: "", text: "а".repeat(49_000) };
    const snapshot = { library: Array.from({ length: 120 }, (_, index) => ({ ...poem, id: `poem-${index}` })) };
    const serialized = libraryExportFile(snapshot);
    assert.ok(Buffer.byteLength(serialized) > MAX_REQUEST_BYTES);
    const file = path.join(dir, "library.json");
    await writeFile(file, serialized);
    const command = libraryImportCommand(JSON.parse(await readImportFile(file)));
    validateCommand(command);
    assert.equal(command.snapshot.library.length, 120);
    assert.throws(() => validateCommand({ op: "settings", data: serialized }), /Некорректный запрос/);
    for (const invalid of [{}, [], { poems: [] }, { poems: "abc" }, { poems: [{}] }, { snapshot: {} }, { snapshot: [] }]) {
      assert.throws(() => libraryImportCommand(invalid));
    }
    assert.deepEqual(libraryImportCommand([poem]), { op: "importLibrary", poems: [poem] });
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("TXT import preserves stanzas and validates encoding and limits", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "readly-import-"));
  try {
    const file = path.join(dir, "Стихотворение.txt");
    await writeFile(file, "\uFEFFПервая строка\r\n\r\nВторая\r\n");
    assert.deepEqual(textPoem(file, await readImportFile(file)), {
      title: "Стихотворение", author: "", text: "Первая строка\n\nВторая",
    });
    await writeFile(file, Buffer.from([0xff, 0xfe, 0x00]));
    await assert.rejects(readImportFile(file), /UTF-8/);
    await writeFile(file, Buffer.alloc(MAX_TEXT_BYTES + 4));
    await assert.rejects(readImportFile(file, MAX_TEXT_BYTES + 3), /100 КБ/);
    await truncate(file, MAX_IMPORT_BYTES + 1);
    await assert.rejects(readImportFile(file), /256 МБ/);
    assert.throws(() => textPoem(file, "я".repeat(50_001)), /100 КБ/);
    assert.equal(textPoem(file, "\n  Строка с отступом  \r\n").text, "  Строка с отступом  ");
    assert.throws(() => textPoem(file, " \n"), /нет текста/);
    assert.throws(() => textPoem(file, "binary\0data"), /текстовый файл/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("timed-out writes are blocked until reconnect reloads persisted state, never retried", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "readly-transport-"));
  const fixture = path.join(dir, "fixture.cjs");
  const progress = path.join(dir, "saved.json");
  await writeFile(fixture, `
const fs = require('node:fs');
require('node:readline').createInterface({input: process.stdin}).on('line', line => {
  const msg = JSON.parse(line);
  let position = fs.existsSync(process.argv[2]) ? Number(fs.readFileSync(process.argv[2], 'utf8')) : 0;
  if (msg.op === 'importLibrary') return;
  if (msg.op === 'submit') { fs.writeFileSync(process.argv[2], String(position + 1)); return; }
  process.stdout.write(JSON.stringify({id: msg.id, result: {state: {position}}}) + '\\n');
});`);
  const connection = new CoreConnection(process.execPath, [fixture, progress], 500, 500);
  try {
    assert.equal((await connection.request({ op: "load" })).state.position, 0);
    await assert.rejects(connection.request({ op: "submit", answer: "answer" }), /Превышено время/);
    await assert.rejects(connection.request({ op: "submit", answer: "answer" }), /Превышено время/);
    assert.equal((await connection.reconnect()).state.position, 1);
    assert.equal((await connection.request({ op: "load" })).state.position, 1);
    await assert.rejects(connection.request({ op: "importLibrary", poems: [] }), /Импорт библиотеки/);
    assert.equal((await connection.reconnect()).state.position, 1);
  } finally {
    connection.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("missing core binary returns a recoverable failure", async () => {
  const connection = new CoreConnection(path.join(tmpdir(), "readly-missing-core-binary"), [], 500);
  try {
    await assert.rejects(connection.request({ op: "load" }), /Не удалось запустить ядро|Нет связи/);
    await new Promise(resolve => setTimeout(resolve, 50));
    await assert.rejects(connection.reconnect(), /Не удалось запустить ядро|Нет связи/);
  } finally { connection.close(); }
});
