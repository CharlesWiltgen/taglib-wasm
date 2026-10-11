/**
 * @fileoverview Detect if running inside a Deno compiled binary
 *
 * Shared by module-loader.ts and deno-compile.ts to avoid duplication.
 * Intentionally zero-dependency to prevent circular imports.
 */

/**
 * Whether the process is a Deno compiled binary.
 *
 * `Deno.build.standalone` is the runtime's own statement — true inside a
 * compiled binary, false under `deno run` (measured on 2.9.6) — so it wins
 * whenever it is exposed. A path that merely contains a `deno-compile-`
 * directory must not count; the main-module forms below are only the fallback
 * for runtimes (or test doubles) without the flag: Deno through 2.8 marks a
 * compiled binary with the `deno-compile://` scheme, and Deno 2.9+ reports a
 * `file://` URL under a `deno-compile-<name>` temporary directory.
 */
export function isDenoCompiled(): boolean {
  if (typeof Deno === "undefined") return false;

  const build = (Deno as { build?: { standalone?: unknown } }).build;
  if (typeof build?.standalone === "boolean") return build.standalone;

  return (
    typeof Deno.mainModule === "string" &&
    (Deno.mainModule.includes("deno-compile://") ||
      Deno.mainModule.includes("/deno-compile-"))
  );
}
