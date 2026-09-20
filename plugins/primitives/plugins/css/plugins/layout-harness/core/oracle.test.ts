import { describe, expect, test } from "bun:test";
import {
  checkLeftPack,
  checkNeverTruncatesWhenRoomy,
  checkNoClip,
  checkNoOverlap,
  checkOpticalCenter,
  checkPinnedRight,
  checkRailAlignment,
  checkRigidIntegrity,
  checkTruncationOnsetOrder,
  evaluateInvariant,
} from "./oracle";
import type { MeasuredBox, MeasuredFixture } from "./types";

// Pure unit tests over hand-built synthetic measurements — no DOM, no browser.
// This is the oracle's own correctness proof: each invariant fn gets a passing
// case AND a failing case, so a regression in the math is caught here directly.

function box(left: number, right: number, top = 0, bottom = 20): MeasuredBox {
  return {
    left,
    right,
    top,
    bottom,
    width: right - left,
    height: bottom - top,
  };
}

// `contentLeft` defaults to the box's own left edge — a probe with no padding of
// its own, which is what every measured slot but a `rail-bleed` row is. The rail
// tests below pass it explicitly.
// `opticalCenter` defaults to the box's vertical middle — the answer for a box
// whose ink happens to fill it. The optical tests below pass it explicitly,
// because the whole point of the invariant is that ink and box disagree.
function slot(
  b: MeasuredBox,
  truncates = false,
  contentLeft = b.left,
  opticalCenter: number | null = (b.top + b.bottom) / 2,
): MeasuredFixture["slots"][string] {
  return { box: b, truncates, contentLeft, opticalCenter };
}

// A canonical 4-slot row: leading | content | meta | trailing inside a container.
// The rail fields default to "no region published anything", which is the state
// every non-region fixture measures in.
function row(
  container: MeasuredBox,
  slots: MeasuredFixture["slots"],
  order: string[],
  rail: { origin?: number; start?: number | null; end?: number | null } = {},
): MeasuredFixture {
  return {
    container,
    slots,
    order,
    railOrigin: rail.origin ?? container.left,
    railStart: rail.start ?? null,
    railEnd: rail.end ?? null,
  };
}

describe("checkNoOverlap", () => {
  test("passes when adjacent boxes don't collide", () => {
    const m = row(box(0, 100), { a: slot(box(0, 40)), b: slot(box(48, 100)) }, [
      "a",
      "b",
    ]);
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
    const m = row(box(0, 100), { a: slot(box(0, 40)), b: slot(box(48, 100)) }, [
      "a",
      "b",
    ]);
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
      240: row(
        box(0, 240),
        { content: slot(box(0, 240), true), meta: slot(box(0, 0), true) },
        ["content", "meta"],
      ),
      720: row(
        box(0, 720),
        { content: slot(box(0, 300), false), meta: slot(box(308, 600), false) },
        ["content", "meta"],
      ),
    };
    expect(checkNeverTruncatesWhenRoomy(measured, ["content", "meta"]).ok).toBe(
      true,
    );
  });

  test("fails when a slot truncates even at the widest width", () => {
    const measured = {
      720: row(
        box(0, 720),
        { content: slot(box(0, 300), false), meta: slot(box(308, 400), true) },
        ["content", "meta"],
      ),
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
      240: row(
        box(0, 240),
        { content: slot(box(0, 0), true), meta: slot(box(0, 0), true) },
        ["content", "meta"],
      ),
      480: row(
        box(0, 480),
        { content: slot(box(0, 0), false), meta: slot(box(0, 0), true) },
        ["content", "meta"],
      ),
      720: row(
        box(0, 720),
        { content: slot(box(0, 0), false), meta: slot(box(0, 0), false) },
        ["content", "meta"],
      ),
    };
    expect(checkTruncationOnsetOrder(measured, "meta", "content").ok).toBe(
      true,
    );
  });

  test("fails when the priority is inverted (content truncates first)", () => {
    const measured = {
      240: row(
        box(0, 240),
        { content: slot(box(0, 0), true), meta: slot(box(0, 0), true) },
        ["content", "meta"],
      ),
      480: row(
        box(0, 480),
        { content: slot(box(0, 0), true), meta: slot(box(0, 0), false) },
        ["content", "meta"],
      ),
      720: row(
        box(0, 720),
        { content: slot(box(0, 0), false), meta: slot(box(0, 0), false) },
        ["content", "meta"],
      ),
    };
    const r = checkTruncationOnsetOrder(measured, "meta", "content");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.detail).toContain("strict priority");
  });

  test("fails when a slot never truncates across the sweep", () => {
    const measured = {
      240: row(
        box(0, 240),
        { content: slot(box(0, 0), false), meta: slot(box(0, 0), true) },
        ["content", "meta"],
      ),
      720: row(
        box(0, 720),
        { content: slot(box(0, 0), false), meta: slot(box(0, 0), false) },
        ["content", "meta"],
      ),
    };
    const r = checkTruncationOnsetOrder(measured, "meta", "content");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.detail).toContain("never truncates");
  });
});

describe("checkRailAlignment", () => {
  // A region whose padding box starts at x=0 and publishes an 8px rail: every
  // child's content must start at 8, whatever its own box does.
  const RAIL = { origin: 0, start: 8, end: 8 };

  test("passes when every child's content starts on the published rail", () => {
    const m = row(
      box(0, 262),
      {
        // A plain child: its box IS its content, and it sits on the rail.
        "bare-input": slot(box(8, 254)),
        // The escape: the box bleeds back out to the region's edge (left=0) and
        // re-applies the rail as its own padding, so its CONTENT is still at 8.
        "bled-row": slot(box(0, 262), false, 8),
      },
      ["bare-input", "bled-row"],
      RAIL,
    );
    expect(checkRailAlignment({ 262: m }).ok).toBe(true);
  });

  test("fails and NAMES the child that is off the rail", () => {
    const m = row(
      box(0, 262),
      {
        "bare-input": slot(box(0, 262)), // flush against the region's edge
        "bare-button": slot(box(8, 100)),
      },
      ["bare-input", "bare-button"],
      RAIL,
    );
    const r = checkRailAlignment({ 262: m });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.detail).toContain("railAlignment:");
      expect(r.detail).toContain("bare-input");
      expect(r.detail).toContain("off by -8.0px");
    }
  });

  // The case that makes publication load-bearing rather than polite: a region
  // may well have inset its children correctly, but if it published nothing
  // there is no number to check them against, and the next child that arrives
  // knowing nothing has nothing to inherit.
  test("fails when the region publishes no rail", () => {
    const m = row(box(0, 262), { "bare-input": slot(box(8, 254)) }, [
      "bare-input",
    ]);
    const r = checkRailAlignment({ 262: m });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.detail).toContain("publishes no --rail-start and --rail-end");
    }
  });

  test("fails when only the end half of the rail is published", () => {
    const m = row(
      box(0, 262),
      { "bare-input": slot(box(8, 254)) },
      ["bare-input"],
      {
        origin: 0,
        start: 8,
        end: null,
      },
    );
    const r = checkRailAlignment({ 262: m });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.detail).toContain("publishes no --rail-end");
  });

  // The measured slot set is the harness's, not the fixture's — so an empty one
  // means the region dropped the children, which must never read as a pass.
  test("fails when the region rendered no children at all", () => {
    const m = row(box(0, 262), {}, [], RAIL);
    const r = checkRailAlignment({ 262: m });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.detail).toContain("no slots were measured");
  });

  // The rail is an offset from the publisher's PADDING box, so a bordered region
  // (an OverlayPanel) has an origin one pixel inside its border box. Measuring
  // from the border box would report every child as 1px off at every width.
  test("measures from the rail origin, not the container's border box", () => {
    const m = row(
      box(0, 262),
      { "bare-input": slot(box(9, 253)) },
      ["bare-input"],
      { origin: 1, start: 8, end: 8 },
    );
    expect(checkRailAlignment({ 262: m }).ok).toBe(true);
  });

  // The double-pay: a `rail-follow` child under a region that already padded
  // applies the inset a second time, so its content lands at twice the rail
  // while its inheriting siblings stay put. One member off the rail is enough.
  test("fails when one child paid the rail twice", () => {
    const m = row(
      box(0, 262),
      {
        "bare-input": slot(box(8, 254)),
        follower: slot(box(16, 246)),
      },
      ["bare-input", "follower"],
      RAIL,
    );
    const r = checkRailAlignment({ 262: m });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.detail).toContain("follower");
      expect(r.detail).toContain("off by 8.0px");
    }
  });

  // What `railOverride` produces: the children never moved, only the published
  // number did. Nothing else about the measurement changed, which is what makes
  // the falsification a proof about THIS invariant.
  test("fails when the published rail no longer describes the geometry", () => {
    const m = row(
      box(0, 262),
      { "bare-input": slot(box(8, 254)) },
      ["bare-input"],
      { origin: 0, start: 0, end: 0 },
    );
    expect(checkRailAlignment({ 262: m }).ok).toBe(false);
  });
});

describe("checkOpticalCenter", () => {
  // The canonical row, correct: a 16px glyph and a text leaf in a 24px-tall row.
  // The boxes are NOT the same height and the ink still lines up, which is what
  // the invariant is for — every horizontal check is blind to both facts.
  const glyph = slot(box(8, 24, 4, 20), false, 8, 12);
  const title = slot(box(32, 200, 0, 24), false, 32, 12.2);

  test("passes when the named slots' ink agrees", () => {
    const m = row(box(0, 208, 0, 24), { glyph, title }, ["glyph", "title"]);
    expect(checkOpticalCenter({ 208: m }, ["glyph", "title"]).ok).toBe(true);
  });

  // The bug itself: the cell holding the text is taller than the text, so the
  // words sit ~3px above where the row centred the icon.
  test("fails when a cell taller than its text drops the icon below the words", () => {
    const sunkGlyph = slot(box(8, 24, 7, 23), false, 8, 15);
    const m = row(box(0, 208, 0, 30), { glyph: sunkGlyph, title }, [
      "glyph",
      "title",
    ]);
    const r = checkOpticalCenter({ 208: m }, ["glyph", "title"]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.detail).toContain("glyph");
      expect(r.detail).toContain("2.80px below");
    }
  });

  // Box centres agreeing is exactly what the broken row already did, so a check
  // that read boxes would call this green.
  test("sees a misalignment the box centres hide", () => {
    const b = box(8, 24, 0, 30);
    const c = box(32, 200, 0, 30);
    expect((b.top + b.bottom) / 2).toBe((c.top + c.bottom) / 2);
    const m = row(
      box(0, 208, 0, 30),
      { glyph: slot(b, false, 8, 15), title: slot(c, false, 32, 12) },
      ["glyph", "title"],
    );
    expect(checkOpticalCenter({ 208: m }, ["glyph", "title"]).ok).toBe(false);
  });

  test("tolerates sub-pixel drift below the default epsilon", () => {
    const m = row(
      box(0, 208, 0, 24),
      { glyph, title: slot(box(32, 200, 0, 24), false, 32, 12.6) },
      ["glyph", "title"],
    );
    expect(checkOpticalCenter({ 208: m }, ["glyph", "title"]).ok).toBe(true);
  });

  test("fails at ANY width in the sweep, not just the widest", () => {
    const wide = row(box(0, 400, 0, 24), { glyph, title }, ["glyph", "title"]);
    const narrow = row(
      box(0, 120, 0, 30),
      { glyph: slot(box(8, 24, 7, 23), false, 8, 15), title },
      ["glyph", "title"],
    );
    const r = checkOpticalCenter({ 120: narrow, 400: wide }, [
      "glyph",
      "title",
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.detail).toContain("at width 120px");
  });

  // A box with no ink is a failure to MEASURE, never an agreement. Reading it as
  // "matches everyone" is how a gate quietly stops gating.
  test("fails when a named slot has no ink to centre", () => {
    const m = row(
      box(0, 208, 0, 24),
      { glyph, title: slot(box(32, 200, 0, 24), false, 32, null) },
      ["glyph", "title"],
    );
    const r = checkOpticalCenter({ 208: m }, ["glyph", "title"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.detail).toContain("no measurable optical centre");
  });

  test("fails when fewer than two slots are named", () => {
    const m = row(box(0, 208, 0, 24), { glyph }, ["glyph"]);
    expect(checkOpticalCenter({ 208: m }, ["glyph"]).ok).toBe(false);
  });

  test("fails when the named slots never appear together", () => {
    const m = row(box(0, 208, 0, 24), { glyph }, ["glyph"]);
    const r = checkOpticalCenter({ 208: m }, ["glyph", "title"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.detail).toContain("never measured together");
  });
});

describe("evaluateInvariant dispatcher", () => {
  test("routes to the right checker (noOverlap)", () => {
    const m = row(box(0, 100), { a: slot(box(0, 60)), b: slot(box(48, 100)) }, [
      "a",
      "b",
    ]);
    const r = evaluateInvariant({ kind: "noOverlap" }, { 100: m });
    expect(r.ok).toBe(false);
  });

  test("routes to the right checker (railAlignment)", () => {
    const m = row(box(0, 100), { a: slot(box(0, 100)) }, ["a"], {
      origin: 0,
      start: 8,
      end: 8,
    });
    const r = evaluateInvariant({ kind: "railAlignment" }, { 100: m });
    expect(r.ok).toBe(false);
  });

  test("routes to the right checker (opticalCenter)", () => {
    const m = row(
      box(0, 100, 0, 30),
      {
        a: slot(box(0, 20, 0, 30), false, 0, 15),
        b: slot(box(24, 100, 0, 24), false, 24, 11),
      },
      ["a", "b"],
    );
    const r = evaluateInvariant(
      { kind: "opticalCenter", slots: ["a", "b"] },
      { 100: m },
    );
    expect(r.ok).toBe(false);
  });

  test("treats falsification as a no-op (handled by the suite)", () => {
    const m = row(box(0, 100), { a: slot(box(0, 60)), b: slot(box(48, 100)) }, [
      "a",
      "b",
    ]);
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
