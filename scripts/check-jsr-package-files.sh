#!/bin/bash
# Guards the JSR distribution's file set. What ships is decided by jsr.json's
# publish.exclude plus .gitignore, and nothing else asserted the result: the
# 2.3.0 JSR package shipped .claude/**, repo dotfiles and src/**.test.ts
# (measured on the published @jsr/charlesw__taglib-wasm tarball), and the older
# taglib-asy / taglib-qrp incident shipped ~88 stray C++/CMake files to a
# registry. This dry-runs the publish and pins the exact file set: every path
# must match an expected shape, and every file the package needs at runtime
# must be present. A new file in the published set is a deliberate edit here
# (and in jsr.json), or it fails.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd "$ROOT"

# Same flags as the publish workflow's `deno publish`. --allow-dirty because
# this also runs in the publish job, where staged build artifacts make the tree
# dirty; the assertions below are what make the check meaningful, not the
# cleanliness of the tree.
DRYRUN="$(deno publish --dry-run --allow-dirty --allow-slow-types 2>&1 || true)"
if printf '%s\n' "$DRYRUN" | grep -Eq '^(error|[A-Z]+[0-9]+ \[ERROR\])'; then
  echo "::error::deno publish --dry-run failed:"
  printf '%s\n' "$DRYRUN" | grep -E '^(error|[A-Z]+[0-9]+ \[ERROR\])' | head -5
  exit 1
fi

# The dry run lists each file as `   file://<abs> (size)`.
FILES="$(printf '%s\n' "$DRYRUN" | sed -n 's|^ *file://||p' | sed 's/ ([0-9.]*[KMG]*B)$//' | sed "s|^$ROOT/||" | LC_ALL=C sort)"

if [ -z "$FILES" ]; then
  echo "::error::deno publish --dry-run listed no files — the check is not running"
  exit 1
fi

# (a) Every published path must be an expected shape. src/** is free-form
# except tests; everything else is pinned.
STRAY="$(printf '%s\n' "$FILES" | while IFS= read -r f; do
  case "$f" in
    *.test.ts) echo "$f" ;;
    src/*) ;;
    jsr.json | README.md | LICENSE | NOTICE) ;;
    build/taglib-web.wasm | build/taglib-wasi.wasm | build/taglib-wrapper.js | build/taglib-wrapper.d.ts) ;;
    dist/taglib-wrapper.js) ;;
    *) echo "$f" ;;
  esac
done)"
if [ -n "$STRAY" ]; then
  echo "::error::JSR publish would ship unexpected files (fix jsr.json publish.exclude):"
  printf '%s\n' "$STRAY"
  exit 1
fi

# (b) The files the package needs at runtime must all be present. The two
# wrapper paths and the two wasm binaries are re-included after .gitignore
# (build/*.js, build/*.wasm) by the !-globs at the top of publish.exclude;
# dropping one silently breaks the published package instead of the publish.
MISSING=""
for f in \
  src/index.ts src/simple.ts src/folder.ts src/disc-folder.ts src/web.ts src/rating.ts \
  build/taglib-web.wasm build/taglib-wasi.wasm build/taglib-wrapper.js build/taglib-wrapper.d.ts \
  README.md LICENSE NOTICE; do
  printf '%s\n' "$FILES" | grep -qxF "$f" || MISSING="$MISSING $f"
done
# dist/taglib-wrapper.js is a build output (gitignored): a bare checkout has no
# dist/, while the publish job stages one via its build artifact. The rule is
# that it ships when the tree has it — running this guard on a clean tree must
# not demand a file the checkout cannot have.
if [ -f dist/taglib-wrapper.js ] &&
  ! printf '%s\n' "$FILES" | grep -qxF "dist/taglib-wrapper.js"; then
  MISSING="$MISSING dist/taglib-wrapper.js"
fi
if [ -n "$MISSING" ]; then
  echo "::error::JSR publish would omit required files:${MISSING}"
  exit 1
fi

# (c) The manifest version must match package.json. `deno publish` takes the
# version from jsr.json, so a divergence would publish a JSR version that npm
# does not have (or skip one it does).
PKG_VERSION="$(node -p 'require("./package.json").version' 2>/dev/null || true)"
JSR_VERSION="$(node -p 'require("./jsr.json").version' 2>/dev/null || true)"
if [ "$PKG_VERSION" != "$JSR_VERSION" ]; then
  echo "::error::jsr.json version (${JSR_VERSION:-missing}) != package.json version (${PKG_VERSION:-missing})"
  exit 1
fi

echo "✅ JSR publish ships $(printf '%s\n' "$FILES" | wc -l | tr -d ' ') files: src/** plus the runtime assets"
