#!/usr/bin/env sh
# Vendor the auril.js kernel into an app.
# Usage: ./vendor.sh ../app/web/auril
set -e
DEST="$1"
[ -n "$DEST" ] || { echo "usage: $0 <dest-dir>"; exit 1; }
SRC="$(dirname "$0")"
mkdir -p "$DEST"
cp -R "$SRC"/src/. "$DEST"/
cp "$SRC"/FRAMEWORK.md "$DEST"/
echo "vendored auril.js $(git -C "$SRC" describe --tags --always 2>/dev/null || echo dev) -> $DEST"
