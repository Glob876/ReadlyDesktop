import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Windows environment names are case-insensitive. Keep one spelling per variable,
// especially Path: Node otherwise may pass the inherited Git Bash PATH instead.
function mergeEnvironment(base, entries) {
  const result = { ...base };
  for (const [name, value] of entries) {
    for (const key of Object.keys(result)) {
      if (key.toLowerCase() === name.toLowerCase()) delete result[key];
    }
    result[name] = value;
  }
  return result;
}

const get = (env, name) => Object.entries(env).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1];

export function msvcEnvironment({
  platform = process.platform, arch = process.arch, env = process.env,
  run = execFileSync, exists = existsSync,
} = {}) {
  if (platform !== "win32") return env;
  const architecture = {
    x64: ["x86_64-pc-windows-msvc", "x64"],
    arm64: ["aarch64-pc-windows-msvc", "arm64"],
    ia32: ["i686-pc-windows-msvc", "x86"],
  }[arch];
  if (!architecture) throw new Error(`Неподдерживаемая архитектура Windows: ${arch}`);
  const [target, vcArch] = architecture;
  const programFiles = get(env, "ProgramFiles(x86)") || get(env, "ProgramFiles") || "C:\\Program Files (x86)";
  const vswhere = path.win32.join(programFiles, "Microsoft Visual Studio", "Installer", "vswhere.exe");
  const missingTools = 'Не найдены Visual Studio Build Tools 2022 с C++ и Windows SDK. Запустите build.cmd для автоматической установки.';
  if (!exists(vswhere)) throw new Error(missingTools);
  const component = arch === "arm64"
    ? "Microsoft.VisualStudio.Component.VC.Tools.ARM64"
    : "Microsoft.VisualStudio.Component.VC.Tools.x86.x64";
  const installation = run(vswhere, [
    "-latest", "-products", "*", "-version", "[17.0,18.0)",
    "-requires", component, "-property", "installationPath", "-utf8",
  ], { env, encoding: "utf8" }).trim();
  if (!installation) throw new Error(missingTools);
  const devCmd = path.win32.join(installation, "Common7", "Tools", "VsDevCmd.bat");
  if (!exists(devCmd)) throw new Error(missingTools);
  // cmd.exe needs both the outer command quotes and the quotes around the BAT
  // path. Preserve them verbatim rather than applying Node's EXE argument quoting.
  const command = `"chcp 65001 >nul && call "${devCmd}" -no_logo -arch=${vcArch} -host_arch=${vcArch} >nul && set"`;
  const output = run(get(env, "ComSpec") || "cmd.exe", ["/d", "/s", "/c", command], {
    env, encoding: "utf8", windowsVerbatimArguments: true,
  });
  const entries = output.split(/\r?\n/).flatMap((line) => {
    const separator = line.indexOf("=");
    return separator > 0 ? [[line.slice(0, separator), line.slice(separator + 1)]] : [];
  });
  const configured = mergeEnvironment(env, entries);
  const tools = get(configured, "VCToolsInstallDir");
  const sdk = get(configured, "WindowsSdkDir");
  if (!tools || !sdk) throw new Error(missingTools);
  const linker = path.win32.join(tools, "bin", `Host${vcArch}`, vcArch, "link.exe");
  if (!exists(linker)) throw new Error(`Не найден линкер MSVC: ${linker}. ${missingTools}`);
  return mergeEnvironment(configured, [[`CARGO_TARGET_${target.toUpperCase().replaceAll("-", "_")}_LINKER`, linker]]);
}

export function cargoEnvironment(options = {}) {
  const { platform = process.platform, arch = process.arch, env = process.env, run = execFileSync } = options;
  if (platform !== "win32") return env;
  const target = { x64: "x86_64", arm64: "aarch64", ia32: "i686" }[arch];
  if (!target) throw new Error(`Неподдерживаемая архитектура Windows: ${arch}`);
  const expected = `${target}-pc-windows-msvc`;
  const host = run("rustc", ["-vV"], { env, encoding: "utf8" }).match(/^host: (\S+)/m)?.[1];
  if (host !== expected) {
    throw new Error(`Для Windows нужен Rust MSVC (${expected}). Выполните: rustup default stable-${expected}`);
  }
  return msvcEnvironment(options);
}

export function runCargo(args) {
  try {
    const result = spawnSync("cargo", args, { env: cargoEnvironment(), stdio: "inherit" });
    if (result.error) throw result.error;
    return result.status ?? 1;
  } catch (error) {
    console.error(`Ошибка подготовки Rust: ${error.message}`);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runCargo(process.argv.slice(2));
}
