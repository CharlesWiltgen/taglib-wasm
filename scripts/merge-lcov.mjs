#!/usr/bin/env node

/**
 * Merge secondary runtime coverage into a primary lcov report.
 *
 * The primary report (Vitest) defines the measured scope for files it contains:
 * a secondary report (Deno, Bun) may raise hits on those files/lines. A
 * secondary-only file is adopted only when every DA record it carries is
 * covered; a partially covered file would bring its zero-hit lines and expand
 * SonarCloud's lines-to-cover to modules the primary run never measured
 * (observed 3,353 -> 9,009 lines).
 *
 * Fails when no secondary hit matches the primary, so a path-normalization
 * break cannot silently publish pre-merge coverage.
 *
 * Usage: node scripts/merge-lcov.mjs <primary> <secondary>... [-o <output>]
 * Writes to stdout unless -o is given.
 */

import { readFileSync, realpathSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const outIndex = args.indexOf("-o");
const output = outIndex === -1 ? null : args[outIndex + 1];
if (outIndex !== -1) args.splice(outIndex, 2);

const [primaryPath, ...secondaryPaths] = args;
if (!primaryPath || secondaryPaths.length === 0) {
  console.error("usage: merge-lcov.mjs <primary> <secondary>... [-o <output>]");
  process.exit(2);
}

// Deno can emit realpath-resolved SF paths; match both the working directory
// and its canonical form so a symlinked checkout still normalizes.
const roots = new Set(
  [process.cwd(), realpathSync(process.cwd())].map(
    (root) => root.replace(/\/+$/, "") + "/",
  ),
);

function relativeSf(path) {
  for (const root of roots) {
    if (path.startsWith(`file://${root}`)) {
      return path.slice(`file://${root}`.length);
    }
    if (path.startsWith(root)) return path.slice(root.length);
  }
  return path;
}

function readBlocks(path) {
  const blocks = [];
  let block;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (line.startsWith("SF:")) {
      block = { sf: relativeSf(line.slice(3)), lines: [] };
      blocks.push(block);
    } else if (line === "end_of_record") {
      if (block) block.lines.push(line);
      block = undefined;
    } else if (block) {
      block.lines.push(line);
    }
  }
  return blocks;
}

function daEntries(block) {
  const entries = [];
  for (const line of block.lines) {
    if (!line.startsWith("DA:")) continue;
    const [ln, count] = line.slice(3).split(",");
    entries.push([Number(ln), Number(count)]);
  }
  return entries;
}

// The primary report defines the scope for the files it contains.
const primary = readBlocks(primaryPath);
const primaryFiles = new Set(primary.map((block) => block.sf));
const hits = new Map();
for (const block of primary) {
  for (const [ln, count] of daEntries(block)) {
    hits.set(`${block.sf}:${ln}`, count);
  }
}

// Secondary-only files are adopted only when fully covered.
const extra = new Map();
let matched = 0;
for (const path of secondaryPaths) {
  for (const block of readBlocks(path)) {
    if (!primaryFiles.has(block.sf)) {
      const file = extra.get(block.sf) ?? {
        lines: new Map(),
        fullyCovered: true,
      };
      for (const [ln, count] of daEntries(block)) {
        file.lines.set(ln, Math.max(file.lines.get(ln) ?? 0, count));
        if (count === 0) file.fullyCovered = false;
      }
      extra.set(block.sf, file);
      continue;
    }

    for (const [ln, count] of daEntries(block)) {
      const key = `${block.sf}:${ln}`;
      if (!hits.has(key)) continue;
      matched++;
      hits.set(key, Math.max(hits.get(key), count));
    }
  }
}

if (matched === 0) {
  console.error(
    "merge-lcov: no secondary coverage matched the primary report; check SF paths",
  );
  process.exit(1);
}

const out = [];
for (const block of primary) {
  const daLines = [];
  let lf = 0;
  let lh = 0;
  for (const [ln] of daEntries(block)) {
    const count = hits.get(`${block.sf}:${ln}`) ?? 0;
    daLines.push(`DA:${ln},${count}`);
    lf++;
    if (count > 0) lh++;
  }

  out.push(`SF:${block.sf}`);
  let da = 0;
  for (const line of block.lines) {
    if (line.startsWith("LF:")) out.push(`LF:${lf}`);
    else if (line.startsWith("LH:")) out.push(`LH:${lh}`);
    else if (line.startsWith("DA:")) out.push(daLines[da++]);
    else out.push(line);
  }
}

for (const [sf, file] of extra) {
  if (!file.fullyCovered) continue;
  const lines = [...file.lines].sort(([a], [b]) => a - b);
  out.push(`SF:${sf}`);
  for (const [ln, count] of lines) out.push(`DA:${ln},${count}`);
  out.push(`LF:${lines.length}`);
  out.push(`LH:${lines.filter(([, count]) => count > 0).length}`);
  out.push("end_of_record");
}

const text = out.join("\n") + "\n";
if (output) writeFileSync(output, text);
else process.stdout.write(text);
