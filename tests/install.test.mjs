import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile, access, copyFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { pack, desktopEntry } from "../scripts/pack.mjs";
import { install } from "../scripts/install.mjs";

async function put(root, file, content = "fixture", mode = 0o644) {
  await mkdir(path.dirname(path.join(root, file)), { recursive: true });
  await writeFile(path.join(root, file), content, { mode });
}
async function source(root, windows = false) {
  await put(root, "legacy/README.md");
  await put(root, "package.json", JSON.stringify({ name: "readly-desktop", productName: "Readly", version: "0.1.0", main: "dist-electron/electron/main.js" }));
  for (const file of ["dist/index.html", "dist-electron/electron/main.js", "assets/icon.png", "assets/icon.svg", "src/assets/icons/LICENSE", "README.md", "native/Cargo.lock", "package-lock.json"]) await put(root, file);
  await mkdir(path.join(root, "scripts"), { recursive: true });
  await copyFile("scripts/install-windows.ps1", path.join(root, "scripts/install-windows.ps1"));
  await put(root, `native/target/release/readly-core${windows ? ".exe" : ""}`);
  await put(root, `node_modules/electron/dist/${windows ? "electron.exe" : "electron"}`, '#!/bin/sh\nprintf "%s\\n" "$@"\n', 0o755);
  await put(root, "node_modules/electron/dist/LICENSE");
  await put(root, `release/legacy/ReadlyLegacy/ReadlyLegacy${windows ? ".exe" : ""}`, '#!/bin/sh\nprintf "legacy:%s\\n" "$@"\n', 0o755);
  if (windows) await put(root, "node_modules/electron/dist/electron_wer.dll");
}

test("Linux packaging and repeat installation handle paths, menu entries, PATH and updates", { skip: process.platform === "win32" }, async () => {
  const root = await mkdtemp(path.join(tmpdir(), "readly-install-"));
  try {
    const homeDir = path.join(root, "Gleb's $data `literal` 100%");
    const env = { SHELL: "/bin/bash", XDG_DATA_HOME: path.join(homeDir, "data") };
    await source(root);
    const release = await pack({ root, platform: "linux", arch: "x64" });
    await put(release, "obsolete.txt");
    await pack({ root, platform: "linux", arch: "x64" });
    await assert.rejects(access(path.join(release, "obsolete.txt")));
    await put(homeDir, ".bashrc", "# existing preferences\n");
    const options = { root, platform: "linux", arch: "x64", homeDir, env };
    const installed = await install(options);
    await install(options);
    const desktop = await readFile(path.join(env.XDG_DATA_HOME, "applications/readly-desktop.desktop"), "utf8");
    assert.equal(desktop, desktopEntry(path.join(installed.target, "Readly"), path.join(installed.target, "readly.png")));
    assert.ok(desktop.includes("100%%"));
    for (const file of [".bashrc", ".profile"]) {
      const content = await readFile(path.join(homeDir, file), "utf8");
      assert.equal(content.split("# >>> Readly PATH >>>").length, 2);
      const shell = spawnSync("bash", ["--noprofile", "--norc", "-c", 'source "$1"; command -v readly', "bash", path.join(homeDir, file)], { env: { ...process.env, PATH: "/usr/bin:/bin" }, encoding: "utf8" });
      assert.equal(shell.status, 0, shell.stderr);
      assert.equal(shell.stdout.trim(), path.join(installed.bin, "readly"));
    }
    assert.ok((await readFile(path.join(homeDir, ".bashrc"), "utf8")).startsWith("# existing preferences"));
    const launch = spawnSync(path.join(installed.bin, "readly"), ["argument with spaces", "$literal"], { cwd: tmpdir(), encoding: "utf8" });
    assert.equal(launch.status, 0, launch.stderr);
    assert.equal(launch.stdout, "argument with spaces\n$literal\n");
    await put(root, "dist/new-file.js", "new");
    await pack({ root, platform: "linux", arch: "x64" });
    await install(options);
    assert.equal(await readFile(path.join(installed.target, "resources/app/dist/new-file.js"), "utf8"), "new");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("installer refuses unrelated directories and preserves the previous version on incomplete input", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "readly-install-errors-"));
  try {
    const homeDir = path.join(root, "user");
    await source(root);
    const release = await pack({ root, platform: "linux", arch: "x64" });
    const options = { root, platform: "linux", arch: "x64", homeDir, env: {} };
    const target = path.join(homeDir, ".local/share/readly");
    await put(target, "keep.txt", "untouched");
    await assert.rejects(install(options), /не принадлежит/);
    assert.equal(await readFile(path.join(target, "keep.txt"), "utf8"), "untouched");
    await rm(target, { recursive: true });
    await install(options);
    await rm(path.join(release, "resources/readly-core"));
    await assert.rejects(install(options));
    await access(path.join(target, "resources/readly-core"));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("Windows packaging includes an executable, Rust exe and standalone Start-menu/PATH installer", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "readly-windows-"));
  try {
    await source(root, true);
    const release = await pack({ root, platform: "win32", arch: "x64" });
    for (const file of ["Readly.exe", "Readly_wer.dll", "resources/readly-core.exe", "resources/app/dist/index.html", "LICENSE", "Install.ps1"]) await access(path.join(release, file));
    await assert.rejects(access(path.join(release, "electron.exe")));
    const powershell = await readFile(path.join(release, "Install.ps1"), "utf8");
    assert.ok(powershell.includes("'Readly.lnk'"));
    assert.ok(powershell.includes("SetEnvironmentVariable('Path'"));
    let called = false;
    await install({ root, platform: "win32", arch: "x64", env: {}, run: (command, args) => {
      called = true;
      assert.equal(command, "powershell.exe");
      assert.equal(args.at(-1), path.join(release, "Install.ps1"));
    } });
    assert.ok(called);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("Legacy installs a working launcher and can be disabled without deleting user data", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "readly-install-legacy-"));
  try {
    const homeDir = path.join(root, "User's files 100% $literal");
    const data = path.join(homeDir, ".local/share");
    await source(root);
    const options = { root, platform: "linux", arch: "x64", homeDir, env: {} };
    await pack({ root, platform: "linux", arch: "x64" });
    const { bin } = await install(options);
    const result = spawnSync(path.join(bin, "readly-legacy"), ["a b"], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "legacy:a b\n");
    const shortcut = path.join(data, "applications/readly-legacy.desktop");
    assert.match(await readFile(shortcut, "utf8"), /Name=Readly Legacy/);
    await put(data, "readly-legacy/stih.txt", "Сохранить мой текст");
    await pack({ root, platform: "linux", arch: "x64", includeLegacy: false });
    await install(options);
    await assert.rejects(access(path.join(bin, "readly-legacy")));
    await assert.rejects(access(shortcut));
    assert.equal(await readFile(path.join(data, "readly-legacy/stih.txt"), "utf8"), "Сохранить мой текст");
    await access(path.join(bin, "readly"));
  } finally { await rm(root, { recursive: true, force: true }); }
});
