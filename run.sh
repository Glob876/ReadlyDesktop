#!/usr/bin/env bash
set -euo pipefail

cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

if [[ "${1:-}" == "--legacy" ]]; then
  shift
  if [[ "$#" != 0 ]]; then
    printf 'Использование: ./run.sh --legacy\n' >&2
    exit 1
  fi
  for python in python3 python; do
    if command -v "$python" >/dev/null 2>&1; then
      exec "$python" "$PWD/legacy/bootstrap.py"
    fi
  done
  printf 'Для запуска Legacy из исходников требуется Python 3.12+ и Tkinter (или uv). См. README.md.\n' >&2
  exit 1
fi

for command in node npm cargo; do
  if ! command -v "$command" >/dev/null 2>&1; then
    printf 'Для запуска Readly требуется %s. См. README.md.\n' "$command" >&2
    exit 1
  fi
done

if ! node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 22 || (major === 22 && minor >= 12) ? 0 : 1)'; then
  if [[ "${READLY_NODE_BOOTSTRAPPED:-}" == 1 ]]; then
    printf 'Не удалось подключить Node.js 24. Установите Node.js 22.12+ и повторите запуск.\n' >&2
    exit 1
  fi
  printf 'Node.js %s несовместим с Readly. Подключаем Node.js 24 через npm…\n' "$(node --version)"
  export READLY_NODE_BOOTSTRAPPED=1
  exec npm exec --yes --package=node@24 -- bash "$PWD/run.sh" "$@"
fi

# Reinstall dependencies left by an older Node/npm or a different lockfile.
install_key=$(node -e 'const fs = require("node:fs"); const crypto = require("node:crypto"); console.log([process.versions.node.split(".")[0], process.platform, process.arch, crypto.createHash("sha256").update(fs.readFileSync("package-lock.json")).digest("hex")].join(":"))')
if [[ ! -f node_modules/.readly-install ]] || [[ "$(cat node_modules/.readly-install)" != "$install_key" ]]; then
  npm ci --include=optional
  printf '%s\n' "$install_key" > node_modules/.readly-install
fi

npm run build
exec npm start -- "$@"
