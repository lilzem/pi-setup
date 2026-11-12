#!/usr/bin/env bash
set -uo pipefail

SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/readme-coverage.sh"
failures=0

make_fixture() {
  local root
  root="$(mktemp -d)"
  mkdir -p "$root/home/.pi/agent/extensions/known-ext" "$root/home/.pi/agent/extensions/new-ext/node_modules" \
    "$root/home/.pi/agent/agents" "$root/home/.pi/agent/prompts"
  touch "$root/home/.pi/agent/extensions/single.ts" "$root/home/.pi/agent/extensions/single.test.ts"
  touch "$root/home/.pi/agent/agents/scout.md" "$root/home/.pi/agent/prompts/digest.md"
  printf '{"packages": ["npm:pi-lens", {"source": "npm:@scope/pkg"}]}\n' > "$root/home/.pi/agent/settings.json"
  printf '%s\n' "$root"
}

expect() {
  local name="$1" want_status="$2" want_out="$3" root="$4"
  local out status
  out="$("$SCRIPT" "$root" 2>&1)"
  status=$?
  if [ "$status" != "$want_status" ] || [ "$out" != "$want_out" ]; then
    printf 'FAIL %s\n  status: want %s got %s\n  output: want [%s]\n          got  [%s]\n' \
      "$name" "$want_status" "$status" "$want_out" "$out"
    failures=$((failures + 1))
  else
    printf 'ok   %s\n' "$name"
  fi
}

root="$(make_fixture)"
printf 'known-ext single scout digest pi-lens @scope/pkg new-ext\n' > "$root/README.md"
expect "everything documented passes silently" 0 "" "$root"

root="$(make_fixture)"
printf 'known-ext single scout pi-lens\n' > "$root/README.md"
expect "undocumented items are listed and fail" 1 "README.md does not mention:
  extension new-ext
  prompt digest
  package @scope/pkg" "$root"

root="$(make_fixture)"
printf 'known-extension single scout digest pi-lens @scope/pkg new-ext\n' > "$root/README.md"
expect "partial word does not count as a mention" 1 "README.md does not mention:
  extension known-ext" "$root"

root="$(make_fixture)"
printf 'known-ext single scout pi-lens @scope/pkg\n' > "$root/README.md"
printf 'prompt digest\nextension new-ext\n' > "$root/readme-coverage.ignore"
expect "items in readme-coverage.ignore are not required" 0 "" "$root"

exit $((failures > 0))
