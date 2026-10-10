/**
 * @fileoverview Minimal dependency-free assertions for the Deno-run test files.
 *
 * These tests run under `deno test` (npm run test:deno), not Vitest. The
 * retired `deno.json` import map is gone, so they must not use `jsr:` or `@std`
 * specifiers. These helpers cover the handful of assertion shapes the
 * Deno-only tests need.
 */

/** Throws unless `actual` and `expected` are the same value (`Object.is`). */
export function assertEquals<T>(
  actual: T,
  expected: T,
  message?: string,
): void {
  if (!Object.is(actual, expected)) {
    throw new Error(
      message ??
        `Values are not equal: expected ${String(expected)}, got ${String(
          actual,
        )}`,
    );
  }
}

/** Throws on null/undefined and narrows the type, like `@std/assert`'s. */
export function assertExists<T>(
  value: T,
  message?: string,
): asserts value is NonNullable<T> {
  if (value === null || value === undefined) {
    throw new Error(message ?? `Expected a value, got ${String(value)}`);
  }
}

/**
 * Awaits `fn`, requires it to reject, and returns the thrown `Error`.
 * Optionally requires its message to include `messageIncludes`.
 */
export async function assertRejects(
  fn: () => Promise<unknown>,
  messageIncludes?: string,
): Promise<Error> {
  let thrown: unknown;
  let didThrow = false;
  try {
    await fn();
  } catch (error) {
    thrown = error;
    didThrow = true;
  }
  if (!didThrow) {
    throw new Error("Expected the function to reject, but it resolved");
  }
  const error = thrown instanceof Error ? thrown : new Error(String(thrown));
  if (
    messageIncludes !== undefined &&
    !error.message.includes(messageIncludes)
  ) {
    throw new Error(
      `Rejection message ${JSON.stringify(error.message)} does not include ${JSON.stringify(
        messageIncludes,
      )}`,
    );
  }
  return error;
}
