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
# edit here too — that is the point.
EXPECTED="$(printf '%s\n' \
  '!dist/poc' '!src/**/*.test.ts' 'AGENTS.md' 'LICENSE' 'README.md' 'dist/**/*' \
  'disc-folder.ts' 'folder.ts' 'index.browser.ts' 'index.ts' 'rating.ts' \
  'simple.browser.ts' 'simple.ts' 'src/**/*.ts' 'web.browser.ts' 'web.ts' | LC_ALL=C sort)"
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

echo "✅ package.json files allowlist and npm tarball contents verified"
