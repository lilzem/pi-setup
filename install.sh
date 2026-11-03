#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$REPO_DIR/home"

MANIFEST=(
  "AGENTS.md"
  ".pi/agent/settings.json"
  ".pi/agent/agents"
  ".pi/agent/extensions"
  ".pi/agent/prompts"
)

say() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
tilde() { printf '%s' "${1/#$HOME/~}"; }

backup_and_copy() {
  local rel="$1" from="$SRC/$1" to="$HOME/$1"
  [ -e "$from" ] || { echo "   skip (missing in repo): $rel"; return; }
  mkdir -p "$(dirname "$to")"
  if [ -e "$to" ]; then
    local bak="$to.bak.$(date +%Y%m%d%H%M%S)"
    cp -R "$to" "$bak"
    echo "   backup $(tilde "$to") -> $(tilde "$bak")"
  fi
  rm -rf "$to"
  cp -R "$from" "$to"
  echo "   install $rel"
}

say "Installing pi configuration into \$HOME"
for rel in "${MANIFEST[@]}"; do backup_and_copy "$rel"; done

say "Installing ub-mode toolchain (crapper / dryer / mutator)"
UB="$HOME/.ub-tools"
mkdir -p "$UB"
for t in crapper dryer mutator; do
  if [ -d "$UB/$t/.git" ]; then
    echo "   update $t"
    git -C "$UB/$t" pull --ff-only >/dev/null 2>&1 || echo "   (pull skipped for $t)"
  else
    echo "   clone $t"
    git clone --depth 1 "https://github.com/unclebob/$t" "$UB/$t" >/dev/null 2>&1
  fi
done

say "Writing tool wrappers to ~/.local/bin"
BIN="$HOME/.local/bin"
mkdir -p "$BIN"
for t in crapper dryer mutator; do
  printf '#!/bin/sh\nexec "$HOME/.ub-tools/%s/%s" "$@"\n' "$t" "$t" > "$BIN/$t"
  chmod +x "$BIN/$t"
  echo "   wrote ~/.local/bin/$t"
done

PATH_LINE='export PATH="$HOME/.local/bin:$PATH"'
for rc in "$HOME/.zshrc" "$HOME/.bashrc"; do
  [ -e "$rc" ] || continue
  if ! grep -qF "$PATH_LINE" "$rc"; then
    printf '\n%s\n' "$PATH_LINE" >> "$rc"
    echo "   added ~/.local/bin to PATH in $(tilde "$rc")"
  fi
done

if command -v python3 >/dev/null 2>&1; then
  say "Bootstrapping tool virtualenvs (first run compiles dependencies)"
  for t in crapper dryer mutator; do
    "$UB/$t/$t" --help >/dev/null 2>&1 && echo "   $t ready" || echo "   $t bootstrap deferred to first use"
  done
else
  echo "   python3 not found — venvs will build on first tool run"
fi

say "Done"
cat <<'EOF'

Next steps:
  1. Restart your shell (or: source ~/.zshrc) so ~/.local/bin is on PATH.
  2. Launch pi once; it restores the npm packages listed in settings.json,
     and loads the extensions in ~/.pi/agent/extensions.
  3. The ub-mode auto-gate is active: crapper/dryer run on edits and block
     git commits that exceed the complexity or duplication gates.

Previous files were backed up with a .bak.<timestamp> suffix.
EOF
