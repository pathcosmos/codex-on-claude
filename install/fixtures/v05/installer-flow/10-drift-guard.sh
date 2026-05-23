#!/usr/bin/env bash
# L3.10 — Drift guard: when manifest.json's version disagrees with
# package.json, installer must warn AND use package.json's version.
#
# Mutates the live manifest.json — backs up + restores in a trap.
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/helpers.sh"

setup_isolated_home
assert_isolated_home

MANIFEST="$REPO_ROOT/install/manifest.json"
BACKUP="$(mktemp -t coc-manifest-backup-XXXXXX)"

cleanup_all() {
  if [ -f "$BACKUP" ]; then
    cp "$BACKUP" "$MANIFEST"
    rm -f "$BACKUP"
  fi
  cleanup_home
}
trap cleanup_all EXIT

cp "$MANIFEST" "$BACKUP"

echo "▶ L3.10: drift guard (manifest=0.4.9, package=0.5.3)"

# Patch the manifest version to 0.4.9. Use jq for a clean rewrite.
jq '.version = "0.4.9"' "$MANIFEST" > "$MANIFEST.tmp" && mv "$MANIFEST.tmp" "$MANIFEST"

# Run installer with the drift. Capture combined output.
out="$(coc \
  --usage-mode=synergy \
  --patterns=review --context-policy=mixed --improvement-loop=manual --threads=basic \
  --subscription-claude=max --subscription-codex=pro \
  --yes 2>&1)" || { echo "$out"; echo "✗ installer exited non-zero" >&2; exit 1; }

# Drift warning must mention both versions.
assert_contains "$out" "manifest.json version (0.4.9)" "drift warning cites manifest version"
assert_contains "$out" "package.json version (0.5.3)" "drift warning cites package version"
assert_contains "$out" "Using package.json" "drift warning states resolution path"

# State file must record the package.json version (0.5.3), not 0.4.9.
config="$HOME/.claude/codex-on-claude/config.json"
version="$(json_get "$config" '.version')"
assert_eq "0.5.3" "$version" "config.json.version uses package.json (0.5.3), not stale manifest"

echo "✓ L3.10 PASS"
