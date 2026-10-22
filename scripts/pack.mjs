import { cp, mkdir, writeFile, chmod, rename } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
// Electron 45 downloads its runtime lazily on first use.
createRequire(import.meta.url)("electron");
const target = path.resolve(
  "release",
  `Readly-${process.platform}-${process.arch}`,
);
if (process.platform !== "linux")
  throw new Error(
    "Скрипт переносимой сборки пока поддерживает Linux. npm run build и npm start работают на других системах при наличии Rust.",
  );
await mkdir(target, { recursive: true });
await cp("node_modules/electron/dist", target, { recursive: true });
await rename(path.join(target, "electron"), path.join(target, "readly"));
const appDir = path.join(target, "resources/app");
await mkdir(appDir, { recursive: true });
await cp("dist", path.join(appDir, "dist"), { recursive: true });
await cp("dist-electron", path.join(appDir, "dist-electron"), {
  recursive: true,
});
await cp(
  "native/target/release/readly-core",
  path.join(target, "resources/readly-core"),
);
await cp("assets/icon.svg", path.join(target, "readly.svg"));
await cp("README.md", path.join(target, "README.md"));
await cp("native/Cargo.lock", path.join(target, "Cargo.lock"));
await cp("package-lock.json", path.join(target, "package-lock.json"));
await writeFile(
  path.join(appDir, "package.json"),
  JSON.stringify({
    name: "readly-desktop",
    productName: "Readly",
    version: "0.1.0",
    main: "dist-electron/electron/main.js",
  }),
);
await writeFile(
  path.join(target, "Readly"),
  '#!/bin/sh\ncd -- "$(dirname -- "$0")" || exit 1\nexec ./readly "$@"\n',
);
await chmod(path.join(target, "Readly"), 0o755);
console.log(`Готово: ${target}/Readly`);
