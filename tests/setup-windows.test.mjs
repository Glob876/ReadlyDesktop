import { test } from "node:test";
import assert from "node:assert/strict";
import { setupWindows } from "../scripts/setup-windows.mjs";

function fixture({ vs = false, rust = false, host = "", existing = "", failInstall = false, winget = true, modifyStatus = 0 } = {}) {
  const calls = [];
  const env = { Path: "C:\\Git\\usr\\bin", USERPROFILE: "C:\\Users\\Тест", "ProgramFiles(x86)": "C:\\Program Files (x86)" };
  const options = {
    platform: "win32", arch: "x64", env, log() {},
    run(command, args, config) {
      calls.push({ command, args, config });
      if (command.endsWith("vswhere.exe")) {
        if (!existing) throw Object.assign(new Error("missing"), { code: "ENOENT" });
        return existing;
      }
      if (command === "winget.exe") {
        if (!winget) throw Object.assign(new Error("missing"), { code: "ENOENT" });
        if (args[0] === "--version") return "v1.12";
        if (failInstall) throw Object.assign(new Error("install failed"), { status: 42 });
        if (args.includes("Microsoft.VisualStudio.2022.BuildTools")) vs = true;
        else if (args.includes("Rustlang.Rustup")) rust = true;
        else assert.fail(`unexpected install: ${args}`);
        return "";
      }
      if (command === "powershell.exe") {
        if (modifyStatus) throw Object.assign(new Error("modify failed"), { status: modifyStatus });
        vs = true;
        return "";
      }
      if (command === "rustup") {
        if (!rust) throw Object.assign(new Error("missing"), { code: "ENOENT" });
        if (args[0] === "toolchain") host = args[2].slice("stable-".length);
        return "rustup 1.29";
      }
      if (command === "rustc") {
        if (!host) throw new Error("no toolchain");
        return `host: ${host}\n`;
      }
      assert.fail(`unexpected command: ${command}`);
    },
    probeMsvc() { if (!vs) throw new Error("missing MSVC/SDK"); },
    probeCargo({ env }) {
      assert.equal(vs, true);
      assert.equal(rust, true);
      assert.equal(host, "x86_64-pc-windows-msvc");
      return { ...env, CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_LINKER: "C:\\VS\\link.exe" };
    },
  };
  return { options, calls, env };
}

test("fresh Windows installs C++ workload with SDK before Rust and selects MSVC", () => {
  const f = fixture();
  const result = setupWindows(f.options);
  const installs = f.calls.filter(({ args }) => args[0] === "install");
  assert.equal(installs.length, 2);
  assert.ok(installs[0].args.includes("Microsoft.VisualStudio.2022.BuildTools"));
  assert.equal(installs[0].args.at(-1), "--passive --wait --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended");
  assert.ok(installs[1].args.includes("Rustlang.Rustup"));
  for (const call of installs) {
    assert.ok(call.args.includes("--accept-package-agreements"));
    assert.ok(call.args.includes("--accept-source-agreements"));
    assert.ok(call.args.includes("--disable-interactivity"));
    assert.equal(call.config.stdio, "inherit");
  }
  assert.match(result.Path, /^C:\\Users\\Тест\\.cargo\\bin;/);
  assert.equal(result.RUSTUP_TOOLCHAIN, "stable-x86_64-pc-windows-msvc");
  assert.equal(f.env.Path, "C:\\Git\\usr\\bin");
});

test("ready Windows performs no installations and works without winget", () => {
  const f = fixture({ vs: true, rust: true, host: "x86_64-pc-windows-msvc", winget: false });
  setupWindows(f.options);
  assert.deepEqual(f.calls.map(({ command }) => command), ["rustup", "rustc"]);
});

test("existing Build Tools gains missing components instead of a skipped winget install", () => {
  const f = fixture({ existing: "C:\\Инструменты O'Neil\\Build Tools", rust: true, host: "x86_64-pc-windows-msvc" });
  setupWindows(f.options);
  const command = f.calls.find(({ command }) => command === "powershell.exe");
  const source = Buffer.from(command.args.at(-1), "base64").toString("utf16le");
  assert.match(source, /Start-Process.*setup.exe/);
  assert.ok(source.includes('--installPath "C:\\Инструменты O\'\'Neil\\Build Tools"'));
  assert.match(source, /--add Microsoft.VisualStudio.Workload.VCTools --includeRecommended/);
  assert.match(source, /-Verb RunAs -Wait -PassThru/);
  assert.match(source, /exit \$p.ExitCode/);
  assert.equal(f.calls.some(({ command }) => command === "winget.exe"), false);
});

test("GNU Rust is preserved globally while children use the installed MSVC toolchain", () => {
  const f = fixture({ vs: true, rust: true, host: "x86_64-pc-windows-gnu" });
  f.options.env.CARGO_HOME = "D:\\Rust tools";
  const result = setupWindows(f.options);
  assert.match(result.Path, /^D:\\Rust tools\\bin;/);
  assert.equal(result.RUSTUP_TOOLCHAIN, "stable-x86_64-pc-windows-msvc");
  assert.ok(f.calls.some(({ args }) => args.join(" ") === "toolchain install stable-x86_64-pc-windows-msvc --profile minimal"));
  assert.equal(f.calls.some(({ args }) => args[0] === "default"), false);
});

test("failed installation or unavailable winget stops setup before claiming success", () => {
  for (const setting of [{ failInstall: true }, { winget: false }]) {
    const f = fixture(setting);
    assert.throws(() => setupWindows(f.options), setting.failInstall ? /код 42/ : /Microsoft Store/);
    assert.equal(f.calls.some(({ command }) => command === "rustup"), false);
  }
});

test("unsuccessful MSVC setup is rechecked and reported without installing more tools", () => {
  const f = fixture();
  f.options.probeMsvc = () => { throw new Error("SDK still missing"); };
  assert.throws(() => setupWindows(f.options), /перезагрузите Windows/);
  assert.equal(f.calls.some(({ command }) => command === "rustup"), false);
});

test("cancelled component setup and requested reboot produce readable errors and stop", () => {
  for (const modifyStatus of [1, 3010]) {
    const f = fixture({ existing: "C:\\Build Tools", modifyStatus });
    assert.throws(() => setupWindows(f.options), modifyStatus === 3010 ? /Перезагрузите Windows/ : /Подтвердите запрос Windows/);
    assert.equal(f.calls.some(({ command }) => command === "rustup"), false);
  }
});

test("Linux never invokes Windows installers", () => {
  const env = { PATH: "/usr/bin" };
  assert.equal(setupWindows({ platform: "linux", env, run: () => assert.fail("unexpected command") }), env);
});
