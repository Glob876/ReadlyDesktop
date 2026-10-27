import { cp, mkdir, writeFile, chmod, rename, rm, readFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

export const shellQuote = (value) => "'" + value.replaceAll("'", "'\\''") + "'";
export const desktopQuote = (value) => '"' + value.replace(/[\\"`$]/g, "\\$&").replaceAll("%", "%%") + '"';
export function desktopEntry(executable, icon) {
  // Desktop Entry string escaping is applied after Exec argument quoting.
  const exec = desktopQuote(executable).replaceAll("\\", "\\\\");
  const image = icon.replaceAll("\\", "\\\\").replaceAll("\n", "\\n").replaceAll("\r", "\\r");
  return `[Desktop Entry]\nType=Application\nName=Readly\nComment=Заучивание стихотворений\nExec=${exec}\nIcon=${image}\nTerminal=false\nCategories=Education;\nStartupWMClass=readly-desktop\n`;
}

export function legacyDesktopEntry(executable, icon) {
  return desktopEntry(executable, icon).replace("Name=Readly\n", "Name=Readly Legacy\n")
    .replace("StartupWMClass=readly-desktop", "StartupWMClass=ReadlyLegacy");
}

export async function pack({ root = path.resolve("."), platform = process.platform, arch = process.arch, runtimeDir = path.join(root, "node_modules/electron/dist"), corePath, includeLegacy = process.env.READLY_NO_LEGACY !== "1" } = {}) {
  if (!["linux", "win32"].includes(platform)) throw new Error("Упаковка поддерживает Linux и Windows.");
  if (includeLegacy) await access(path.join(root, "release/legacy/ReadlyLegacy", platform === "win32" ? "ReadlyLegacy.exe" : "ReadlyLegacy"));
  const target = path.join(root, "release", `Readly-${platform}-${arch}`);
  // Start clean so removed application files cannot survive in a new release.
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  await cp(runtimeDir, target, { recursive: true, verbatimSymlinks: true });
  const windows = platform === "win32";
  await rename(path.join(target, windows ? "electron.exe" : "electron"), path.join(target, windows ? "Readly.exe" : "readly"));
  if (windows) {
    // Newer Electron builds use a DLL named after the executable for crash reporting.
    try { await rename(path.join(target, "electron_wer.dll"), path.join(target, "Readly_wer.dll")); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  if (includeLegacy) {
    await cp(path.join(root, "release/legacy/ReadlyLegacy"), path.join(target, "resources/legacy"), { recursive: true });
    await cp(path.join(root, "legacy/README.md"), path.join(target, "ReadlyLegacy-README.md"));
    await writeFile(path.join(target, "ReadlyLegacy" + (windows ? ".cmd" : "")), windows
      ? '@echo off\r\n"%~dp0resources\\legacy\\ReadlyLegacy.exe" %*\r\n'
      : '#!/bin/sh\ncd -- "$(dirname -- "$0")" || exit 1\nexec ./resources/legacy/ReadlyLegacy "$@"\n', { mode: 0o755 });
  }
  const appDir = path.join(target, "resources/app");
  await mkdir(appDir, { recursive: true });
  for (const directory of ["dist", "dist-electron", "assets"]) {
    await cp(path.join(root, directory), path.join(appDir, directory), { recursive: true });
  }
  await cp(path.join(root, "src/assets/icons/LICENSE"), path.join(target, "Lucide-LICENSE.txt"));
  const core = windows ? "readly-core.exe" : "readly-core";
  await cp(corePath || path.join(root, "native/target/release", core), path.join(target, "resources", core));
  for (const [source, destination] of [
    ["assets/icon.svg", "readly.svg"], ["assets/icon.png", "readly.png"],
    ["README.md", "README.md"], ["native/Cargo.lock", "Cargo.lock"], ["package-lock.json", "package-lock.json"],
  ]) await cp(path.join(root, source), path.join(target, destination));
  const metadata = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  await writeFile(path.join(appDir, "package.json"), JSON.stringify({
    name: metadata.name, productName: metadata.productName, version: metadata.version, main: metadata.main,
  }));
  if (windows) {
    await cp(path.join(root, "scripts/install-windows.ps1"), path.join(target, "Install.ps1"));
  }
  if (!windows) {
    await writeFile(path.join(target, "Readly"), '#!/bin/sh\ncd -- "$(dirname -- "$0")" || exit 1\nexec ./readly "$@"\n');
    await chmod(path.join(target, "Readly"), 0o755);
    await writeFile(path.join(target, "readly-desktop.desktop"), desktopEntry(path.join(target, "Readly"), path.join(target, "readly.png")));
  }
  return target;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // Electron downloads its runtime lazily on first use.
  createRequire(import.meta.url)("electron");
  if (process.env.READLY_NO_LEGACY !== "1") {
    const python = process.platform === "win32" ? "python" : "python3";
    execFileSync(python, ["legacy/bootstrap.py", "--build"], { stdio: "inherit" });
  }
  console.log(`Сборка готова: ${await pack()}`);
}
