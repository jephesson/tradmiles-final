#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
OUT="$ROOT/xcode"
APP="TradeMiles LATAM Safari"
BUNDLE="br.com.trademiles.latam-safari"

if ! xcrun --find safari-web-extension-converter >/dev/null 2>&1; then
  echo "Instale o Xcode (App Store), abra uma vez, e rode de novo:"
  echo "  xcode-select -s /Applications/Xcode.app/Contents/Developer"
  exit 1
fi

rm -rf "$OUT"
mkdir -p "$OUT"

xcrun safari-web-extension-converter "$ROOT" \
  --project-location "$OUT" \
  --app-name "$APP" \
  --bundle-identifier "$BUNDLE" \
  --macos-only \
  --force \
  --no-prompt

echo
echo "Pronto. Abra o .xcodeproj em $OUT, clique ▶ Run, e ative a extensão no Safari."
open "$OUT"/*.xcodeproj 2>/dev/null || true
