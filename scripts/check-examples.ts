#!/usr/bin/env -S pnpm exec tsx

/**
 * Examples gate (taglib-1zn1). `examples/` sat outside every other gate: the
 * build config includes only `src/`, `tsconfig.check.json` excludes
 * `examples/`, and no workflow named the directory — which is how four rotted
 * examples accumulated unseen (taglib-wo7z, taglib-dxnz). What this gate found
 * when it first ran: importing `examples/browser/embind-example.ts` executed
 * `main()`, because its entry guard read "no window means run in Node". What
 * its sibling type gate (`tsconfig.examples.json`) found with it:
 * `simple-api.ts` printing `undefined` for constants that went with the
 * go-taglib layer. (The one-level-short import in the same file was a real
 * defect too, but an earlier commit's find, not this gate's.)
 *
 * Two tiers over the documented surface (`docs/guide/examples.md` links every
 * file by URL):
 *
 *   1. RESOLUTION — import every Node-loadable example. The entry guards
 *      (`isMainModule`, or `window` for the browser example) make an import
 *      side-effect-free, so a file that cannot even load fails here. Note the
 *      split: tsx elides an UNUSED import specifier, so a dead named import
 *      that the example never calls is caught by `tsc -p tsconfig.examples.json`,
 *      not here; a used one, or a bad path, fails this tier.
 *   2. RUN — execute the runtime-agnostic `examples/common/**` under tsx. Those
 *      are the examples the same doc promises run anywhere, and they are
 *      read-only on the repository. This catches an example that dies mid-run
 *      or mutates the checkout.
 *
 * A `git status --porcelain -uall` snapshot brackets both tiers and any NEW
 * entry fails the gate. Boundaries, deliberately: ignored paths (dist/,
 * node_modules/, junit.xml, *.log) are invisible to `git status`, so the guard
 * covers tracked files and untracked-and-visible ones only; and it is
 * repo-global, so a concurrent writer (a sibling agent session) during the run
 * shows up as a failure — the message names the paths, so that reads as itself.
 *
 * Deliberately not here: the type-check half is `tsconfig.examples.json` (wired
 * into `check:all` and the CI lint job next to this script), and
 * `examples/{deno,deno-compile,bun}/` plus the root scripts are excluded —
 * they resolve `jsr:`/`npm:` specifiers or use Deno/Bun globals at import time,
 * so a Node import is not a defect signal for them. A Deno-side leg would need
 * `deno check`, which resolves `jsr:` against the registry (network) — a
 * separate decision.
 */

import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = process.cwd();
/** Node's execFile does not resolve a bare `pnpm` to pnpm.cmd on Windows. */
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

/** The example files under `dir`, recursively, as repo-relative paths. */
function walkExamples(dir: string): string[] {
  return readdirSync(join(repoRoot, dir), { withFileTypes: true }).flatMap(
    (entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return walkExamples(path);
      // is-main.ts is the shared entry-guard helper, not an example.
      return entry.isFile() &&
        entry.name.endsWith(".ts") &&
        entry.name !== "is-main.ts"
        ? [path]
        : [];
    },
  );
}

/**
 * The Node-loadable examples: `examples/common/` (imported and run) and
 * `examples/browser/` (imported only — it needs a DOM to do anything). See the
 * fileoverview for what stays outside and why.
 */
function nodeLoadableExamples(): string[] {
  return [
    ...walkExamples("examples/common"),
    ...walkExamples("examples/browser"),
  ].sort();
}

/** Untracked and modified paths, one `git status --porcelain` line each. */
function workingTreeState(): string[] {
  return execFileSync("git", ["status", "--porcelain", "-uall"], {
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
// the point is that this file never executes an example's main path (its entry
// guard is what makes that safe).
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
const runTargets = walkExamples("examples/common").sort();
for (const file of runTargets) {
  try {
    execFileSync(pnpm, ["exec", "tsx", file], {
      cwd: repoRoot,
      stdio: "pipe",
      timeout: 120_000,
      // Output is suppressed on the happy path, so a passing example that logs
      // megabytes must not overflow the pipe and read as a failure.
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch (error) {
    // Examples log through console.log, so the useful tail may be on stdout.
    const stdout = String((error as { stdout?: Buffer }).stdout ?? "").trim();
    const stderr = String((error as { stderr?: Buffer }).stderr ?? "").trim();
    const detail = (stderr || stdout).split("\n").slice(-8).join("\n");
    const status = (error as { status?: number }).status ?? "signal";
    failures.push(`run ${file}: exit ${status}${detail ? `\n${detail}` : ""}`);
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
