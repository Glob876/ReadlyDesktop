import { test } from "node:test";
import assert from "node:assert/strict";
import { cargoEnvironment } from "../scripts/cargo.mjs";

function windowsFixture({ host = "x86_64-pc-windows-msvc", installation = "C:\\Visual Studio 2022", missing = "", sdk = true } = {}) {
  const calls = [];
  const env = { PATH: "C:\\Git\\usr\\bin", "ProgramFiles(x86)": "C:\\Program Files (x86)", KEEP: "value" };
  const options = {
    platform: "win32", arch: "x64", env,
    exists: (file) => !missing || !file.endsWith(missing),
    run(command, args, options) {
      calls.push({ command, args, options });
      if (command === "rustc") return `rustc 1.90.0\nhost: ${host}\n`;
      if (command.endsWith("vswhere.exe")) return installation;
      assert.equal(command, "cmd.exe");
      return [
        "=C:=C:\\ignored", "Path=C:\\Visual Studio 2022\\bin;C:\\Git\\usr\\bin",
        "VCToolsInstallDir=C:\\Visual Studio 2022\\VC\\Tools\\MSVC\\14.44\\",
        ...(sdk ? ["WindowsSdkDir=C:\\Program Files (x86)\\Windows Kits\\10\\"] : []),
        "USERPROFILE=C:\\Users\\Тест", "WITH_EQUALS=a=b", "",
      ].join("\r\n");
    },
  };
  return { options, calls, env };
}

test("Windows uses the absolute VS 2022 MSVC linker even with Git Bash first in PATH", () => {
  const { options, calls, env } = windowsFixture();
  const result = cargoEnvironment(options);
  assert.equal(result.CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_LINKER,
    "C:\\Visual Studio 2022\\VC\\Tools\\MSVC\\14.44\\bin\\Hostx64\\x64\\link.exe");
  assert.equal(Object.keys(result).filter((key) => key.toLowerCase() === "path").length, 1);
  assert.match(result.Path, /^C:\\Visual Studio 2022/);
  assert.equal(result.KEEP, "value");
  assert.equal(result.USERPROFILE, "C:\\Users\\Тест");
  assert.equal(result.WITH_EQUALS, "a=b");
  assert.equal(env.PATH, "C:\\Git\\usr\\bin");
  assert.deepEqual(calls[1].args, ["-latest", "-products", "*", "-version", "[17.0,18.0)",
    "-requires", "Microsoft.VisualStudio.Component.VC.Tools.x86.x64", "-property", "installationPath", "-utf8"]);
  assert.deepEqual(calls[2].args, ["/d", "/s", "/c",
    '"chcp 65001 >nul && call "C:\\Visual Studio 2022\\Common7\\Tools\\VsDevCmd.bat" -no_logo -arch=x64 -host_arch=x64 >nul && set"']);
  assert.equal(calls[2].options.windowsVerbatimArguments, true);
});

test("Windows explains missing VS 2022, C++ tools, SDK and linker before invoking Cargo", () => {
  for (const setting of [
    { missing: "vswhere.exe" }, { installation: "" }, { missing: "VsDevCmd.bat" },
    { sdk: false }, { missing: "link.exe" },
  ]) {
    assert.throws(() => cargoEnvironment(windowsFixture(setting).options), /Build Tools 2022/);
  }
});

test("Windows rejects a GNU Rust host and gives the MSVC setup command", () => {
  const { options, calls } = windowsFixture({ host: "x86_64-pc-windows-gnu" });
  assert.throws(() => cargoEnvironment(options), /rustup default stable-x86_64-pc-windows-msvc/);
  assert.equal(calls.length, 1);
});

test("ARM64 Windows selects ARM64 MSVC tools", () => {
  const { options, calls } = windowsFixture({ host: "aarch64-pc-windows-msvc" });
  const result = cargoEnvironment({ ...options, arch: "arm64" });
  assert.match(result.CARGO_TARGET_AARCH64_PC_WINDOWS_MSVC_LINKER, /Hostarm64\\arm64\\link.exe$/);
  assert.ok(calls[1].args.includes("Microsoft.VisualStudio.Component.VC.Tools.ARM64"));
});

test("Linux retains its native environment without probing Windows tools", () => {
  const env = { PATH: "/usr/bin" };
  assert.equal(cargoEnvironment({ platform: "linux", env, run: () => assert.fail("unexpected probe") }), env);
});
