/**
 * File writing utilities for taglib-wasm
 * Provides cross-runtime support for writing files
 */

import { EnvironmentError, FileOperationError } from "../errors.ts";

/**
 * Write data to a file across different runtimes.
 * Supports Node.js, Deno, and Bun environments.
 *
 * @param path - File path to write to
 * @param data - Data to write (Uint8Array)
 * @throws {FileOperationError} If file write fails
 * @throws {EnvironmentError} If environment doesn't support file writing
 */
export async function writeFileData(
  path: string,
  data: Uint8Array,
): Promise<void> {
  try {
    // Deno
    if (typeof Deno !== "undefined") {
      await Deno.writeFile(path, data);
      return;
    }

    // Node.js
    if (
      typeof process !== "undefined" && process.versions &&
      process.versions.node
    ) {
      const { writeFile } = await import("fs/promises");
      await writeFile(path, data);
      return;
    }

    // Bun
    if (typeof (globalThis as any).Bun !== "undefined") {
      await (globalThis as any).Bun.write(path, data);
      return;
    }
  } catch (error) {
    // Convert system file errors to FileOperationError
    throw new FileOperationError(
      "write",
      (error as Error).message,
      path
    );
  }

  const env = typeof Deno !== "undefined" ? "Deno" :
              typeof process !== "undefined" ? "Node.js" :
              typeof (globalThis as any).Bun !== "undefined" ? "Bun" :
              "Browser";
  throw new EnvironmentError(
    env,
    "does not support file path writing",
    "filesystem access"
  );
}