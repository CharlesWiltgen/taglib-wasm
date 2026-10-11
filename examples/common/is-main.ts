/**
 * Portable entry-point check for the examples.
 *
 * `import.meta.main` is a Node >= 24.2, Deno and Bun feature; on the declared
 * Node floor (engines.node >= 24.0.0) it is undefined, and an example guarded
 * with it exits silently having printed nothing. Use this helper instead: it
 * prefers the native flag wherever it exists and otherwise compares the module
 * URL with argv[1] (what Node's own implementation does).
 */

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The fallback half, split out so its branches are testable directly. */
export function argvIsMainEntry(
  moduleUrl: string,
  argv1: string | undefined,
): boolean {
  return argv1 !== undefined && fileURLToPath(moduleUrl) === resolve(argv1);
}

export function isMainModule(meta: { url: string; main?: boolean }): boolean {
  if (typeof meta.main === "boolean") return meta.main;
  return argvIsMainEntry(meta.url, process.argv[1]);
}
