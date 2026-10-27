import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

test("launcher repairs dependencies once, tracks lock changes and forwards arguments", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "readly-launch-"));
  try {
    const bin = path.join(dir, "bin");
    await mkdir(bin);
    await copyFile("run.sh", path.join(dir, "run.sh"));
    await writeFile(path.join(dir, "package-lock.json"), "{}");
    // An existing, incomplete installation must also be repaired.
    await mkdir(path.join(dir, "node_modules"));
    await writeFile(path.join(bin, "node"), `#!/bin/sh\nexec '${process.execPath.replaceAll("'", "'\\''")}' "$@"\n`, { mode: 0o755 });
    await writeFile(path.join(bin, "cargo"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    await writeFile(path.join(bin, "npm"), '#!/bin/sh\nprintf "<%s>" "$@" >> calls\nprintf "\\n" >> calls\n', { mode: 0o755 });
    const run = () => spawnSync("bash", [path.join(dir, "run.sh"), "--example=a b"], {
      cwd: tmpdir(),
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
      encoding: "utf8",
    });
    for (let i = 0; i < 2; i++) {
      const result = run();
      assert.equal(result.status, 0, result.stderr);
    }
    const calls = () => readFile(path.join(dir, "calls"), "utf8");
    assert.equal(await calls(), "<ci><--include=optional>\n<run><build>\n<start><--><--example=a b>\n<run><build>\n<start><--><--example=a b>\n");
    await writeFile(path.join(dir, "package-lock.json"), '{"changed":true}');
    assert.equal(run().status, 0);
    assert.equal((await calls()).split("<ci>").length - 1, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("launcher bootstraps old Node before installing or building", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "readly-old-node-"));
  try {
    const bin = path.join(dir, "bin");
    await mkdir(bin);
    await copyFile("run.sh", path.join(dir, "run.sh"));
    await writeFile(path.join(bin, "node"), '#!/bin/sh\nif [ "$1" = "--version" ]; then echo v18.19.1; else exit 1; fi\n', { mode: 0o755 });
    await writeFile(path.join(bin, "cargo"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    await writeFile(path.join(bin, "npm"), '#!/bin/sh\nprintf "<%s>" "$@" > calls\n', { mode: 0o755 });
    const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, READLY_NODE_BOOTSTRAPPED: "" };
    const run = () => spawnSync("bash", [path.join(dir, "run.sh"), "--example=a b"], { env, encoding: "utf8" });
    assert.equal(run().status, 0);
    assert.equal(await readFile(path.join(dir, "calls"), "utf8"), `<exec><--yes><--package=node@24><--><bash><${dir}/run.sh><--example=a b>`);
    env.READLY_NODE_BOOTSTRAPPED = "1";
    const failed = run();
    assert.equal(failed.status, 1);
    assert.match(failed.stderr, /Не удалось подключить Node.js 24/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("legacy launcher bypasses Node, npm and Cargo", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "readly-launch-legacy-"));
  try {
    await copyFile("run.sh", path.join(dir, "run.sh"));
    await mkdir(path.join(dir, "bin"));
    await writeFile(path.join(dir, "bin/python3"), '#!/bin/sh\nprintf "%s\\n" "$@" > legacy-call\n', { mode: 0o755 });
    for (const name of ["node", "npm", "cargo"]) {
      await writeFile(path.join(dir, "bin", name), '#!/bin/sh\nexit 99\n', { mode: 0o755 });
    }
    const result = spawnSync("bash", [path.join(dir, "run.sh"), "--legacy"], { env: { ...process.env, PATH: `${dir}/bin:${process.env.PATH}` }, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(await readFile(path.join(dir, "legacy-call"), "utf8"), `${dir}/legacy/bootstrap.py\n`);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
