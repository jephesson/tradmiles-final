#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/extension"
DST="$ROOT/extension-safari"
mkdir -p "$DST/content"
cp "$SRC/background.js" "$DST/background.js"
cp "$SRC/popup.html" "$DST/popup.html"
cp "$SRC/popup.js" "$DST/popup.js"
cp "$SRC/content/page-hooks.js" "$DST/content/page-hooks.js"
cp "$SRC/content/passengers.js" "$DST/content/passengers.js"
cp "$SRC/content/payment.js" "$DST/content/payment.js"
echo "Safari sincronizado a partir de extension/ (manifest e inject-page-hooks ficam)."
