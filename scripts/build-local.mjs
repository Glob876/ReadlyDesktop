import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { setupWindows } from "./setup-windows.mjs";

try {
  const args = process.argv.slice(2);
  if (args.some((arg) => !["--pack-only", "--help", "-h"].includes(arg))) {
    throw new Error("Использование: build.cmd [--pack-only]. Флаг --windows предназначен для сборки из Linux.");
  }
  if (args.includes("--help") || args.includes("-h")) {
    console.log("build.cmd — сборка и установка Readly; build.cmd --pack-only — только переносимая сборка.");
  } else {
    if (process.platform !== "win32") throw new Error("Этот скрипт предназначен для Windows. В Linux используйте ./build.sh.");
    process.chdir(fileURLToPath(new URL("../", import.meta.url)));
    const env = setupWindows();
    const run = (command, arguments_) => execFileSync(command, arguments_, { env, stdio: "inherit" });
    // npm.cmd requires cmd.exe. All its arguments below are fixed literals.
    const npm = (...arguments_) => run(process.env.ComSpec || "cmd.exe", ["/d", "/c", "npm", ...arguments_]);
    const key = [process.versions.node.split(".")[0], process.platform, process.arch,
      createHash("sha256").update(await readFile("package-lock.json")).digest("hex")].join(":");
    let installed = "";
    try { installed = (await readFile("node_modules/.readly-install", "utf8")).trim(); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    if (installed !== key) {
      npm("ci", "--include=optional");
      await writeFile("node_modules/.readly-install", `${key}\n`);
    }
    npm("run", "pack");
    if (!args.includes("--pack-only")) run(process.execPath, ["scripts/install.mjs"]);
    console.log(args.includes("--pack-only") ? "Переносимая сборка Readly готова в release/." : "Readly установлен. Запустите его из меню «Пуск».");
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
