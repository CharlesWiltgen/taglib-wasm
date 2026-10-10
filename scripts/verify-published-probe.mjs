#!/usr/bin/env node

/**
 * Consumer-side probe for the published package.
 *
 * Driven by scripts/verify-published.mjs, which installs `taglib-wasm@<version>`
 * into a temp directory and runs this file FROM THAT DIRECTORY. Every specifier
 * below is therefore bare — it resolves through the installed package's
 * `exports` map, exactly as a consumer's import does. That is the point: a
 * missing or wrong `exports` target keeps a path-based check green while every
 * consumer's import breaks.
 *
 * Env:
 *   TAGLIB_FIXTURE  absolute path to an audio file to read (required)
 *   TAGLIB_EXPECT   JSON: { format, title, codec } (required)
 *
 * Exit: 0 all checks passed · 1 a check failed · 2 environment/usage.
 */

import { readFileSync } from "node:fs";

const fixture = process.env.TAGLIB_FIXTURE;
const expected = JSON.parse(process.env.TAGLIB_EXPECT ?? "{}");

if (!fixture || !expected.format) {
  console.error("TAGLIB_FIXTURE and TAGLIB_EXPECT must be set");
  process.exit(2);
}

let input;
try {
  input = readFileSync(fixture);
} catch (error) {
  console.error(`Cannot read the fixture ${fixture}: ${error.message}`);
  process.exit(2);
}

const failures = [];
const step = (name, ok, detail) => {
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(name);
};

// 1. The Simple API subpath.
try {
  const { readFormat, readTags } = await import("taglib-wasm/simple");
  const format = await readFormat(input);
  const tags = await readTags(input);
  step(
    'import "taglib-wasm/simple"',
    format === expected.format && tags.title?.[0] === expected.title,
    `readFormat -> ${format}, title -> ${JSON.stringify(tags.title?.[0])}`,
  );
} catch (error) {
  step('import "taglib-wasm/simple"', false, error.message);
}

// 2. The root entry, on BOTH wasm backends.
try {
  const { TagLib } = await import("taglib-wasm");
  for (const backend of ["wasi", "emscripten"]) {
    try {
      const taglib = await TagLib.initialize({ forceWasmType: backend });
      const file = await taglib.open(input);
      const props = file.audioProperties();
      const title = file.tag().title;
      file.dispose();
      step(
        `import "taglib-wasm" + forceWasmType: "${backend}"`,
        props?.codec === expected.codec && title === expected.title,
        `codec=${props?.codec} title=${JSON.stringify(title)}`,
      );
    } catch (error) {
      step(
        `import "taglib-wasm" + forceWasmType: "${backend}"`,
        false,
        error.message,
      );
    }
  }
} catch (error) {
  step('import "taglib-wasm"', false, error.message);
}

// 3. The Wasm-free subpath — the one entry whose graph must never load TagLib.
try {
  const { discFolderInfo } = await import("taglib-wasm/disc-folder");
  step('import "taglib-wasm/disc-folder"', discFolderInfo("CD1")?.number === 1);
} catch (error) {
  step('import "taglib-wasm/disc-folder"', false, error.message);
}

if (failures.length > 0) {
  console.error(
    `\n✗ ${failures.length} check(s) failed: ${failures.join(", ")}`,
  );
  process.exit(1);
}
process.exit(0);
