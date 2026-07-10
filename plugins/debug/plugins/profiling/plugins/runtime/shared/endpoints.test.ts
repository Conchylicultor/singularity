import { describe, expect, test } from "bun:test";
import {
  FLIGHT_WINDOW_MS_DEFAULT,
  FLIGHT_WINDOW_MS_MAX,
  FLIGHT_WINDOW_MS_MIN,
  flightWindowQuerySchema,
} from "./endpoints";

// Query params arrive as raw strings (implement() feeds searchParams entries
// straight into safeParse), so every case below parses from a string.
describe("flightWindowQuerySchema", () => {
  test("defaults when windowMs is absent", () => {
    expect(flightWindowQuerySchema.parse({})).toEqual({
      windowMs: FLIGHT_WINDOW_MS_DEFAULT,
    });
  });

  test("coerces a numeric string", () => {
    expect(flightWindowQuerySchema.parse({ windowMs: "30000" })).toEqual({
      windowMs: 30_000,
    });
  });

  test("clamps below the minimum", () => {
    expect(flightWindowQuerySchema.parse({ windowMs: "5" })).toEqual({
      windowMs: FLIGHT_WINDOW_MS_MIN,
    });
  });

  test("clamps above the maximum", () => {
    expect(flightWindowQuerySchema.parse({ windowMs: "999999999" })).toEqual({
      windowMs: FLIGHT_WINDOW_MS_MAX,
    });
  });

  test("keeps in-range bounds untouched", () => {
    expect(
      flightWindowQuerySchema.parse({ windowMs: String(FLIGHT_WINDOW_MS_MIN) })
        .windowMs,
    ).toBe(FLIGHT_WINDOW_MS_MIN);
    expect(
      flightWindowQuerySchema.parse({ windowMs: String(FLIGHT_WINDOW_MS_MAX) })
        .windowMs,
    ).toBe(FLIGHT_WINDOW_MS_MAX);
  });

  test("rejects non-numeric input", () => {
    expect(flightWindowQuerySchema.safeParse({ windowMs: "abc" }).success).toBe(
      false,
    );
    expect(
      flightWindowQuerySchema.safeParse({ windowMs: "Infinity" }).success,
    ).toBe(false);
  });
});
