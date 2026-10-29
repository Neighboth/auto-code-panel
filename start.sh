#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "[HATA] Node.js bulunamadi."
  echo "Node.js 20.9 veya daha yeni bir surum kurun: https://nodejs.org/"
  echo ""
  exit 1
fi

exec node scripts/launch.mjs
