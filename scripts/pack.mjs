import { cp, mkdir, writeFile, chmod, rename, rm, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

export const shellQuote = (value) => "'" + value.replaceAll("'", "'\\''") + "'";
export const desktopQuote = (value) => '"' + value.replace(/[\\"`$]/g, "\\$&").replaceAll("%", "%%") + '"';
export function desktopEntry(executable, icon) {
  // Desktop Entry string escaping is applied after Exec argument quoting.
  const exec = desktopQuote(executable).replaceAll("\\", "\\\\");
  const image = icon.replaceAll("\\", "\\\\").replaceAll("\n", "\\n").replaceAll("\r", "\\r");
  return `[Desktop Entry]\nType=Application\nName=Readly\nComment=Заучивание стихотворений\nExec=${exec}\nIcon=${image}\nTerminal=false\nCategories=Education;\nStartupWMClass=readly-desktop\n`;
}

export async function pack({ root = path.resolve("."), platform = process.platform, arch = process.arch, runtimeDir = path.join(root, "node_modules/electron/dist"), corePath } = {}) {
  if (!["linux", "win32"].includes(platform)) throw new Error("Упаковка поддерживает Linux и Windows.");
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
  console.log(`Сборка готова: ${await pack()}`);
}
