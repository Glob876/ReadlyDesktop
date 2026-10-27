#!/usr/bin/env bash
set -euo pipefail

cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

pack_only=0
windows_build=0
for argument in "$@"; do
  case "$argument" in
    --help|-h)
      printf 'Использование: ./build.sh [--pack-only] [--windows]\nБез флагов: сборка и установка для текущего пользователя (Linux или Windows/Git Bash).\n--pack-only: переносимая сборка в release/, без установки.\n--windows: сборка Windows x64 из Linux в release/Readly-win32-x64/, без установки.\n'
      exit 0 ;;
    --pack-only) pack_only=1 ;;
    --windows) windows_build=1; pack_only=1 ;;
    *) printf 'Неизвестный аргумент: %s. См. ./build.sh --help\n' "$argument" >&2; exit 1 ;;
  esac
done

for command in node npm cargo; do
  if ! command -v "$command" >/dev/null 2>&1; then
    printf 'Для сборки Readly требуется %s. См. README.md.\n' "$command" >&2
    exit 1
  fi
done

if ! node -e 'process.exit(["linux", "win32"].includes(process.platform) ? 0 : 1)'; then
  printf 'Автоматическая сборка и установка поддерживают Linux и Windows.\n' >&2
  exit 1
fi

if ! node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 22 || (major === 22 && minor >= 12) ? 0 : 1)'; then
  if [[ "${READLY_NODE_BOOTSTRAPPED:-}" == 1 ]]; then
    printf 'Не удалось подключить Node.js 24. Установите Node.js 22.12+ и повторите сборку.\n' >&2
    exit 1
  fi
  printf 'Подключаем Node.js 24 через npm…\n'
  export READLY_NODE_BOOTSTRAPPED=1
  exec npm exec --yes --package=node@24 -- bash "$PWD/build.sh" "$@"
fi

if [[ "$windows_build" == 1 ]]; then
  if ! node -e 'process.exit(process.platform === "linux" ? 0 : 1)'; then
    printf '%s\n' '--windows предназначен для кросс-сборки из Linux. В Windows используйте --pack-only.' >&2
    exit 1
  fi
  for command in rustup x86_64-w64-mingw32-gcc; do
    if ! command -v "$command" >/dev/null 2>&1; then
      printf 'Для --windows требуется %s. Установите rustup и MinGW-w64.\nDebian/Ubuntu: sudo apt install gcc-mingw-w64-x86-64\nFedora: sudo dnf install mingw64-gcc\nArch: sudo pacman -S mingw-w64-gcc\n' "$command" >&2
      exit 1
    fi
  done
fi

install_key=$(node -e 'const fs = require("node:fs"); const crypto = require("node:crypto"); console.log([process.versions.node.split(".")[0], process.platform, process.arch, crypto.createHash("sha256").update(fs.readFileSync("package-lock.json")).digest("hex")].join(":"))')
if [[ ! -f node_modules/.readly-install ]] || [[ "$(cat node_modules/.readly-install)" != "$install_key" ]]; then
  npm ci --include=optional
  printf '%s\n' "$install_key" > node_modules/.readly-install
fi

if [[ "$windows_build" == 1 ]]; then
  node scripts/build-windows.mjs
  exit 0
fi
npm run pack
if [[ "$pack_only" == 0 ]]; then
  node scripts/install.mjs
fi
