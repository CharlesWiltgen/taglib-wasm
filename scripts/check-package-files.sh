#!/bin/bash
# Guards the npm distribution against the class of bug that shipped ~88 stray
# C++/CMake files to JSR (taglib-asy / taglib-qrp). `npm pack` alone cannot
# reproduce the old guard, because package.json `files` is an allowlist: npm
# silently drops anything unmatched, so a content-only assertion passes whether
# or not a stray subtree exists. This checks the ALLOWLIST, then the tarball.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# (a) The top-level entry set of package.json `files` is pinned. A new
# top-level entry (a vendored subtree, a stray build dir) must be a deliberate
# edit here too — that is the point. Keep it equal to what the Publish
# workflow's "Prepare publish directory" steps copy: `dist/` plus
# package.json, README.md, LICENSE and NOTICE. A `files` entry that the workflow
# does not stage ships in `npm pack` but never in the published package, which makes
# every local tarball test a test of the wrong artifact.
EXPECTED="$(printf '%s\n' \
  'LICENSE' 'NOTICE' 'README.md' 'dist/**/*' 'legal/COPYING.LGPL' | LC_ALL=C sort)"
ACTUAL="$(node -e 'process.stdout.write(require("./package.json").files.slice().sort().join("\n"))')"
if [ "$EXPECTED" != "$ACTUAL" ]; then
  echo "::error::package.json \"files\" allowlist changed — update scripts/check-package-files.sh if intentional:"
  diff <(printf '%s\n' "$EXPECTED") <(printf '%s\n' "$ACTUAL") || true
  exit 1
fi

# (b) The packed tarball ships no C++/CMake outside src/capi/, and no
# taglib/ or bindings/ paths at all.
PACK="$(npm pack --dry-run --json 2>/dev/null)"
STRAY="$(printf '%s' "$PACK" | node -e '
  let s = "";
  process.stdin.on("data", (d) => (s += d)).on("end", () => {
    const files = JSON.parse(s)[0].files.map((f) => f.path);
    const bad = files.filter((p) =>
      ((/(\.cpp|\.cmake(\.in)?|CMakeLists\.txt)$/.test(p) && !p.startsWith("src/capi/")) ||
        p.startsWith("taglib/") || p.startsWith("bindings/")));
    process.stdout.write(bad.join("\n"));
  });
')"
if [ -n "$STRAY" ]; then
  echo "::error::npm tarball ships stray C++/CMake files:"
  printf '%s\n' "$STRAY"
  exit 1
fi

# (c) The packed set is exactly what the publish workflow stages: everything
# under dist/ plus package.json, README.md, LICENSE and NOTICE. This is the half (a)
# cannot see: (a) pins the allowlist text, this pins the resulting file set, so
# an entry that makes `npm pack` ship files the workflow never copies fails
# here instead of shipping a tarball nobody tested.
OUTSIDE="$(printf '%s' "$PACK" | node -e '
  let s = "";
  process.stdin.on("data", (d) => (s += d)).on("end", () => {
    const allowed = new Set([
      "package.json",
      "README.md",
      "LICENSE",
      "NOTICE",
      "legal/COPYING.LGPL",
    ]);
    const files = JSON.parse(s)[0].files.map((f) => f.path);
    process.stdout.write(
      files.filter((p) => !p.startsWith("dist/") && !allowed.has(p)).join("\n"),
    );
  });
')"
if [ -n "$OUTSIDE" ]; then
  echo "::error::npm tarball ships files the Publish workflow does not stage:"
  printf '%s\n' "$OUTSIDE"
  echo "Add them to the Prepare publish directory steps of publish-everywhere.yml too, or drop them from package.json files."
  exit 1
fi

# (d) The license-bearing files must be IN the pack. `files` entries are
# silently skipped when the path is missing, so the allowlist text pinned in (a)
# cannot tell a shipped NOTICE from a forgotten one — this is the positive half
# the JSR guard already carries.
REQUIRED_MISSING="$(printf '%s' "$PACK" | node -e '
  let s = "";
  process.stdin.on("data", (d) => (s += d)).on("end", () => {
    const required = [
      "package.json",
      "README.md",
      "LICENSE",
      "NOTICE",
      "legal/COPYING.LGPL",
    ];
    const files = new Set(JSON.parse(s)[0].files.map((f) => f.path));
    process.stdout.write(required.filter((f) => !files.has(f)).join("\n"));
  });
')"
if [ -n "$REQUIRED_MISSING" ]; then
  echo "::error::npm tarball is missing files every consumer must receive:"
  printf '%s\n' "$REQUIRED_MISSING"
  exit 1
fi

echo "✅ package.json files allowlist, tarball contents and shipped set verified"