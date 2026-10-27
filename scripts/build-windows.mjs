import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, access, rm } from "node:fs/promises";
import path from "node:path";
import { pack } from "./pack.mjs";

if (process.platform !== "linux") throw new Error("--windows поддерживает кросс-сборку только из Linux.");
const root = path.resolve(".");
const target = "x86_64-pc-windows-gnu";
const run = (command, args, options = {}) => execFileSync(command, args, { cwd: root, stdio: "inherit", ...options });
const nodeTool = (file, args) => run(process.execPath, [path.join(root, "node_modules", file), ...args]);
run("rustup", ["target", "add", target]);
nodeTool("typescript/bin/tsc", ["--noEmit"]);
nodeTool("typescript/bin/tsc", ["-p", "electron/tsconfig.json", "--noEmit"]);
run("cargo", ["build", "--release", "--locked", "--target", target, "--manifest-path", "native/Cargo.toml"], {
  env: { ...process.env, CARGO_TARGET_X86_64_PC_WINDOWS_GNU_LINKER: "x86_64-w64-mingw32-gcc" },
});
nodeTool("vite/bin/vite.js", ["build"]);
nodeTool("typescript/bin/tsc", ["-p", "electron/tsconfig.json"]);

// Keep the host Electron installation untouched: Playwright and npm start still use Linux.
const require = createRequire(import.meta.url);
const { version } = require("electron/package.json");
const runtimeDir = path.join(root, "release/.cache", `electron-win32-x64-${version}`);
try { await access(path.join(runtimeDir, ".complete")); }
catch {
  const { downloadArtifact } = require("@electron/get");
  const { extract } = require("@electron-internal/extract-zip");
  const archive = await downloadArtifact({ version, artifactName: "electron", platform: "win32", arch: "x64", checksums: require("electron/checksums.json") });
  await rm(runtimeDir, { recursive: true, force: true });
  await mkdir(runtimeDir, { recursive: true });
  await extract(archive, { dir: runtimeDir });
  const { writeFile } = await import("node:fs/promises");
  await writeFile(path.join(runtimeDir, ".complete"), version);
}
const result = await pack({ platform: "win32", arch: "x64", runtimeDir,
  corePath: path.join(root, "native/target", target, "release/readly-core.exe"),
});
console.log(`Windows x64: ${result}/Readly.exe`);
console.log("Перенесите всю папку на Windows. Для установки запустите Install.ps1 через PowerShell.");
