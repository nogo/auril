#!/usr/bin/env sh
# Vendor kit components into an app, next to its vendored kernel.
# Usage: ./kit.sh <dest-dir> <component>...   e.g. ./kit.sh ../app/web/kit a2ui confirm
# <dest-dir> must sit beside the app's auril/ folder: kit files import
# '../auril/index.js'. A component brings the files it needs.
set -e
DEST="$1"
[ -n "$DEST" ] && [ $# -ge 2 ] || { echo "usage: $0 <dest-dir> <component>... (base, a2ui, confirm, icons)"; exit 1; }
shift
SRC="$(dirname "$0")/kit"
STAMP="$(git -C "$SRC" describe --tags --always 2>/dev/null || echo dev)"
mkdir -p "$DEST"
copy() { sed "s#'\.\./src/index\.js'#'../auril/index.js'#" "$SRC/$1" > "$DEST/$1"; }
for c in "$@"; do
  case "$c" in
    base) cp "$SRC/tokens.css" "$SRC/base.css" "$DEST/" ;;
    a2ui) copy a2ui.js; cp "$SRC/a2ui.css" "$SRC/tokens.css" "$SRC/base.css" "$DEST/"; copy icons.js; cp "$SRC/LICENSE.lucide" "$DEST/" ;;
    confirm) copy confirm.js ;;
    icons) copy icons.js; cp "$SRC/LICENSE.lucide" "$DEST/" ;;
    *) echo "unknown component: $c"; exit 1 ;;
  esac
done
cp "$SRC/KIT.md" "$SRC/UI.md" "$DEST/"
printf '\n> Vendored from auril.js kit %s on %s: %s.\n' "$STAMP" "$(date +%F)" "$*" >> "$DEST/KIT.md"
echo "vendored kit $STAMP ($*) -> $DEST"
