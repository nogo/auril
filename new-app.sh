#!/usr/bin/env sh
# Start a new app from the starter: the shell, the kernel and the kit's base,
# confirm and icons, ready to serve from <dest>/web.
# Usage: ./new-app.sh <dest> "<App Name>"
set -e
DEST="$1"
NAME="$2"
[ -n "$DEST" ] && [ -n "$NAME" ] || { echo "usage: $0 <dest> \"<App Name>\""; exit 1; }
[ -e "$DEST/web" ] && { echo "$DEST/web exists; the starter only makes new apps"; exit 1; }
SRC="$(dirname "$0")"
KEY="$(printf '%s' "$NAME" | tr 'A-Z' 'a-z' | tr -cs 'a-z0-9' '-' | sed 's/^-//; s/-$//')"
mkdir -p "$DEST/web"
cp -R "$SRC"/starter/. "$DEST/web/"
# The name goes into markup and JS strings; keep it to letters, digits and spaces.
printf '%s' "$NAME" | grep -q '^[A-Za-z0-9 ]*$' || { echo "use letters, digits and spaces in the name"; exit 1; }
find "$DEST/web" -type f \( -name '*.js' -o -name '*.html' -o -name '*.webmanifest' \) \
  -exec sed -i "s/__APP_NAME__/$NAME/g; s/__APP_KEY__/$KEY/g" {} +
"$SRC"/vendor.sh "$DEST/web/auril" >/dev/null
"$SRC"/kit.sh "$DEST/web/kit" base confirm icons >/dev/null
echo "new app $NAME -> $DEST/web; serve that folder, and give it the server contract in web/kit/UI.md"
