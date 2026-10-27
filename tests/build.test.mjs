import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { shellQuote } from "../scripts/pack.mjs";

async function fixture() {
  const dir = await mkdtemp(path.join(tmpdir(), "readly-build-"));
  const bin = path.join(dir, "bin");
  await mkdir(bin);
  await mkdir(path.join(dir, "node_modules"));
  await copyFile("build.sh", path.join(dir, "build.sh"));
  await writeFile(path.join(dir, "package-lock.json"), "{}");
  await writeFile(path.join(bin, "node"), `#!/bin/sh
case "$1" in
  scripts/install.mjs|scripts/build-windows.mjs) printf '%s\\n' "$1" >> calls ;;
  *) exec ${shellQuote(process.execPath)} "$@" ;;
esac
`, { mode: 0o755 });
  for (const name of ["cargo", "rustup", "x86_64-w64-mingw32-gcc"]) {
    await writeFile(path.join(bin, name), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  }
  await writeFile(path.join(bin, "npm"), '#!/bin/sh\nprintf "<%s>" "$@" >> calls\nprintf "\\n" >> calls\n', { mode: 0o755 });
  const run = (...args) => spawnSync("bash", [path.join(dir, "build.sh"), ...args], {
    cwd: tmpdir(), env: { ...process.env, PATH: `${bin}:${process.env.PATH}` }, encoding: "utf8",
  });
  return { dir, bin, run, calls: () => readFile(path.join(dir, "calls"), "utf8") };
}

test("build installs by default, skips installation for portable/cross builds and reuses dependencies", { skip: process.platform !== "linux" }, async () => {
  const f = await fixture();
  try {
    for (const args of [[], ["--pack-only"], ["--windows"], ["--windows", "--pack-only"]]) {
      const result = f.run(...args);
      assert.equal(result.status, 0, result.stderr);
    }
    assert.equal(await f.calls(), '<ci><--include=optional>\n<run><pack>\nscripts/install.mjs\n<run><pack>\nscripts/build-windows.mjs\nscripts/build-windows.mjs\n');
    const before = await f.calls();
    assert.equal(f.run("--help").status, 0);
    assert.equal(f.run("--unknown").status, 1);
    assert.equal(await f.calls(), before);
  } finally { await rm(f.dir, { recursive: true, force: true }); }
});

test("old Node bootstraps the build once and preserves flags", { skip: process.platform !== "linux" }, async () => {
  const f = await fixture();
  try {
    await writeFile(path.join(f.bin, "node"), `#!/bin/sh
case "$2" in
  *process.platform*) exit 0 ;;
  *) exit 1 ;;
esac
`, { mode: 0o755 });
    assert.equal(f.run("--windows").status, 0);
    assert.equal(await f.calls(), `<exec><--yes><--package=node@24><--><bash><${f.dir}/build.sh><--windows>\n`);
  } finally { await rm(f.dir, { recursive: true, force: true }); }
});
