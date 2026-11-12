#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
AGENT_DIR="$REPO_DIR/home/.pi/agent"
README="$REPO_DIR/README.md"

list_extensions() {
  [ -d "$AGENT_DIR/extensions" ] || return 0
  find "$AGENT_DIR/extensions" -mindepth 1 -maxdepth 1 \( -type d -o -name '*.ts' \) ! -name '*.test.ts' \
    -exec basename {} .ts \; | sort
}

list_markdown_stems() {
  [ -d "$1" ] || return 0
  find "$1" -mindepth 1 -maxdepth 1 -name '*.md' -exec basename {} .md \; | sort
}

list_packages() {
  [ -f "$AGENT_DIR/settings.json" ] || return 0
  python3 - "$AGENT_DIR/settings.json" <<'PY'
import json, sys
for entry in json.load(open(sys.argv[1])).get("packages", []):
    source = entry if isinstance(entry, str) else entry.get("source", "")
    print(source.split(":", 1)[-1])
PY
}

mentioned() {
  local escaped
  escaped="$(printf '%s' "$1" | sed 's/[][\.*^$+?(){}|/]/\\&/g')"
  grep -qE "(^|[^A-Za-z0-9_-])${escaped}([^A-Za-z0-9_-]|$)" "$README"
}

missing=()
check() {
  local kind="$1" name
  while IFS= read -r name; do
    if [ -n "$name" ] && ! mentioned "$name"; then missing+=("$kind $name"); fi
  done
}

check extension < <(list_extensions)
check agent < <(list_markdown_stems "$AGENT_DIR/agents")
check prompt < <(list_markdown_stems "$AGENT_DIR/prompts")
check package < <(list_packages)

[ "${#missing[@]}" -eq 0 ] && exit 0
echo "README.md does not mention:"
printf '  %s\n' "${missing[@]}"
exit 1
