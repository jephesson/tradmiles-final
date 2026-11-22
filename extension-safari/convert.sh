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

# O conversor do Xcode 27 troca o bundle do app e a extensão deixa de ser prefixo.
PBX=$(find "$OUT" -name project.pbxproj | head -1)
if [[ -n "$PBX" ]]; then
  python3 - "$PBX" "$BUNDLE" <<'PY'
import pathlib, sys
p = pathlib.Path(sys.argv[1])
bundle = sys.argv[2]
text = p.read_text()
text = text.replace(
    'PRODUCT_BUNDLE_IDENTIFIER = "br.com.trademiles.TradeMiles-LATAM-Safari";',
    f'PRODUCT_BUNDLE_IDENTIFIER = "{bundle}";',
)
text = text.replace(
    f'PRODUCT_BUNDLE_IDENTIFIER = "{bundle}.Extension";',
    f'PRODUCT_BUNDLE_IDENTIFIER = "{bundle}.Extension";',
)
p.write_text(text)
print("Bundle IDs alinhados:", bundle, "e", bundle + ".Extension")
PY
fi

echo
echo "Pronto. Abra o .xcodeproj em $OUT, clique ▶ Run, e ative a extensão no Safari."
open "$OUT"/*.xcodeproj 2>/dev/null || true
