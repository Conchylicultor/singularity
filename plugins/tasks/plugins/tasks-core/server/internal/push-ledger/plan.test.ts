/**
 * `planLedgerRows` — the attribution rules that turn a git walk into ledger rows.
 * Pure, so each rule is pinned directly rather than inferred from a DB-backed run.
 */
import { describe, expect, test } from "bun:test";
import { planLedgerRows, type LedgerState } from "./plan";
import type { TrailerCommit } from "../../../core";

function commit(overrides: Partial<TrailerCommit> = {}): TrailerCommit {
  return {
    sha: "sha1",
    committedAt: new Date("2026-08-17T10:00:00Z"),
    conversationId: "conv-1",
    pushId: "push-a",
    subject: "feat: something",
    ...overrides,
  };
}

function state(overrides: Partial<LedgerState> = {}): LedgerState {
  return {
    have: new Set(),
    attemptByConversation: new Map([["conv-1", "att-1"]]),
    liveAttempts: new Set(["att-1"]),
    ...overrides,
  };
}

describe("planLedgerRows", () => {
  test("attributes a commit to its conversation's attempt", () => {
    const rows = planLedgerRows([commit()], state());
    expect(rows).toEqual([
      {
        id: "push-a:sha1",
        attemptId: "att-1",
        conversationId: "conv-1",
        sha: "sha1",
        pushId: "push-a",
        message: "feat: something",
        createdAt: new Date("2026-08-17T10:00:00Z"),
      },
    ]);
  });

  // The walk is newest-first; a push's commits must reach `pushes.landed`
  // subscribers in the order `main` recorded them.
  test("emits oldest first, reversing the walk", () => {
    const rows = planLedgerRows(
      [commit({ sha: "newest" }), commit({ sha: "oldest" })],
      state(),
    );
    expect(rows.map((r) => r.sha)).toEqual(["oldest", "newest"]);
  });

  // Idempotence layer one: re-running a walk over commits already recorded is a
  // no-op before any write is attempted.
  test("skips a commit the ledger already holds", () => {
    const rows = planLedgerRows(
      [commit({ sha: "known" }), commit({ sha: "fresh" })],
      state({ have: new Set(["known"]) }),
    );
    expect(rows.map((r) => r.sha)).toEqual(["fresh"]);
  });

  // A worktree database forked before that conversation existed has nothing to
  // attach the push to — skipping is correct, inventing a row would break the FK.
  test("skips a commit whose conversation is absent from this database", () => {
    const rows = planLedgerRows(
      [commit({ conversationId: "conv-unknown" })],
      state(),
    );
    expect(rows).toEqual([]);
  });

  test("skips a commit whose attempt is absent from this database", () => {
    const rows = planLedgerRows(
      [commit()],
      state({ liveAttempts: new Set(["att-other"]) }),
    );
    expect(rows).toEqual([]);
  });

  test("keys the row on (pushId, sha), so one push spans many commits", () => {
    const rows = planLedgerRows(
      [commit({ sha: "a" }), commit({ sha: "b" })],
      state(),
    );
    expect(rows.map((r) => r.id)).toEqual(["push-a:b", "push-a:a"]);
    expect(new Set(rows.map((r) => r.pushId))).toEqual(new Set(["push-a"]));
  });

  test("an empty walk plans nothing", () => {
    expect(planLedgerRows([], state())).toEqual([]);
  });
});
