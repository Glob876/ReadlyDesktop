import { execFileSync } from "node:child_process";
import path from "node:path";
import { msvcEnvironment, cargoEnvironment } from "./cargo.mjs";

const psQuote = (value) => "'" + value.replaceAll("'", "''") + "'";

// Only the Windows build entry point installs dependencies. npm test/build stay
// read-only with respect to the machine's installed development tools.
export function setupWindows({
  platform = process.platform, arch = process.arch, env = process.env,
  run = execFileSync, probeMsvc = msvcEnvironment, probeCargo = cargoEnvironment,
  log = console.log,
} = {}) {
  if (platform !== "win32") return env;
  const triple = { x64: "x86_64", arm64: "aarch64", ia32: "i686" }[arch];
  if (!triple) throw new Error(`Неподдерживаемая архитектура Windows: ${arch}`);
  const target = `${triple}-pc-windows-msvc`;
  const current = { ...env };
  const get = (name) => Object.entries(current).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1];
  // Rustup's default user directory may not be in this terminal's old PATH yet.
  const cargoHome = get("CARGO_HOME") || path.win32.join(get("USERPROFILE") || "C:\\Users\\Default", ".cargo");
  const pathKey = Object.keys(current).find((key) => key.toLowerCase() === "path") || "Path";
  current[pathKey] = `${path.win32.join(cargoHome, "bin")};${current[pathKey] || ""}`;
  const options = { platform, arch, env: current, run };
  const capture = (command, args) => run(command, args, { env: current, encoding: "utf8" });
  const execute = (command, args) => run(command, args, { env: current, stdio: "inherit" });
  const powershell = (source) => execute("powershell.exe", [
    "-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", Buffer.from(source, "utf16le").toString("base64"),
  ]);
  const install = (id, extra = []) => {
    try { capture("winget.exe", ["--version"]); }
    catch { throw new Error('Не найден winget. Установите «Установщик приложений» от Microsoft из Microsoft Store и снова запустите build.cmd.'); }
    log(`Устанавливаем ${id} через winget. Подтвердите запрос Windows, если он появится…`);
    try {
      execute("winget.exe", ["install", "--exact", "--id", id, "--source", "winget",
        "--accept-source-agreements", "--accept-package-agreements", "--disable-interactivity", ...extra]);
    } catch (error) {
      throw new Error(`Не удалось установить ${id} (код ${error.status ?? "запуска"}). Проверьте интернет и подтвердите запрос Windows. Затем запустите build.cmd ещё раз.`);
    }
  };

  try { probeMsvc(options); }
  catch {
    const programFiles = get("ProgramFiles(x86)") || get("ProgramFiles") || "C:\\Program Files (x86)";
    const vswhere = path.win32.join(programFiles, "Microsoft Visual Studio", "Installer", "vswhere.exe");
    let existing = "";
    try {
      existing = capture(vswhere, ["-latest", "-products", "Microsoft.VisualStudio.Product.BuildTools",
        "-version", "[17.0,18.0)", "-property", "installationPath", "-utf8"]).trim();
    } catch (error) { if (error.code !== "ENOENT") throw error; }
    const components = ["--add", "Microsoft.VisualStudio.Workload.VCTools", "--includeRecommended"];
    if (arch === "arm64") components.push("--add", "Microsoft.VisualStudio.Component.VC.Tools.ARM64");
    if (existing) {
      // winget skips already installed products; use the installed VS setup to
      // add missing components rather than claiming a core-only install is ready.
      log("Добавляем компоненты C++ и Windows SDK в Build Tools 2022…");
      const installer = path.win32.join(programFiles, "Microsoft Visual Studio", "Installer", "setup.exe");
      const argumentsText = ["modify", "--installPath", `"${existing}"`, "--channelId", "VisualStudio.17.Release",
        "--passive", "--norestart", ...components].join(" ");
      try {
        powershell(`$ErrorActionPreference = 'Stop'; try { $p = Start-Process -FilePath ${psQuote(installer)} -ArgumentList ${psQuote(argumentsText)} -Verb RunAs -Wait -PassThru; exit $p.ExitCode } catch { Write-Error $_; exit 1 }`);
      } catch (error) {
        if (error.status === 3010) throw new Error("Компоненты установлены. Перезагрузите Windows и снова запустите build.cmd.");
        throw new Error(`Не удалось добавить компоненты C++ (код ${error.status ?? "запуска"}). Подтвердите запрос Windows, закройте Visual Studio и снова запустите build.cmd.`);
      }
    } else {
      install("Microsoft.VisualStudio.2022.BuildTools", ["--override",
        ["--passive", "--wait", "--norestart", ...components].join(" ")]);
    }
    try { probeMsvc(options); }
    catch { throw new Error("Компоненты MSVC пока недоступны. Если установка просила перезагрузку, перезагрузите Windows и снова запустите build.cmd."); }
  }

  try { capture("rustup", ["--version"]); }
  catch { install("Rustlang.Rustup", ["--silent"]); }
  let host = "";
  try { host = capture("rustc", ["-vV"]).match(/^host: (\S+)/m)?.[1]; }
  catch { /* A fresh rustup may not yet have a toolchain. */ }
  if (host !== target) {
    log(`Подключаем Rust MSVC (${target}) для сборки Readly…`);
    // Keep the user's global default (e.g. GNU) intact; select MSVC for children.
    execute("rustup", ["toolchain", "install", `stable-${target}`, "--profile", "minimal"]);
    current.RUSTUP_TOOLCHAIN = `stable-${target}`;
  }
  return probeCargo(options);
}
