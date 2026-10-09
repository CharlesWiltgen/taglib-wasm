/**
 * @fileoverview Tests for rating utilities and branded types
 */

import { describe, expect, it } from "vite-plus/test";
import { expectDefined } from "./_assert-helpers.ts";
import type { Rating } from "../src/constants/complex-properties.ts";
import {
  clamp,
  fromNormalized,
  fromPercent,
  fromPopm,
  fromStars,
  isValid,
  normalized,
  popm,
  RatingUtils,
  toNormalized,
  toPercent,
  toPopm,
  toStars,
} from "../src/utils/rating.ts";

describe("Rating Utilities", () => {
  it("toNormalized - converts POPM (0-255) to normalized (0.0-1.0)", () => {
    expect(toNormalized(popm(0))).toStrictEqual(0);
    expect(toNormalized(popm(255))).toStrictEqual(1);
    expect(toNormalized(popm(128))).toStrictEqual(128 / 255);
    expect(toNormalized(popm(64))).toStrictEqual(64 / 255);
  });

  it("fromNormalized - converts normalized to POPM with rounding", () => {
    expect(fromNormalized(normalized(0))).toStrictEqual(0);
    expect(fromNormalized(normalized(1))).toStrictEqual(255);
    expect(fromNormalized(normalized(0.5))).toStrictEqual(128); // Rounds 127.5 to 128
    expect(fromNormalized(normalized(0.25))).toStrictEqual(64); // Rounds 63.75 to 64
  });

  it("toStars - converts normalized to star rating", () => {
    // 5-star scale (default)
    expect(toStars(normalized(0))).toStrictEqual(0);
    expect(toStars(normalized(0.2))).toStrictEqual(1);
    expect(toStars(normalized(0.4))).toStrictEqual(2);
    expect(toStars(normalized(0.6))).toStrictEqual(3);
    expect(toStars(normalized(0.8))).toStrictEqual(4);
    expect(toStars(normalized(1.0))).toStrictEqual(5);

    // 10-star scale
    expect(toStars(normalized(0.5), 10)).toStrictEqual(5);
    expect(toStars(normalized(1.0), 10)).toStrictEqual(10);
  });

  it("fromStars - converts star rating to normalized", () => {
    // 5-star scale (default)
    expect(fromStars(0)).toStrictEqual(0);
    expect(fromStars(1)).toStrictEqual(0.2);
    expect(fromStars(2.5)).toStrictEqual(0.5);
    expect(fromStars(5)).toStrictEqual(1.0);

    // 10-star scale
    expect(fromStars(5, 10)).toStrictEqual(0.5);
    expect(fromStars(10, 10)).toStrictEqual(1.0);
  });

  it("toPopm - converts normalized to standard POPM values", () => {
    expect(toPopm(normalized(0))).toStrictEqual(0); // Unrated
    expect(toPopm(normalized(0.2))).toStrictEqual(1); // 1 star
    expect(toPopm(normalized(0.4))).toStrictEqual(64); // 2 stars
    expect(toPopm(normalized(0.6))).toStrictEqual(128); // 3 stars
    expect(toPopm(normalized(0.8))).toStrictEqual(196); // 4 stars
    expect(toPopm(normalized(1.0))).toStrictEqual(255); // 5 stars
  });

  it("fromPopm - converts POPM to normalized star levels", () => {
    expect(fromPopm(popm(0))).toStrictEqual(0); // Unrated
    expect(fromPopm(popm(1))).toStrictEqual(0.2); // 1 star
    expect(fromPopm(popm(64))).toStrictEqual(0.4); // 2 stars
    expect(fromPopm(popm(128))).toStrictEqual(0.6); // 3 stars
    expect(fromPopm(popm(196))).toStrictEqual(0.8); // 4 stars
    expect(fromPopm(popm(255))).toStrictEqual(1.0); // 5 stars

    // In-between values should map to lower star level
    expect(fromPopm(popm(50))).toStrictEqual(0.4); // Still 2 stars
    expect(fromPopm(popm(100))).toStrictEqual(0.6); // Still 3 stars
    expect(fromPopm(popm(200))).toStrictEqual(1.0); // 5 stars (>196)
  });

  it("toPercent - converts normalized to percentage", () => {
    expect(toPercent(normalized(0))).toStrictEqual(0);
    expect(toPercent(normalized(0.5))).toStrictEqual(50);
    expect(toPercent(normalized(1.0))).toStrictEqual(100);
    expect(toPercent(normalized(0.75))).toStrictEqual(75);
  });

  it("fromPercent - converts percentage to normalized", () => {
    expect(fromPercent(0)).toStrictEqual(0);
    expect(fromPercent(50)).toStrictEqual(0.5);
    expect(fromPercent(100)).toStrictEqual(1.0);
    expect(fromPercent(75)).toStrictEqual(0.75);
  });

  it("clamp - clamps values to 0.0-1.0 range", () => {
    expect(clamp(0.5)).toStrictEqual(0.5);
    expect(clamp(0)).toStrictEqual(0);
    expect(clamp(1)).toStrictEqual(1);
    expect(clamp(-0.5)).toStrictEqual(0);
    expect(clamp(1.5)).toStrictEqual(1);
    expect(clamp(-100)).toStrictEqual(0);
    expect(clamp(100)).toStrictEqual(1);
  });

  it("isValid - validates rating values", () => {
    expect(isValid(0)).toStrictEqual(true);
    expect(isValid(0.5)).toStrictEqual(true);
    expect(isValid(1)).toStrictEqual(true);
    expect(isValid(-0.1)).toStrictEqual(false);
    expect(isValid(1.1)).toStrictEqual(false);
    expect(isValid(NaN)).toStrictEqual(false);
  });

  it("RatingUtils namespace - exports all utilities", () => {
    expectDefined(RatingUtils.normalized);
    expectDefined(RatingUtils.popm);
    expectDefined(RatingUtils.toNormalized);
    expectDefined(RatingUtils.fromNormalized);
    expectDefined(RatingUtils.toStars);
    expectDefined(RatingUtils.fromStars);
    expectDefined(RatingUtils.toPopm);
    expectDefined(RatingUtils.fromPopm);
    expectDefined(RatingUtils.toPercent);
    expectDefined(RatingUtils.fromPercent);
    expectDefined(RatingUtils.clamp);
    expectDefined(RatingUtils.isValid);
    expectDefined(RatingUtils.POPM_STAR_VALUES);
  });
});

describe("Roundtrip Tests", () => {
  it("normalized roundtrip - precision preserved", () => {
    for (let i = 0; i <= 255; i++) {
      const nr = toNormalized(popm(i));
      const recovered = fromNormalized(nr);
      expect(recovered).toStrictEqual(i);
    }
  });

  it("stars roundtrip - whole stars preserved", () => {
    for (let stars = 0; stars <= 5; stars++) {
      const nr = fromStars(stars);
      const recovered = toStars(nr);
      expect(recovered).toStrictEqual(stars);
    }
  });

  it("POPM star mapping roundtrip", () => {
    const popmValues = [0, 1, 64, 128, 196, 255];
    for (const p of popmValues) {
      const nr = fromPopm(popm(p));
      const recovered = toPopm(nr);
      expect(recovered).toStrictEqual(p);
    }
  });
});

describe("Rating Interface", () => {
  it("Rating interface - type compatibility", () => {
    const minRating: Rating = { rating: 0.8 };
    expect(minRating.rating).toStrictEqual(0.8);
    expect(minRating.email).toStrictEqual(undefined);
    expect(minRating.counter).toStrictEqual(undefined);

    const fullRating: Rating = {
      rating: 0.8,
      email: "user@example.com",
      counter: 42,
    };
    expect(fullRating.rating).toStrictEqual(0.8);
    expect(fullRating.email).toStrictEqual("user@example.com");
    expect(fullRating.counter).toStrictEqual(42);
  });
});

describe("Branded Type Safety", () => {
  it("prevents passing PopmRating where NormalizedRating expected", () => {
    const p = popm(196);
    // @ts-expect-error PopmRating not assignable to NormalizedRating
    fromNormalized(p);
  });

  it("prevents passing NormalizedRating where PopmRating expected", () => {
    const n = normalized(0.8);
    // @ts-expect-error NormalizedRating not assignable to PopmRating
    toNormalized(n);
  });

  it("prevents passing plain number where branded type expected", () => {
    const plain = 0.8;
    // @ts-expect-error number not assignable to NormalizedRating
    fromNormalized(plain);
    // @ts-expect-error number not assignable to PopmRating
    toNormalized(plain);
  });

  it("allows branded values to be used as numbers", () => {
    const n = normalized(0.8);
    const p = popm(196);
    expect(n + 0.1 > 0).toStrictEqual(true);
    expect(p - 1 >= 0).toStrictEqual(true);
  });
});
