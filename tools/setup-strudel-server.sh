#!/usr/bin/env bash
# Vendoring + build for the nvim-strudel server (used by tools/strudel-play.mjs).
# Safe to re-run: only clones / builds when missing.
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -d nvim-strudel ]; then
  echo "cloning nvim-strudel ..."
  git clone --depth 1 https://github.com/Goshujinsama/nvim-strudel nvim-strudel
fi

cd nvim-strudel/server
if [ ! -f dist/index.js ]; then
  echo "building strudel server ..."
  npm ci
  npm run build
fi
echo "strudel server ready: $(pwd)/dist/index.js"
