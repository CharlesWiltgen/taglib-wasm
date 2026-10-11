/**
 * @fileoverview Detect if running inside a Deno compiled binary
 *
 * Shared by module-loader.ts and deno-compile.ts to avoid duplication.
 * Intentionally zero-dependency to prevent circular imports.
 */

/**
 * Whether the main module identifies a compiled binary.
 *
 * Two shapes exist: Deno through 2.8 marks one with the `deno-compile://`
 * scheme, and Deno 2.9+ reports a `file://` URL under a `deno-compile-<name>`
 * temporary directory (measured on 2.9.6: `file:///var/folders/…/T/deno-compile-probe/probe.ts`).
 */
export function isDenoCompiled(): boolean {
  return (
    typeof Deno !== "undefined" &&
    typeof Deno.mainModule === "string" &&
    (Deno.mainModule.includes("deno-compile://") ||
      Deno.mainModule.includes("/deno-compile-"))
  );
}
