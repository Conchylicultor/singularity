import { describe, expect, test } from "bun:test";
import { ProbeSampleSchema, type ProbeSample } from "./schema";

const base: ProbeSample = {
  sampledAt: 1_752_600_000_000,
  variant: "lean",
  tickIndex: 3,
  eventLoopP50Ms: 0.4,
  eventLoopP99Ms: 1.2,
  eventLoopMaxMs: 2.0,
  lateByMs: 0,
  physFootprintMb: 5.1,
  residentMb: 4.9,
};

describe("ProbeSampleSchema", () => {
  test("round-trips a full fat-touch sample", () => {
    const sample: ProbeSample = {
      ...base,
      variant: "fat-touch",
      physFootprintMb: 812.3,
      residentMb: 640.1,
      touchMs: 1_240.5,
      touchBytes: 26_214_400,
      gcMs: 980.2,
    };
    const parsed = ProbeSampleSchema.parse(sample);
    expect(parsed).toEqual(sample);
  });

  test("accepts a lean line with no touch* / gc* fields (old-line tolerance)", () => {
    const result = ProbeSampleSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.touchMs).toBeUndefined();
      expect(result.data.gcMs).toBeUndefined();
    }
  });

  test("accepts null memory columns (FFI unavailable)", () => {
    const result = ProbeSampleSchema.safeParse({
      ...base,
      physFootprintMb: null,
      residentMb: null,
    });
    expect(result.success).toBe(true);
  });

  test("rejects an unknown variant", () => {
    expect(ProbeSampleSchema.safeParse({ ...base, variant: "fat-warm" }).success).toBe(false);
  });

  test("rejects a line missing a required field", () => {
    const withoutLate: Record<string, unknown> = { ...base };
    delete withoutLate.lateByMs;
    expect(ProbeSampleSchema.safeParse(withoutLate).success).toBe(false);
  });
});
