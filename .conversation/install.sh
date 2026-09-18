#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-$HOME/workspace}"
PATCH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="$TARGET/.genesis-backups/site-v1-$STAMP"

mkdir -p "$TARGET" "$BACKUP"
for item in package.json server.js public; do
  if [ -e "$TARGET/$item" ]; then
    cp -a "$TARGET/$item" "$BACKUP/"
  fi
done

cp -f "$PATCH_DIR/package.json" "$TARGET/package.json"
cp -f "$PATCH_DIR/server.js" "$TARGET/server.js"
rm -rf "$TARGET/public"
cp -a "$PATCH_DIR/public" "$TARGET/public"

printf '\nGENESIS Site v1 installed.\n'
printf 'Target: %s\n' "$TARGET"
printf 'Backup: %s\n' "$BACKUP"
printf 'No server restart was performed.\n'
printf 'When you are ready, restart your Replit process manually.\n'
