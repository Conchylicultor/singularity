import { describe, expect, it } from "bun:test";
import {
  canRedo,
  canUndo,
  emptyHistory,
  popRedo,
  popUndo,
  recordEntry,
  type HistoryEntry,
} from "./stack";

const NOOP = (): void => {};

function entry(over: Partial<HistoryEntry> = {}): HistoryEntry {
  return { undo: NOOP, redo: NOOP, ...over };
}

describe("recordEntry", () => {
  it("pushes a fresh entry and reports canUndo", () => {
    const s = recordEntry(emptyHistory(), entry({ label: "a" }), 0, 200);
    expect(s.past.length).toBe(1);
    expect(canUndo(s)).toBe(true);
    expect(canRedo(s)).toBe(false);
  });

  it("clears future on a fresh record", () => {
    let s = recordEntry(emptyHistory(), entry({ label: "a" }), 0, 200);
    const undone = popUndo(s);
    expect(undone).not.toBeNull();
    s = undone!.state;
    expect(canRedo(s)).toBe(true);
    s = recordEntry(s, entry({ label: "b" }), 10, 200);
    expect(canRedo(s)).toBe(false);
    expect(s.future.length).toBe(0);
  });

  it("enforces maxDepth by dropping the oldest entries", () => {
    let s = emptyHistory();
    for (let i = 0; i < 5; i++) s = recordEntry(s, entry({ label: `e${i}` }), i, 3);
    expect(s.past.length).toBe(3);
    expect(s.past[0]!.entry.label).toBe("e2");
    expect(s.past[2]!.entry.label).toBe("e4");
  });
});

describe("coalescing", () => {
  it("merges adjacent entries with same key within the window", () => {
    const firstUndo = (): void => {};
    const secondRedo = (): void => {};
    let s = recordEntry(
      emptyHistory(),
      entry({ label: "type a", coalesceKey: "text", undo: firstUndo }),
      0,
      200,
    );
    s = recordEntry(
      s,
      entry({
        label: "type ab",
        coalesceKey: "text",
        coalesceWindowMs: 500,
        redo: secondRedo,
      }),
      400,
      200,
    );
    expect(s.past.length).toBe(1);
    // Keeps the FIRST entry's undo, takes the LATEST entry's redo + label.
    expect(s.past[0]!.entry.undo).toBe(firstUndo);
    expect(s.past[0]!.entry.redo).toBe(secondRedo);
    expect(s.past[0]!.entry.label).toBe("type ab");
  });

  it("does NOT merge when the window has elapsed", () => {
    let s = recordEntry(
      emptyHistory(),
      entry({ coalesceKey: "text", coalesceWindowMs: 500 }),
      0,
      200,
    );
    s = recordEntry(s, entry({ coalesceKey: "text", coalesceWindowMs: 500 }), 600, 200);
    expect(s.past.length).toBe(2);
  });

  it("does NOT merge entries with different keys", () => {
    let s = recordEntry(emptyHistory(), entry({ coalesceKey: "a" }), 0, 200);
    s = recordEntry(s, entry({ coalesceKey: "b" }), 10, 200);
    expect(s.past.length).toBe(2);
  });

  it("does NOT merge when coalesceKey is unset", () => {
    let s = recordEntry(emptyHistory(), entry(), 0, 200);
    s = recordEntry(s, entry(), 10, 200);
    expect(s.past.length).toBe(2);
  });

  it("keeps future cleared after a coalesced merge", () => {
    let s = recordEntry(emptyHistory(), entry({ coalesceKey: "x" }), 0, 200);
    const undone = popUndo(s);
    s = undone!.state;
    // Re-record on the (now empty) past — first record after undo can't coalesce.
    s = recordEntry(s, entry({ coalesceKey: "x" }), 10, 200);
    expect(s.future.length).toBe(0);
  });
});

describe("popUndo / popRedo", () => {
  it("returns null when nothing to undo/redo", () => {
    expect(popUndo(emptyHistory())).toBeNull();
    expect(popRedo(emptyHistory())).toBeNull();
  });

  it("round-trips an entry past -> future -> past", () => {
    const e = entry({ label: "move" });
    let s = recordEntry(emptyHistory(), e, 0, 200);

    const undone = popUndo(s)!;
    expect(undone.entry).toBe(e);
    s = undone.state;
    expect(canUndo(s)).toBe(false);
    expect(canRedo(s)).toBe(true);

    const redone = popRedo(s)!;
    expect(redone.entry).toBe(e);
    s = redone.state;
    expect(canUndo(s)).toBe(true);
    expect(canRedo(s)).toBe(false);
  });

  it("undoes in LIFO order", () => {
    let s = emptyHistory();
    const a = entry({ label: "a" });
    const b = entry({ label: "b" });
    s = recordEntry(s, a, 0, 200);
    s = recordEntry(s, b, 1, 200);
    const first = popUndo(s)!;
    expect(first.entry).toBe(b);
    const second = popUndo(first.state)!;
    expect(second.entry).toBe(a);
  });
});
