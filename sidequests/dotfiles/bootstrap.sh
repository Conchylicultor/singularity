#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_DIR="$SCRIPT_DIR/home"

if [[ ! -d "$SRC_DIR" ]]; then
  echo "no home/ directory at $SRC_DIR" >&2
  exit 1
fi

stamp="$(date +%Y%m%d-%H%M%S)"

while IFS= read -r -d '' src; do
  rel="${src#$SRC_DIR/}"
  dst="$HOME/$rel"

  if [[ -e "$dst" ]] && cmp -s "$src" "$dst"; then
    echo "= $rel"
    continue
  fi

  mkdir -p "$(dirname "$dst")"

  if [[ -e "$dst" || -L "$dst" ]]; then
    backup="$dst.backup-$stamp"
    mv "$dst" "$backup"
    echo "~ $rel (backed up to ${backup#$HOME/})"
  fi

  cp "$src" "$dst"
  echo "+ $rel"
done < <(find "$SRC_DIR" -type f -print0)
