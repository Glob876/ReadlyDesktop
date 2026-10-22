#!/usr/bin/env bash
set -euo pipefail

cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

for command in node npm cargo; do
  if ! command -v "$command" >/dev/null 2>&1; then
    printf 'Для запуска Readly требуется %s. См. README.md.\n' "$command" >&2
    exit 1
  fi
done

if [[ ! -d node_modules ]]; then
  npm ci
fi

npm run build
exec npm start -- "$@"
