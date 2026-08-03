#!/usr/bin/env sh
# Vendor the auril.js kernel into an app.
# Usage: ./vendor.sh ../app/web/auril
set -e
DEST="$1"
[ -n "$DEST" ] || { echo "usage: $0 <dest-dir>"; exit 1; }
SRC="$(dirname "$0")"
STAMP="$(git -C "$SRC" describe --tags --always 2>/dev/null || echo dev)"
mkdir -p "$DEST"
cp -R "$SRC"/src/. "$DEST"/
cp "$SRC"/FRAMEWORK.md "$DEST"/
cp "$SRC"/LICENSE "$DEST"/   # MIT requires the notice to travel with copies
printf '\n> Vendored from auril.js %s on %s.\n' "$STAMP" "$(date +%F)" >> "$DEST/FRAMEWORK.md"
echo "vendored auril.js $STAMP -> $DEST"
