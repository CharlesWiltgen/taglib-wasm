#!/usr/bin/env node

/**
 * Merge secondary runtime coverage into a primary lcov report.
 *
 * The primary report (Vitest) defines the measured scope: a secondary report
 * (Deno, Bun) contributes hits only for files/lines the primary already
 * records. Secondary lcov files also list every module their runtime loaded
 * with zero hits; feeding those records straight to SonarCloud expands
 * lines-to-cover from the measured set to the whole codebase (3,353 -> 9,009
 * lines in one observed run), turning previously unmeasured code into
 * new-code debt.
 *
 * Usage: node scripts/merge-lcov.mjs <primary> <secondary>... [-o <output>]
 * Writes to stdout unless -o is given.
 */

import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const outIndex = args.indexOf("-o");
const output = outIndex === -1 ? null : args[outIndex + 1];
if (outIndex !== -1) args.splice(outIndex, 2);

const [primaryPath, ...secondaryPaths] = args;
if (!primaryPath || secondaryPaths.length === 0) {
  console.error("usage: merge-lcov.mjs <primary> <secondary>... [-o <output>]");
  process.exit(2);
}

const root = process.cwd().replace(/\/+$/, "") + "/";

function relativeSf(path) {
  if (path.startsWith(`file://${root}`)) {
    return path.slice(`file://${root}`.length);
  }
  if (path.startsWith(root)) return path.slice(root.length);
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

// The primary report defines the scope; collect its DA lines and hit counts.
const primary = readBlocks(primaryPath);
const hits = new Map();
for (const block of primary) {
  for (const line of block.lines) {
    if (!line.startsWith("DA:")) continue;
    const [ln, count] = line.slice(3).split(",");
    hits.set(`${block.sf}:${ln}`, Number(count));
  }
}

// Secondary reports may only raise hits on lines the primary measures.
for (const path of secondaryPaths) {
  for (const block of readBlocks(path)) {
    for (const line of block.lines) {
      if (!line.startsWith("DA:")) continue;
      const [ln, count] = line.slice(3).split(",");
      const key = `${block.sf}:${ln}`;
      if (!hits.has(key)) continue;
      const merged = Math.max(hits.get(key), Number(count));
      hits.set(key, merged);
    }
  }
}

const out = [];
for (const block of primary) {
  const daLines = [];
  let lf = 0;
  let lh = 0;
  for (const line of block.lines) {
    if (!line.startsWith("DA:")) continue;
    const [ln] = line.slice(3).split(",");
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

const text = out.join("\n") + "\n";
if (output) writeFileSync(output, text);
else process.stdout.write(text);
