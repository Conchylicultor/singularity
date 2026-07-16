import { expect, test, describe } from "bun:test";
import { StallPayloadSchema } from "./kinds";

// `renderTask` does `StallPayloadSchema.parse(row.data)` on rows persisted long
// before the current schema, so the schema's back-compat surface is load-bearing:
// a parse throw here is a Debug → Reports row that will not render at all.
//
// Two fields moved under it and both are pinned below against a REAL legacy row
// (`report-1784080035284-d53jrq`, the Jul-16 stall this fix exists for — the one
// titled `is @ …/drizzle-orm/entity.js:7` while its own `culpritStack` said
// `spawn ← listPanes ← … ← collectLive`):
//   - `culprit` was removed (it only ever duplicated `hotFrame` and nothing read it),
//   - `topStacks[].frames` was added (absent on every pre-Jul-16 row).
describe("StallPayloadSchema back-compat", () => {
  // Verbatim from the DB, only the topLeaves/topStacks tails trimmed for size.
  const DRIZZLE = "is @ node_modules/drizzle-orm/entity.js:7";
  const SPAWN_STACK =
    "spawn ← listPanes ← listPanes ← list ← list ← collectLive ← ? ← processTicksAndRejections";
  const legacyRow = {
    durationMs: 3329.163208,
    thresholdMs: 3000,
    nSamples: 15,
    sampleRateHz: 1,
    // The removed field — still present on every persisted row.
    culprit: DRIZZLE,
    culpritStack: SPAWN_STACK,
    hotFrame: DRIZZLE,
    traceId: "696ced25-e233-4c81-8f58-774eccabb382",
    topLeaves: [
      { key: "spawn [Unknown Executable]", pct: 46.7, count: 7 },
      { key: DRIZZLE, pct: 6.7, count: 1 },
    ],
    // Note: no `frames` — this row predates the field.
    topStacks: [{ pct: 26.7, count: 4, stack: SPAWN_STACK }],
  };

  test("a legacy row (with `culprit`, without `frames`) still parses", () => {
    expect(() => StallPayloadSchema.parse(legacyRow)).not.toThrow();
  });

  test("the removed `culprit` field is stripped, not preserved or required", () => {
    const parsed = StallPayloadSchema.parse(legacyRow);
    expect(parsed).not.toHaveProperty("culprit");
    // The fingerprint grain and the label both survive untouched.
    expect(parsed.culpritStack).toBe(SPAWN_STACK);
    expect(parsed.hotFrame).toBe(DRIZZLE);
  });

  test("a row omitting `culprit` entirely parses — the field is not required", () => {
    const { culprit: _culprit, ...withoutCulprit } = legacyRow;
    expect(() => StallPayloadSchema.parse(withoutCulprit)).not.toThrow();
  });

  test("a current row carrying `topStacks[].frames` parses and keeps them", () => {
    const currentRow = {
      ...legacyRow,
      topStacks: [
        {
          pct: 26.7,
          count: 4,
          stack: SPAWN_STACK,
          frames: ["spawn [Unknown Executable]", "listPanes @ …/tmux-runtime.ts:499"],
        },
      ],
    };
    const parsed = StallPayloadSchema.parse(currentRow);
    expect(parsed.topStacks[0]!.frames).toEqual([
      "spawn [Unknown Executable]",
      "listPanes @ …/tmux-runtime.ts:499",
    ]);
  });
});
