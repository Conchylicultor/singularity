import { describe, expect, test } from "bun:test";
import {
  HOLD_CLASSES,
  ceilingMsFor,
  deadlineMsFor,
} from "@plugins/infra/plugins/jobs/core";
import { queueHealthConfig } from "./config";

// WARN BEFORE KILL, asserted rather than reasoned about.
//
// `queue-slot-hog` reports at `deadlineMsFor(hold) × slotHogDeadlineFraction`,
// and `jobs` aborts the run at `deadlineMsFor(hold)`. If the first were ever ≥
// the second, a job would be killed without ever having been warned about — the
// exact defect the old `slotHogHoldFactor` had for the `minutes` class, where a
// default of ×3 over the WORK ceiling landed at 90 min against a 60 min
// deadline.
//
// The property has two halves and both are checked: the field's bounds keep the
// fraction strictly below 1, and the class table keeps every deadline positive.
// Neither alone is enough, and neither lives in this file — which is why the
// test reads both from their real sources rather than restating any number.

const fractionField = queueHealthConfig.fields.slotHogDeadlineFraction;

describe("slotHogDeadlineFraction bounds", () => {
  test("is constrained strictly inside (0, 1)", () => {
    expect(fractionField.min).toBeGreaterThan(0);
    expect(fractionField.max).toBeLessThan(1);
    expect(fractionField.min).toBeLessThanOrEqual(fractionField.max as number);
  });

  test("its default is settable", () => {
    const d = fractionField.defaultValue;
    expect(d).toBeGreaterThanOrEqual(fractionField.min as number);
    expect(d).toBeLessThanOrEqual(fractionField.max as number);
  });

  test("rejects a value outside the range", () => {
    expect(fractionField.schema.safeParse(1).success).toBe(false);
    expect(fractionField.schema.safeParse(0).success).toBe(false);
    expect(fractionField.schema.safeParse(0.5).success).toBe(true);
  });
});

describe("the slot-hog threshold always precedes the deadline", () => {
  // Every settable value, not just the default: an operator can edit this field
  // in Settings → Config, and the ordering must survive whatever they pick.
  const settable = [
    fractionField.min as number,
    fractionField.defaultValue,
    fractionField.max as number,
  ];

  for (const hold of HOLD_CLASSES) {
    const deadlineMs = deadlineMsFor(hold);

    test(`${hold}: threshold < deadline at every settable fraction`, () => {
      for (const fraction of settable) {
        expect(deadlineMs * fraction).toBeLessThan(deadlineMs);
      }
    });

    test(`${hold}: the deadline is a positive, real bound`, () => {
      expect(deadlineMs).toBeGreaterThan(0);
    });

    // The deadline bounds HOLD and the ceiling bounds WORK, so they are not
    // interchangeable — but a deadline at or below the work ceiling would abort
    // handlers that are conforming by the very measure the class is judged on.
    test(`${hold}: the deadline leaves room above the work ceiling`, () => {
      expect(deadlineMs).toBeGreaterThan(ceilingMsFor(hold));
    });
  }
});
