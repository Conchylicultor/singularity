/**
 * Pure unit tests for the collapsed-caret pending-marks cue.
 * Run with `bun test plugins/page/plugins/editor/`.
 *
 * The load-bearing claim is the two-armed rule in `caret-format-cue.ts`'s
 * header: say the pending set when the caret stands at a mark BOUNDARY, or when
 * that set DIFFERS from the marks of the text the caret stands in. The describes
 * below are the sources of each arm — an arrow step across a virtual delimiter,
 * a collapsed-caret Cmd+E, an autoformat landing, and the two states of a
 * boundary the caret is simply standing on — deliberately stated as one table
 * rather than as per-source cases, because "no case analysis" is the property
 * being pinned.
 *
 * The pair worth reading first is `` `zz|` `` / `` `zz`| ``: same pixel, same
 * linear offset, and the two rows below are the only thing that tells them
 * apart.
 */

import { test, expect, describe } from "bun:test";
import type { Mark } from "../../core";
import { caretFormatCue, cueLabel } from "./caret-format-cue";

const code: Mark[] = ["code"];
const bold: Mark[] = ["bold"];

describe("caretFormatCue", () => {
  test("`zz`| after ArrowRight → shown, plain: the caret stepped OUT of the run", () => {
    // The virtual-delimiter step: `natural` was the code run's marks, the stop
    // carries none, and until the user types, that difference is invisible.
    expect(
      caretFormatCue({ pending: [], surrounding: code, atBoundary: true }),
    ).toEqual({ kind: "shown", marks: [] });
  });

  test("`zz|` back inside after ArrowLeft → shown, code: the OTHER state of that boundary", () => {
    // The boundary arm. Pending and surrounding agree here, so the divergence
    // test alone says nothing — and saying nothing at exactly one of a
    // boundary's two states is what made the pair asymmetric.
    expect(
      caretFormatCue({ pending: code, surrounding: code, atBoundary: true }),
    ).toEqual({ kind: "shown", marks: ["code"] });
  });

  test("`z|z` mid-run → silent: agreement away from a boundary is unremarkable", () => {
    expect(
      caretFormatCue({ pending: code, surrounding: code, atBoundary: false }),
    ).toEqual({ kind: "silent" });
  });

  test("plain| after Cmd+E → shown, {code}", () => {
    // Lexical's collapsed branch of `formatText` is a pure selection toggle, so
    // this sets a pending mark with no confirmation anywhere on screen. No
    // boundary is involved — the divergent arm carries it.
    expect(
      caretFormatCue({ pending: code, surrounding: [], atBoundary: false }),
    ).toEqual({ kind: "shown", marks: ["code"] });
  });

  test("an empty block + Cmd+B → shown, {bold}: an element anchor is at no boundary", () => {
    // `virtualStop` answers null for an element anchor (it belongs to neither
    // side), so the caret is NOT at a boundary and only the divergent arm can
    // reach this — which it does.
    expect(
      caretFormatCue({ pending: bold, surrounding: [], atBoundary: false }),
    ).toEqual({ kind: "shown", marks: ["bold"] });
  });

  test("a|`zz` the mirrored seam, natural side → shown, plain", () => {
    // Left `{}`, right `{code}`: a boundary, whose natural state carries `{}`.
    // Agreement again, so this row is the boundary arm too — and it is the seam
    // where the caret can prepend into the code run one press away.
    expect(
      caretFormatCue({ pending: [], surrounding: [], atBoundary: true }),
    ).toEqual({ kind: "shown", marks: [] });
  });

  test("plain|`zz` after ArrowRight INTO the run → shown, {code}", () => {
    // The stop is the state inside the code run at its start, so the caret
    // carries `{code}` while the anchor node it resolved to does not. Both arms
    // fire; either alone would show it.
    expect(
      caretFormatCue({ pending: code, surrounding: [], atBoundary: true }),
    ).toEqual({ kind: "shown", marks: ["code"] });
  });

  test("after `**b**` autoformats → shown, plain", () => {
    // `applyInlineFormat` restores `preFormat` onto the post-transform caret, so
    // EVERY successful autoformat lands unmarked beside the run it just made.
    expect(
      caretFormatCue({ pending: [], surrounding: bold, atBoundary: true }),
    ).toEqual({ kind: "shown", marks: [] });
  });

  test("ordinary caret mid-word → silent", () => {
    expect(
      caretFormatCue({ pending: bold, surrounding: bold, atBoundary: false }),
    ).toEqual({ kind: "silent" });
  });

  test("plain| at a block end → silent (a plain caret in plain text says nothing)", () => {
    // `{}` either side of the caret is no boundary at all — `virtualStop`
    // short-circuits on two equal sides — so this is the ordinary end of an
    // ordinary paragraph.
    expect(
      caretFormatCue({ pending: [], surrounding: [], atBoundary: false }),
    ).toEqual({ kind: "silent" });
  });

  test("equality is over the SET, not the array order", () => {
    // A comparison that depended on order would read this as a divergence, i.e.
    // a cue that never goes away.
    expect(
      caretFormatCue({
        pending: ["code", "bold"],
        surrounding: ["bold", "code"],
        atBoundary: false,
      }),
    ).toEqual({ kind: "silent" });
  });

  test("shown marks come back in canonical MARK_ORDER order", () => {
    expect(
      caretFormatCue({
        pending: ["code", "bold"],
        surrounding: [],
        atBoundary: false,
      }),
    ).toEqual({ kind: "shown", marks: ["bold", "code"] });
  });

  test("same size, different members → shown", () => {
    // The length check alone is not the comparison; `{bold}` vs `{code}` differs.
    expect(
      caretFormatCue({ pending: bold, surrounding: code, atBoundary: false }),
    ).toEqual({ kind: "shown", marks: ["bold"] });
  });

  test("a divergent caret is shown at a boundary too — the arms are an OR", () => {
    expect(
      caretFormatCue({ pending: bold, surrounding: code, atBoundary: true }),
    ).toEqual({ kind: "shown", marks: ["bold"] });
  });
});

describe("cueLabel", () => {
  test("no marks reads `plain`, not the empty string", () => {
    expect(cueLabel([])).toBe("plain");
  });

  test("one mark reads its state word", () => {
    expect(cueLabel(code)).toBe("code");
    expect(cueLabel(["strikethrough"])).toBe("strikethrough");
  });

  test("several marks read in MARK_ORDER order regardless of the argument's", () => {
    expect(cueLabel(["code", "bold"])).toBe("bold code");
    expect(cueLabel(["bold", "code"])).toBe("bold code");
  });
});
