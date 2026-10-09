import { expect } from "vite-plus/test";

/**
 * `@std/assert`'s `assertThrows(fn, ErrorClass, msgIncludes, msg)` asserts BOTH the
 * class and a message substring, and RETURNS the error. Vitest splits those:
 * `toThrow(Class)` checks only `instanceof`, `toThrow(string)` only the message, and
 * both return `void`. This preserves the original contract (~76 call sites).
 */
export function expectThrows<E extends Error>(
  fn: () => unknown,
  errorClass: new (...args: never[]) => E,
  messageIncludes?: string,
): E {
  let thrown: unknown;
  try {
    fn();
  } catch (error) {
    thrown = error;
  }
  if (!(thrown instanceof errorClass)) {
    throw new Error(`expected ${errorClass.name}, but got ${String(thrown)}`);
  }
  if (messageIncludes !== undefined) {
    expect(thrown.message).toContain(messageIncludes);
  }
  return thrown;
}

export async function expectRejects<E extends Error>(
  promise: Promise<unknown> | (() => Promise<unknown>),
  errorClass: new (...args: never[]) => E,
  messageIncludes?: string,
): Promise<E> {
  let thrown: unknown;
  try {
    await (typeof promise === "function" ? promise() : promise);
    thrown = undefined;
  } catch (error) {
    thrown = error;
  }
  if (!(thrown instanceof errorClass)) {
    throw new Error(`expected ${errorClass.name}, but got ${String(thrown)}`);
  }
  if (messageIncludes !== undefined) {
    expect(thrown.message).toContain(messageIncludes);
  }
  return thrown;
}
