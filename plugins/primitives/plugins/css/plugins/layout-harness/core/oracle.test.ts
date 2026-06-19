import { describe, expect, test } from "bun:test";
import {
  checkLeftPack,
  checkNeverTruncatesWhenRoomy,
  checkNoClip,
  checkNoOverlap,
  checkPinnedRight,
  checkRigidIntegrity,
  checkTruncationOnsetOrder,
  evaluateInvariant,
} from "./oracle";
import type { MeasuredBox, MeasuredFixture } from "./types";

// Pure unit tests over hand-built synthetic measurements — no DOM, no browser.
// This is the oracle's own correctness proof: each invariant fn gets a passing
// case AND a failing case, so a regression in the math is caught here directly.

function box(left: number, right: number, top = 0, bottom = 20): MeasuredBox {
  return { left, right, top, bottom, width: right - left, height: bottom - top };
}

function slot(b: MeasuredBox, truncates = false): { box: MeasuredBox; truncates: boolean } {
  return { box: b, truncates };
}

// A canonical 4-slot row: leading | content | meta | trailing inside a container.
function row(
  container: MeasuredBox,
  slots: Record<string, { box: MeasuredBox; truncates: boolean }>,
  order: string[],
): MeasuredFixture {
  return { container, slots, order };
}

describe("checkNoOverlap", () => {
  test("passes when adjacent boxes don't collide", () => {
    const m = row(
      box(0, 100),
      { a: slot(box(0, 40)), b: slot(box(48, 100)) },
      ["a", "b"],
    );
    expect(checkNoOverlap({ 100: m }).ok).toBe(true);
  });

  test("fails when cur.right > next.left", () => {
    const m = row(
      box(0, 100),
      { a: slot(box(0, 60)), b: slot(box(48, 100)) }, // a.right=60 > b.left=48
      ["a", "b"],
    );
    const r = checkNoOverlap({ 100: m });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.detail).toContain("overlaps");
  });
});

describe("checkNoClip", () => {
  test("passes when every slot is inside the container", () => {
    const m = row(
      box(0, 100),
      { a: slot(box(0, 40)), b: slot(box(48, 100)) },
      ["a", "b"],
    );
    expect(checkNoClip({ 100: m }).ok).toBe(true);
  });

  test("fails when a slot overflows the container right edge", () => {
    const m = row(
      box(0, 100),
      { a: slot(box(0, 40)), b: slot(box(48, 130)) }, // b.right=130 > container.right=100
      ["a", "b"],
    );
    const r = checkNoClip({ 100: m });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.detail).toContain("clips past container right");
  });
});

describe("checkLeftPack", () => {
  test("passes when slot sits one gap after the anchor", () => {
    const m = row(
      box(0, 100),
      { leading: slot(box(0, 40)), content: slot(box(48, 100)) }, // 40 + 8 = 48
      ["leading", "content"],
    );
    expect(checkLeftPack({ 100: m }, "leading", "content", 8).ok).toBe(true);
  });

  test("fails when the slot is shoved away from the anchor (centered)", () => {
    const m = row(
      box(0, 100),
      { leading: slot(box(0, 40)), content: slot(box(70, 100)) }, // expected left ≈ 48, got 70
      ["leading", "content"],
    );
    const r = checkLeftPack({ 100: m }, "leading", "content", 8);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.detail).toContain("not packed");
  });
});

describe("checkRigidIntegrity", () => {
  test("passes when the slot width is stable across the sweep", () => {
    const measured = {
      240: row(box(0, 240), { lead: slot(box(0, 40)) }, ["lead"]),
      480: row(box(0, 480), { lead: slot(box(0, 40)) }, ["lead"]),
      720: row(box(0, 720), { lead: slot(box(0, 40)) }, ["lead"]),
    };
    expect(checkRigidIntegrity(measured, "lead").ok).toBe(true);
  });

  test("fails when the slot crushes as the row narrows", () => {
    const measured = {
      240: row(box(0, 240), { lead: slot(box(0, 20)) }, ["lead"]), // crushed to 20
      720: row(box(0, 720), { lead: slot(box(0, 40)) }, ["lead"]),
    };
    const r = checkRigidIntegrity(measured, "lead");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.detail).toContain("NOT stable");
  });
});

describe("checkPinnedRight", () => {
  test("passes when the slot is pinned right at the widest width", () => {
    const measured = {
      240: row(box(0, 240), { trailing: slot(box(212, 240)) }, ["trailing"]),
      720: row(box(0, 720), { trailing: slot(box(692, 720)) }, ["trailing"]),
    };
    expect(checkPinnedRight(measured, "trailing").ok).toBe(true);
  });

  test("fails when the slot is unpinned at the widest width", () => {
    const measured = {
      240: row(box(0, 240), { trailing: slot(box(212, 240)) }, ["trailing"]),
      720: row(box(0, 720), { trailing: slot(box(400, 428)) }, ["trailing"]), // floating mid-row
    };
    const r = checkPinnedRight(measured, "trailing");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.detail).toContain("not pinned");
  });
});

describe("checkNeverTruncatesWhenRoomy", () => {
  test("passes when no listed slot truncates at the widest width", () => {
    const measured = {
      240: row(box(0, 240), { content: slot(box(0, 240), true), meta: slot(box(0, 0), true) }, ["content", "meta"]),
      720: row(box(0, 720), { content: slot(box(0, 300), false), meta: slot(box(308, 600), false) }, ["content", "meta"]),
    };
    expect(checkNeverTruncatesWhenRoomy(measured, ["content", "meta"]).ok).toBe(true);
  });

  test("fails when a slot truncates even at the widest width", () => {
    const measured = {
      720: row(box(0, 720), { content: slot(box(0, 300), false), meta: slot(box(308, 400), true) }, ["content", "meta"]),
    };
    const r = checkNeverTruncatesWhenRoomy(measured, ["content", "meta"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.detail).toContain("truncates even at the widest width");
  });
});

describe("checkTruncationOnsetOrder", () => {
  // meta truncates first ⇒ its onset (widest width at which it first truncates)
  // is WIDER than content's. Sweep: at 480 meta already truncates; content only
  // truncates at the narrowest 240.
  test("passes when meta's onset is wider than content's", () => {
    const measured = {
      240: row(box(0, 240), { content: slot(box(0, 0), true), meta: slot(box(0, 0), true) }, ["content", "meta"]),
      480: row(box(0, 480), { content: slot(box(0, 0), false), meta: slot(box(0, 0), true) }, ["content", "meta"]),
      720: row(box(0, 720), { content: slot(box(0, 0), false), meta: slot(box(0, 0), false) }, ["content", "meta"]),
    };
    expect(checkTruncationOnsetOrder(measured, "meta", "content").ok).toBe(true);
  });

  test("fails when the priority is inverted (content truncates first)", () => {
    const measured = {
      240: row(box(0, 240), { content: slot(box(0, 0), true), meta: slot(box(0, 0), true) }, ["content", "meta"]),
      480: row(box(0, 480), { content: slot(box(0, 0), true), meta: slot(box(0, 0), false) }, ["content", "meta"]),
      720: row(box(0, 720), { content: slot(box(0, 0), false), meta: slot(box(0, 0), false) }, ["content", "meta"]),
    };
    const r = checkTruncationOnsetOrder(measured, "meta", "content");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.detail).toContain("strict priority");
  });

  test("fails when a slot never truncates across the sweep", () => {
    const measured = {
      240: row(box(0, 240), { content: slot(box(0, 0), false), meta: slot(box(0, 0), true) }, ["content", "meta"]),
      720: row(box(0, 720), { content: slot(box(0, 0), false), meta: slot(box(0, 0), false) }, ["content", "meta"]),
    };
    const r = checkTruncationOnsetOrder(measured, "meta", "content");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.detail).toContain("never truncates");
  });
});

describe("evaluateInvariant dispatcher", () => {
  test("routes to the right checker (noOverlap)", () => {
    const m = row(box(0, 100), { a: slot(box(0, 60)), b: slot(box(48, 100)) }, ["a", "b"]);
    const r = evaluateInvariant({ kind: "noOverlap" }, { 100: m });
    expect(r.ok).toBe(false);
  });

  test("treats falsification as a no-op (handled by the suite)", () => {
    const m = row(box(0, 100), { a: slot(box(0, 60)), b: slot(box(48, 100)) }, ["a", "b"]);
    const r = evaluateInvariant(
      {
        kind: "falsification",
        mutate: { kind: "templateOverride", value: "x" },
        expectViolated: { kind: "noOverlap" },
      },
      { 100: m },
    );
    expect(r.ok).toBe(true);
  });
});
