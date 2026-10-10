#!/usr/bin/env node

/**
 * Verify the artifact that was actually PUBLISHED.
 *
 * Every other guard in this repo reads the working tree: the dist-resolution
 * walker, the disc-folder purity guard and the unit suite all run against files
 * this checkout produced. None of them answers "does `npm install taglib-wasm`
 * give a working library", which is the only question a consumer asks. The
 * JSR-era `verify-jsr` job did instantiate both wasm backends from the
 * published package; it died with that channel, and the npm leg's replacement
 * was an HTTP 200 on the version URL — proof the version exists, not that it
 * works.
 *
 * This installs the version from the registry into a temp directory and runs
 * scripts/verify-published-probe.mjs FROM THAT DIRECTORY, so every import in it
 * is bare and resolves through the installed package's `exports` map — the
 * public contract, not a file path. The probe reads a real fixture and asserts
 * real values on both wasm backends. A stale committed binary, a wrapper the
 * tarball does not match, a broken `exports` target, or a consumer-facing API
 * break fails here and nowhere else.
 *
 * scripts/verify-published-probe-deno.ts then does the same under Deno, which
 * reaches code Node never does (Deno's own filesystem provider) and resolves
 * the shipped Wasm from the emitted layout — a path an installed package could
 * not satisfy for `prepareWasmForEmbedding()` until the entry barrels moved, a
 * break no Node-side check could see. Deno is required rather than skipped:
 * a skipped leg cannot fail.
 *
 * Usage:
 *   node scripts/verify-published.mjs            # version from package.json
 *   node scripts/verify-published.mjs 2.3.1      # an explicit version
 *   node scripts/verify-published.mjs publish-dir   # a local artifact (dir or .tgz)
 *
 * The local form runs BEFORE a publish: it packs the staging directory (or
 * takes a tarball) and installs that, so the artifact is exercised while a
 * failure is still cheap — an npm version cannot be unpublished after 24h.
 *
 * Exit codes: 0 verified · 1 verification failed · 2 usage/environment.
 */

import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = new URL("..", import.meta.url);
const repoPkg = JSON.parse(
  readFileSync(new URL("package.json", repoRoot), "utf8"),
);
const arg = process.argv[2];
// A path argument selects LOCAL mode — the artifact about to be published (a
// staging directory or a .tgz), verified before the irreversible PUT, since an
// npm version cannot be unpublished after 24h. Anything else is a version to
// install from the registry. The path is resolved here because npm is invoked
// with the temp app as its working directory, where a relative staging path
// such as `publish-dir` would not exist.
const localArtifact =
  arg !== undefined && existsSync(arg) ? resolve(arg) : null;
const version = localArtifact ? repoPkg.version : (arg ?? repoPkg.version);

if (!localArtifact && !/^\d+\.\d+\.\d+/.test(version)) {
  console.error(`Not a version: ${version}`);
  process.exit(2);
}
const label = localArtifact
  ? `the local artifact ${localArtifact}`
  : `taglib-wasm@${version}`;

// The input must be a real file: the probe asserts values it reads from it, and
// a silently weaker fallback is the "gate that cannot fail" this repo hunts.
const FIXTURE = fileURLToPath(
  new URL("tests/test-files/mp3/kiss-snippet.mp3", repoRoot),
);
if (!existsSync(FIXTURE)) {
  console.error(`Fixture missing: ${FIXTURE}`);
  console.error("This script must run from a full checkout of the repository.");
  process.exit(2);
}
const EXPECT = JSON.stringify({ format: "MP3", title: "Kiss", codec: "MP3" });

const PROBE_SRC = fileURLToPath(
  new URL("verify-published-probe.mjs", import.meta.url),
);
const app = join(mkdtempSync(join(tmpdir(), "verify-published-")), "app");
mkdirSync(app, { recursive: true });
writeFileSync(
  join(app, "package.json"),
  `{ "name": "verify-published", "private": true }\n`,
);
// Copied, not run in place: a bare specifier resolves relative to the importing
// FILE, so the probe has to live inside the app that installed the package.
copyFileSync(PROBE_SRC, join(app, "probe.mjs"));

// Retry the registry install: `npm install pkg@ver` resolves through the
// packument, which is CDN-cached and can serve a pre-publish document for
// minutes after a publish (measured on 2.2.3 — the reason this workflow's own
// npm check polls the immutable version endpoint instead). Without a budget, a
// lagging packument would fail a release that is perfectly fine.
const MAX_ATTEMPTS = 10;
const RETRY_WAIT_S = 10;
console.log(`Installing ${label}...`);
if (localArtifact) {
  // A directory is packed here (applying its own `files`), so what gets
  // installed is a tarball — the same shape a consumer downloads, not a
  // symlinked directory that hides a packaging mistake.
  let tarball = localArtifact;
  if (statSync(localArtifact).isDirectory()) {
    const packed = execFileSync(
      "npm",
      ["pack", "--json", "--pack-destination", app, localArtifact],
      { cwd: app, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
    );
    tarball = join(app, JSON.parse(packed)[0].filename);
    console.log(`  packed ${localArtifact} -> ${tarball}`);
  }
  execFileSync(
    "npm",
    [
      "install",
      tarball,
      "--no-save",
      "--no-audit",
      "--no-fund",
      "--loglevel=error",
    ],
    { cwd: app, stdio: ["ignore", "ignore", "inherit"] },
  );
} else {
  for (let attempt = 1; ; attempt++) {
    try {
      execFileSync(
        "npm",
        [
          "install",
          `taglib-wasm@${version}`,
          "--no-save",
          "--no-audit",
          "--no-fund",
          "--loglevel=error",
        ],
        { cwd: app, stdio: ["ignore", "ignore", "inherit"] },
      );
      break;
    } catch (error) {
      if (attempt >= MAX_ATTEMPTS) {
        console.error(
          `\n✗ npm could not install taglib-wasm@${version} after ${MAX_ATTEMPTS} attempts.`,
        );
        console.error(
          "  If the version is definitely on the registry, this is most likely the CDN",
        );
        console.error(
          "  packument lagging a fresh publish — re-run the workflow rather than changing code.",
        );
        console.error(`  (${error.message})`);
        process.exit(1);
      }
      console.log(
        `  attempt ${attempt} failed; retrying in ${RETRY_WAIT_S}s...`,
      );
      execFileSync("sleep", [String(RETRY_WAIT_S)]);
    }
  }
}

console.log(`Probing the installed package from ${app}:\n`);
try {
  execFileSync(process.execPath, ["probe.mjs"], {
    cwd: app,
    stdio: "inherit",
    env: { ...process.env, TAGLIB_FIXTURE: FIXTURE, TAGLIB_EXPECT: EXPECT },
  });
} catch {
  console.error(`\n✗ ${label} FAILED verification under Node.`);
  console.error(`  (installed at ${join(app, "node_modules", "taglib-wasm")})`);
  process.exit(1);
}

console.log(
  `\n✅ ${label} verifies under Node: both wasm backends read real tags through the published exports`,
);

// The Deno leg. Deno reaches code Node never does (its own WASI filesystem
// provider) and resolves the shipped Wasm from the emitted layout — where
// `prepareWasmForEmbedding()` stopped working for an installed package once the
// entry barrels moved, a break invisible to every Node-side check. Deno is
// REQUIRED rather than skipped, because a skipped leg cannot fail.
const DENO_MAJOR = "2";
const DENO_PROBE_SRC = fileURLToPath(
  new URL("verify-published-probe-deno.ts", import.meta.url),
);
let denoVersion;
try {
  denoVersion = execFileSync("deno", ["--version"], { encoding: "utf8" }).split(
    "\n",
  )[0];
} catch {
  console.error(
    `\n✗ Deno (v${DENO_MAJOR}) is required for the Deno leg and was not found.`,
  );
  console.error(
    "  Install: https://deno.land/ — CI installs the pinned version.",
  );
  process.exit(2);
}
if (!denoVersion.startsWith(`deno ${DENO_MAJOR}.`)) {
  console.error(`\n✗ Expected Deno v${DENO_MAJOR}.x, found: ${denoVersion}`);
  process.exit(2);
}

copyFileSync(DENO_PROBE_SRC, join(app, "probe-deno.ts"));
console.log(`\nProbing under ${denoVersion}:\n`);
try {
  execFileSync(
    "deno",
    ["run", "--allow-read", "--allow-write", "--allow-env", "probe-deno.ts"],
    {
      cwd: app,
      stdio: "inherit",
      env: { ...process.env, TAGLIB_FIXTURE: FIXTURE, TAGLIB_EXPECT: EXPECT },
    },
  );
} catch {
  console.error(`\n✗ ${label} FAILED verification under Deno.`);
  console.error(`  (installed at ${join(app, "node_modules", "taglib-wasm")})`);
  process.exit(1);
}

console.log(
  `\n✅ ${label} verifies under Deno: path-mode reads and the Wasm resolver work from the installed package`,
);
