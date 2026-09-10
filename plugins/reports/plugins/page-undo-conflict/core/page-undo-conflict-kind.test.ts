import { test, expect } from "bun:test";
import {
  PageUndoConflictPayloadSchema,
  pageUndoConflictFingerprint,
} from "./page-undo-conflict-kind";

// The fingerprint keys on the reason ALONE: block ids, directions and lengths
// are per-occurrence, so two occurrences of one reason must collapse onto one
// `_reports` row however much they differ otherwise.
test("fingerprint is stable across block ids, directions and lengths", async () => {
  const a = await pageUndoConflictFingerprint({
    reason: "stale-entry",
    blockId: "block-1",
    direction: "undo",
    expectedLength: 115,
    actualLength: 42,
  });
  const b = await pageUndoConflictFingerprint({
    reason: "stale-entry",
    blockId: "block-2",
    direction: "redo",
    expectedLength: 3,
    actualLength: 900,
  });
  expect(a).toBe(b);
  expect(a).toMatch(/^[0-9a-f]{16}$/);
});

test("the two reasons fingerprint apart", async () => {
  const stale = await pageUndoConflictFingerprint({
    reason: "stale-entry",
    blockId: "block-1",
    direction: "undo",
    expectedLength: 1,
    actualLength: 2,
  });
  const aborted = await pageUndoConflictFingerprint({
    reason: "run-aborted",
    blockId: "block-1",
    direction: null,
    expectedLength: 1,
    actualLength: 2,
  });
  expect(stale).not.toBe(aborted);
});

test("schema accepts both arms and rejects an unknown reason", () => {
  expect(
    PageUndoConflictPayloadSchema.safeParse({
      reason: "run-aborted",
      blockId: "b",
      direction: null,
      expectedLength: 10,
      actualLength: 12,
    }).success,
  ).toBe(true);
  expect(
    PageUndoConflictPayloadSchema.safeParse({
      reason: "block-gone",
      blockId: "b",
      direction: "undo",
      expectedLength: 10,
      actualLength: 12,
    }).success,
  ).toBe(false);
});
