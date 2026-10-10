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
 * This installs the version from the registry into a temp directory and then
 * exercises the INSTALLED package the way a consumer would: the Simple API, the
 * Full API on both wasm backends with real tag values, and the Wasm-free
 * subpath. A stale committed binary, a wrapper the tarball does not match, an
 * unresolved relative import, or a consumer-facing API break all fail here and
 * nowhere else.
 *
 * Usage:
 *   node scripts/verify-published.mjs            # version from package.json
 *   node scripts/verify-published.mjs 2.3.1      # an explicit version
 *
 * Exit codes: 0 verified · 1 verification failed · 2 usage/environment.
 */

import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = new URL("..", import.meta.url);
const version =
  process.argv[2] ??
  JSON.parse(readFileSync(new URL("package.json", repoRoot), "utf8")).version;

if (!/^\d+\.\d+\.\d+/.test(version)) {
  console.error(`Not a version: ${version}`);
  process.exit(2);
}

// A real fixture beats a synthetic one: it carries actual tag values and audio
// properties, so "the wasm loaded" is checked by asserting what it READ, not
// just that it did not throw. The workflow checks the repo out; a caller
// without it still gets a structural check from the inline WAV below.
const FIXTURE = fileURLToPath(
  new URL("tests/test-files/mp3/kiss-snippet.mp3", repoRoot),
);
const EXPECTED = { format: "MP3", title: "Kiss", codec: "MP3" };

// Minimal, structurally valid 44-byte PCM WAV — no audio, so it only proves the
// backend instantiated and parsed a container.
const TEST_WAV = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45, 0x66,
  0x6d, 0x74, 0x20, 0x10, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x44, 0xac,
  0x00, 0x00, 0x88, 0x58, 0x01, 0x00, 0x02, 0x00, 0x10, 0x00, 0x64, 0x61, 0x74,
  0x61, 0x00, 0x00, 0x00, 0x00,
]);

const dir = mkdtempSync(join(tmpdir(), "verify-published-"));
mkdirSync(join(dir, "app"), { recursive: true });
writeFileSync(
  join(dir, "app", "package.json"),
  `{ "name": "verify-published", "private": true }\n`,
);

console.log(`Installing taglib-wasm@${version} from the registry...`);
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
    { cwd: join(dir, "app"), stdio: ["ignore", "ignore", "inherit"] },
  );
} catch (error) {
  console.error(
    `\n✗ npm could not install taglib-wasm@${version}: ${error.message}`,
  );
  process.exit(1);
}

const pkg = join(dir, "app", "node_modules", "taglib-wasm");
const input = existsSync(FIXTURE) ? readFileSync(FIXTURE) : TEST_WAV;
const real = existsSync(FIXTURE);
console.log(
  real
    ? `Fixture: ${FIXTURE}`
    : "Fixture: inline minimal WAV (repo fixture not found)",
);

const failures = [];
const step = (name, ok, detail) => {
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(name);
};

// 1. The Simple API: the shortest path a consumer takes.
try {
  const { readFormat, readTags } = await import(
    pathToFileURL(join(pkg, "dist", "simple.js")).href
  );
  const format = await readFormat(input);
  const tags = await readTags(input);
  const ok = real
    ? format === EXPECTED.format && tags.title?.[0] === EXPECTED.title
    : format === "WAV";
  step(
    "Simple API (dist/simple.js)",
    ok,
    `readFormat -> ${format}, title -> ${JSON.stringify(tags.title?.[0])}`,
  );
} catch (error) {
  step("Simple API (dist/simple.js)", false, error.message);
}

// 2. The Full API on BOTH wasm backends — the pair the JSR-era job checked.
try {
  const { TagLib } = await import(
    pathToFileURL(join(pkg, "dist", "index.js")).href
  );
  for (const backend of ["wasi", "emscripten"]) {
    try {
      const taglib = await TagLib.initialize({ forceWasmType: backend });
      const file = await taglib.open(input);
      const props = file.audioProperties();
      const title = file.tag().title;
      file.dispose();
      const ok = real
        ? props?.codec === EXPECTED.codec && title === EXPECTED.title
        : props != null;
      step(
        `Full API, forceWasmType: "${backend}"`,
        ok,
        `codec=${props?.codec} title=${JSON.stringify(title)}`,
      );
    } catch (error) {
      step(`Full API, forceWasmType: "${backend}"`, false, error.message);
    }
  }
} catch (error) {
  step("Full API (dist/index.js)", false, error.message);
}

// 3. The Wasm-free subpath — the one entry whose graph must never load TagLib.
try {
  const { discFolderInfo } = await import(
    pathToFileURL(join(pkg, "dist", "disc-folder.js")).href
  );
  step(
    "Wasm-free subpath (dist/disc-folder.js)",
    discFolderInfo("CD1")?.number === 1,
  );
} catch (error) {
  step("Wasm-free subpath (dist/disc-folder.js)", false, error.message);
}

if (failures.length > 0) {
  console.error(
    `\n✗ Published taglib-wasm@${version} FAILED verification: ${failures.join(", ")}`,
  );
  console.error(`  (installed at ${pkg})`);
  process.exit(1);
}
console.log(
  `\n✅ taglib-wasm@${version} verifies: both wasm backends read real tags from the registry copy`,
);
