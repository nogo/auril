#!/usr/bin/env bash
# Scan every app that vendors auril.js and print, per app, the vendored
# version and how often it uses each kernel API or works around one.
# Usage: scan-apps.sh [projects-dir]   (default ~/Development/projects)
# Read-only. Counts exclude the vendored kernel itself and node_modules.
set -u
ROOT="${1:-$HOME/Development/projects}"
HEAD=$(git -C "$(dirname "$0")/../../../.." rev-parse --short HEAD 2>/dev/null || echo '?')
echo "kernel HEAD: $HEAD"

# name|regex — add a row when a new pattern is worth tracking
PATTERNS='els|extends AurilElement
update-override|^\s*update\(\)\s*\{
nest-guard|instanceof AurilElement
beforeNodeMorphed|beforeNodeMorphed
morph-direct|[^.a-zA-Z]morph\(
watch|this\.watch\(
delegate|this\.delegate\(
store-subscribe|\.subscribe\(
persist|persist:
raw-localStorage|localStorage\.(get|set)Item
route|\.route\(
vt-off|viewTransitions: false
nav-listener|navigation\.addEventListener
websocket|new WebSocket
fetch|fetch\(
focus|\.focus\(
defer|queueMicrotask|requestAnimationFrame
setTimeout|setTimeout
dialog|showModal|<dialog
popover|popover
commandfor|commandfor'

count() { grep -rEc --include='*.js' --include='*.html' --exclude-dir=auril --exclude-dir=node_modules --exclude-dir=spikes "$2" "$1" 2>/dev/null | awk -F: '{s+=$2} END{print s+0}'; }

grep -rl --include=FRAMEWORK.md 'Vendored from auril' "$ROOT" 2>/dev/null | grep -v node_modules | sort | while read -r fw; do
  app=$(dirname "$(dirname "$fw")")
  ver=$(grep -o 'auril.js [0-9a-f]*' "$fw" | tail -1 | cut -d' ' -f2)
  line="${app#"$ROOT"/} @$ver"
  while IFS='|' read -r name re; do line+=" $name=$(count "$app" "$re")"; done <<< "$PATTERNS"
  echo "$line"
done
