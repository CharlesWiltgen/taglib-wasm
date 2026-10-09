import { describe, it } from "vite-plus/test";
import { expectThrows } from "./_assert-helpers.ts";

describe("expectThrows", () => {
  it("returns the error when class and message both match", () => {
    const err = expectThrows(
      () => {
        throw new TypeError("boom: actual message");
      },
      TypeError,
      "actual message",
    );
    if (!(err instanceof TypeError)) throw new Error("not returned");
  });

  it("fails when the message does not match — the gap toThrow(Class) leaves", () => {
    let threw = false;
    try {
      expectThrows(
        () => {
          throw new TypeError("boom: actual message");
        },
        TypeError,
        "expected message",
      );
    } catch {
      threw = true;
    }
    if (!threw) throw new Error("helper accepted a mismatched message");
  });

  it("fails when the class does not match", () => {
    let threw = false;
    try {
      expectThrows(() => {
        throw new RangeError("x");
      }, TypeError);
    } catch {
      threw = true;
    }
    if (!threw) throw new Error("helper accepted a mismatched class");
  });
});
