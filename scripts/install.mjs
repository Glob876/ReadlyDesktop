import { cp, mkdir, writeFile, readFile, rename, rm, mkdtemp, lstat } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { desktopEntry, legacyDesktopEntry, shellQuote } from "./pack.mjs";

async function exists(file) {
  try { await lstat(file); return true; }
  catch (error) { if (error.code === "ENOENT") return false; throw error; }
}
async function updatePathFile(file, bin) {
  const start = "# >>> Readly PATH >>>";
  const end = "# <<< Readly PATH <<<";
  const block = `${start}\ncase ":$PATH:" in\n  *:${shellQuote(bin)}:*) ;;\n  *) export PATH=${shellQuote(bin)}:"$PATH" ;;\nesac\n${end}`;
  const content = await exists(file) ? await readFile(file, "utf8") : "";
  const pattern = /# >>> Readly PATH >>>[\s\S]*?# <<< Readly PATH <<</g;
  const updated = content.includes(start) ? content.replace(pattern, () => block) : content + (content.endsWith("\n") || !content ? "" : "\n") + "\n" + block + "\n";
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, updated);
}

export async function install({
  root = path.resolve("."), platform = process.platform, arch = process.arch,
  homeDir = homedir(), env = process.env, run = execFileSync,
} = {}) {
  if (!["linux", "win32"].includes(platform)) throw new Error("Установка поддерживает Linux и Windows.");
  const source = path.join(root, "release", `Readly-${platform}-${arch}`);
  const metadata = JSON.parse(await readFile(path.join(source, "resources/app/package.json"), "utf8"));
  if (metadata.name !== "readly-desktop") throw new Error("Не найдена готовая сборка Readly. Запустите ./build.sh.");
  if (platform === "win32") {
    const powershell = env.SystemRoot ? path.join(env.SystemRoot, "System32/WindowsPowerShell/v1.0/powershell.exe") : "powershell.exe";
    run(powershell, ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", path.join(source, "Install.ps1")], { stdio: "inherit", env });
    return { source };
  }
  const data = env.XDG_DATA_HOME && path.isAbsolute(env.XDG_DATA_HOME) ? env.XDG_DATA_HOME : path.join(homeDir, ".local/share");
  const target = path.join(data, "readly");
  const bin = path.join(homeDir, ".local/bin");
  if (/[\r\n]/.test(target + bin)) throw new Error("Путь установки не должен содержать переносы строк.");
  if (await exists(target)) {
    const marker = path.join(target, ".readly-install.json");
    if ((await lstat(target)).isSymbolicLink() || !await exists(marker) ||
      JSON.parse(await readFile(marker, "utf8")).name !== "readly-desktop") {
      throw new Error(`Каталог ${target} уже существует и не принадлежит установщику Readly.`);
    }
  }
  const launcher = path.join(bin, "readly");
  if (await exists(launcher)) {
    if ((await lstat(launcher)).isSymbolicLink() || !(await readFile(launcher, "utf8")).startsWith("#!/bin/sh\n# Readly launcher\n")) {
      throw new Error(`Команда ${launcher} уже существует. Освободите это имя перед установкой Readly.`);
    }
  }
  const legacyLauncher = path.join(bin, "readly-legacy");
  const legacyMarker = "#!/bin/sh\n# Readly Legacy launcher\n";
  const hasLegacy = await exists(path.join(source, "ReadlyLegacy"));
  if (await exists(legacyLauncher)) {
    if ((await lstat(legacyLauncher)).isSymbolicLink() || !(await readFile(legacyLauncher, "utf8")).startsWith(legacyMarker)) {
      throw new Error(`Команда ${legacyLauncher} уже существует и не принадлежит Readly Legacy.`);
    }
  }
  const legacyDesktopPath = path.join(data, "applications/readly-legacy.desktop");
  if (hasLegacy && await exists(legacyDesktopPath) && !(await readFile(legacyDesktopPath, "utf8")).includes("StartupWMClass=ReadlyLegacy")) {
    throw new Error(`Ярлык ${legacyDesktopPath} уже существует и не принадлежит Readly Legacy.`);
  }
  await mkdir(data, { recursive: true });
  const temporary = await mkdtemp(path.join(data, ".readly-install-"));
  const staged = path.join(temporary, "next");
  const backup = path.join(temporary, "previous");
  try {
    await cp(source, staged, { recursive: true, verbatimSymlinks: true });
    await lstat(path.join(staged, "readly"));
    await lstat(path.join(staged, "resources/readly-core"));
    if (hasLegacy) await lstat(path.join(staged, "resources/legacy/ReadlyLegacy"));
    await writeFile(path.join(staged, ".readly-install.json"), JSON.stringify({ name: metadata.name, version: metadata.version }));
    const updating = await exists(target);
    if (updating) await rename(target, backup);
    try { await rename(staged, target); }
    catch (error) { if (updating) await rename(backup, target); throw error; }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
  await mkdir(bin, { recursive: true });
  // Use an absolute wrapper: a symlink to Readly would change dirname($0).
  await writeFile(path.join(bin, "readly"), `#!/bin/sh\n# Readly launcher\nexec ${shellQuote(path.join(target, "Readly"))} "$@"\n`, { mode: 0o755 });
  const applications = path.join(data, "applications");
  await mkdir(applications, { recursive: true });
  await writeFile(path.join(applications, "readly-desktop.desktop"), desktopEntry(path.join(target, "Readly"), path.join(target, "readly.png")));
  const legacyDesktop = path.join(applications, "readly-legacy.desktop");
  if (hasLegacy) {
    await writeFile(legacyLauncher, `${legacyMarker}exec ${shellQuote(path.join(target, "ReadlyLegacy"))} "$@"\n`, { mode: 0o755 });
    await writeFile(legacyDesktop, legacyDesktopEntry(path.join(target, "ReadlyLegacy"), path.join(target, "readly.png")));
  } else {
    await rm(legacyLauncher, { force: true });
    if (await exists(legacyDesktop) && (await readFile(legacyDesktop, "utf8")).includes("StartupWMClass=ReadlyLegacy")) {
      await rm(legacyDesktop);
    }
  }
  await updatePathFile(path.join(homeDir, ".profile"), bin);
  await updatePathFile(path.join(homeDir, ".bashrc"), bin);
  const config = env.XDG_CONFIG_HOME && path.isAbsolute(env.XDG_CONFIG_HOME) ? env.XDG_CONFIG_HOME : path.join(homeDir, ".config");
  if (path.basename(env.SHELL || "") === "zsh") {
    await updatePathFile(path.join(env.ZDOTDIR || homeDir, ".zshrc"), bin);
    await updatePathFile(path.join(env.ZDOTDIR || homeDir, ".zprofile"), bin);
  }
  if (path.basename(env.SHELL || "") === "fish") {
    const fish = path.join(config, "fish/conf.d");
    await mkdir(fish, { recursive: true });
    const quoted = "'" + bin.replaceAll("\\", "\\\\").replaceAll("'", "\\'") + "'";
    await writeFile(path.join(fish, "readly.fish"), `fish_add_path -- ${quoted}\n`);
  }
  return { target, bin };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await install();
    console.log(`Readly установлен${result.target ? `: ${result.target}` : ""}.`);
    console.log("Запуск: Readly в меню приложений или readly в новом терминале. В Windows может потребоваться перезапуск терминала целиком.");
  } catch (error) {
    console.error(`Не удалось установить Readly: ${error.message}`);
    process.exitCode = 1;
  }
}
