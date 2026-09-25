import { describe, expect, test } from "bun:test";
import { HOLD_CLASSES, ceilingMsFor, deadlineMsFor } from "./hold";

describe("every hold class's deadline", () => {
  for (const hold of HOLD_CLASSES) {
    // The deadline bounds HOLD and the ceiling bounds WORK, so they are not
    // interchangeable — but a deadline at or below the work ceiling would abort
    // handlers that are conforming by the very measure the class is judged on.
    test(`${hold}: the deadline leaves room above the work ceiling`, () => {
      expect(deadlineMsFor(hold)).toBeGreaterThan(ceilingMsFor(hold));
    });
  }
});
