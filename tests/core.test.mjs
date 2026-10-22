import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
function core(file) {
  const child = spawn(path.resolve("native/target/release/readly-core"), [
    file,
  ]);
  const queue = [];
  let serial = 0;
  createInterface({ input: child.stdout }).on("line", (line) =>
    queue.shift()?.(JSON.parse(line)),
  );
  return {
    child,
    request: (cmd) =>
      new Promise((resolve) => {
        queue.push(resolve);
        child.stdin.write(JSON.stringify({ ...cmd, id: ++serial }) + "\n");
      }),
  };
}
test("complete lesson, rejected answers, settings and restart persistence", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "readly-core-"));
  const file = path.join(dir, "progress.json");
  let app = core(file);
  try {
    const initial = (await app.request({ op: "load" })).result.state;
    assert.equal(initial.started, false);
    let response = await app.request({
      op: "savePoem",
      poem: {
        title: "Проверка",
        author: "",
        text: "Ёж идёт!\nСнег.\n\nВетер.",
      },
    });
    assert.equal(response.result.state.tasks.length, 14);
    response = await app.request({
      op: "savePoem",
      poem: { title: "", author: "", text: " \n " },
    });
    assert.match(response.error, /Вставьте/);
    await app.request({ op: "start" });
    response = await app.request({ op: "submit", answer: "нет" });
    assert.equal(response.result.correct, false);
    assert.equal(response.result.state.position, 0);
    response = await app.request({ op: "submit", answer: "еж идет" });
    assert.equal(response.result.correct, true);
    const settings = {
      ...initial.settings,
      caseSensitive: true,
      distinguishYo: true,
      punctuation: true,
      opacity: 75,
      theme: "dark",
    };
    await app.request({ op: "settings", settings });
    response = await app.request({ op: "submit", answer: "еж идет" });
    assert.equal(response.result.correct, false);
    app.child.kill();
    app = core(file);
    response = await app.request({ op: "load" });
    assert.equal(response.result.state.position, 1);
    assert.equal(response.result.state.settings.opacity, 75);
    const tasks = response.result.state.tasks;
    for (const task of tasks.slice(1)) {
      response = await app.request({ op: "submit", answer: task.text });
      assert.equal(response.result.correct, true);
    }
    assert.equal(response.result.state.position, tasks.length);
    response = await app.request({ op: "submit", answer: "Ветер." });
    assert.match(response.error, /завершено/);
    response = await app.request({
      op: "settings",
      settings: { ...settings, opacity: 1 },
    });
    assert.ok(response.error);
    response = await app.request({ op: "restart" });
    assert.equal(response.result.state.position, 0);
    assert.equal(JSON.parse(await readFile(file, "utf8")).position, 0);
  } finally {
    app.child.kill();
    await rm(dir, { recursive: true, force: true });
  }
});
