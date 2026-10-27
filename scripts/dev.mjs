import { spawn, spawnSync } from "node:child_process";
import { createServer } from "vite";
import { runCargo } from "./cargo.mjs";
const cargoStatus = runCargo(["build", "--release", "--manifest-path", "native/Cargo.toml"]);
if (cargoStatus !== 0) process.exit(cargoStatus);
for (const [cmd, args] of [
  ["npx", ["tsc", "-p", "electron/tsconfig.json"]],
]) {
  const build = spawnSync(cmd, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (build.status !== 0) process.exit(build.status ?? 1);
}
const server = await createServer({
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
});
await server.listen();
const child = spawn("node_modules/.bin/electron", ["."], {
  stdio: "inherit",
  env: { ...process.env, READLY_DEV_URL: "http://127.0.0.1:5173" },
});
child.on("exit", async (code) => {
  await server.close();
  process.exit(code ?? 0);
});
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
