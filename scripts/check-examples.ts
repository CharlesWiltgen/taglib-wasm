#!/usr/bin/env -S pnpm exec tsx

/**
 * Examples gate (taglib-1zn1). `examples/` sits outside every other gate: the
 * build config includes only `src/`, `tsconfig.check.json` excludes
 * `examples/`, and no workflow names the directory — which is how four rotted
 * examples accumulated unseen (taglib-wo7z, taglib-dxnz, and the two more this
 * gate's first run found: `simple-api.ts` importing a one-level-short path and
 * printing `undefined` for constants removed with the go-taglib layer).
 *
 * Two tiers over the documented surface (`docs/guide/examples.md` links every
 * file by URL):
 *
 *   1. RESOLUTION — import every `examples/<dir>/*.ts`. The entry guards
 *      (`isMainModule`) make an import side-effect-free, so this catches the
 *      class that bit twice: an example importing an export that no longer
 *      exists, dead before its guard runs.
 *   2. RUN — execute `examples/common/*.ts` under tsx. Those are the
 *      "runtime-agnostic" examples the same doc promises run anywhere, and they
 *      are read-only on the repository. This catches the other class: an
 *      example that mutates the checked-out tree (taglib-dxnz) or dies mid-run.
 *
 * A `git status --porcelain` snapshot brackets both tiers and any *new* entry
 * fails the gate — that is what keeps tier 2 honest, and it also catches an
 * import-time write.
 *
 * Deliberately not here: the type-check half lives in
 * `tsconfig.examples.json` (wired into `check:all` next to this script), and
 * `examples/browser/*.ts` plus the Deno/Bun-global examples under `examples/`
 * are resolution-checked but never executed — they need a DOM or a Deno/Bun
 * runtime. `is-main.ts` is the shared helper, not an example.
 */

import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = process.cwd();

/** Every `.ts` under `dir`, recursively, as repo-relative paths. */
function walkTsFiles(dir: string): string[] {
  return readdirSync(join(repoRoot, dir), { withFileTypes: true }).flatMap(
    (entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return walkTsFiles(path);
      return entry.isFile() && entry.name.endsWith(".ts") ? [path] : [];
    },
  );
}

/**
 * The Node-loadable examples: `examples/common/` (imported and run) and
 * `examples/browser/` (imported only — it needs a DOM to do anything).
 *
 * Everything else under `examples/` resolves `jsr:`/`npm:` specifiers or uses
 * Deno/Bun globals at import time (`examples/deno*`, `examples/bun`,
 * `examples/*.ts`), so a Node import is not a defect signal there. Those files
 * stay outside this gate; a Deno-side leg is a separate decision, because
 * `deno check` resolves `jsr:` against the registry (network).
 */
function nodeLoadableExamples(): string[] {
  return [...walkTsFiles("examples/common"), ...walkTsFiles("examples/browser")]
    .filter((path) => !path.endsWith("is-main.ts"))
    .sort();
}

/** The runtime-agnostic set the docs promise runs anywhere. */
function commonExamples(): string[] {
  return readdirSync(join(repoRoot, "examples/common"), {
    withFileTypes: true,
  })
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith(".ts") &&
        entry.name !== "is-main.ts",
    )
    .map((entry) => join("examples/common", entry.name))
    .sort();
}

/** Untracked and modified paths, one `git status --porcelain` line each. */
function workingTreeState(): string[] {
  return execFileSync("git", ["status", "--porcelain"], {
    cwd: repoRoot,
    encoding: "utf8",
  })
    .split("\n")
    .filter((line) => line.trim() !== "");
}

const failures: string[] = [];
const treeBefore = workingTreeState();

// Tier 1: resolution. The specifier is only known at runtime — the set is
// whatever is on disk right now — so a static import cannot express this, and
// the point is that this file never executes the example's main path (its
// entry guard is what makes that safe).
const importTargets = nodeLoadableExamples();
for (const file of importTargets) {
  try {
    await import(pathToFileURL(join(repoRoot, file)).href);
  } catch (error) {
    failures.push(
      `import ${file}: ${error instanceof Error ? error.message : error}`,
    );
  }
}
console.log(`resolution: ${importTargets.length} example modules imported`);

// Tier 2: run the runtime-agnostic set.
const runTargets = commonExamples();
for (const file of runTargets) {
  try {
    execFileSync("pnpm", ["exec", "tsx", file], {
      cwd: repoRoot,
      stdio: "pipe",
      timeout: 120_000,
    });
  } catch (error) {
    const stderr = String((error as { stderr?: Buffer }).stderr ?? "").trim();
    const status = (error as { status?: number }).status ?? "signal";
    failures.push(
      `run ${file}: exit ${status}${
        stderr ? `\n${stderr.split("\n").slice(-8).join("\n")}` : ""
      }`,
    );
  }
}
console.log(`run: ${runTargets.length} examples executed under tsx`);

// The mutation guard: an example that writes into the checkout fails the gate.
const changed = workingTreeState().filter((line) => !treeBefore.includes(line));
if (changed.length > 0) {
  failures.push(
    `working tree changed while running examples:\n${changed.join("\n")}`,
  );
}

if (failures.length > 0) {
  console.error(`\n✗ examples gate failed (${failures.length}):\n`);
  for (const failure of failures) console.error(`  ${failure}\n`);
  process.exit(1);
}
console.log("✓ examples gate passed (resolution, run, working tree unchanged)");
