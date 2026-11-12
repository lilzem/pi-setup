#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DST="$REPO_DIR/home"

MANIFEST=(
  "AGENTS.md"
  ".pi/agent/settings.json"
  ".pi/agent/agents"
  ".pi/agent/extensions"
  ".pi/agent/prompts"
)

say() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }

say "Syncing live \$HOME configuration into the repo"
for rel in "${MANIFEST[@]}"; do
  from="$HOME/$rel"
  to="$DST/$rel"
  if [ ! -e "$from" ]; then
    echo "   skip (not present in \$HOME): $rel"
    continue
  fi
  mkdir -p "$(dirname "$to")"
  rm -rf "$to"
  cp -R "$from" "$to"
  echo "   synced $rel"
done

while IFS= read -r junk; do
  [ -n "$junk" ] && rm -rf "$junk"
done < <(find "$DST" -name node_modules -type d -prune)

while IFS= read -r junk; do
  [ -n "$junk" ] && rm -f "$junk"
done < <(find "$REPO_DIR" -name '.DS_Store')

say "README coverage"
if "$REPO_DIR/tools/readme-coverage.sh"; then
  echo "   README covers everything synced"
else
  echo "   update README.md before committing"
fi

say "git status"
git -C "$REPO_DIR" status --short || true

cat <<'EOF'

Review the changes above, then publish:
  git add -A && git commit -m "sync: update pi setup" && git push
EOF
