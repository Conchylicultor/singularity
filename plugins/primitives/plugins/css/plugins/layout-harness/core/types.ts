import type { ReactElement } from "react";

// ── Fixture state matrix ───────────────────────────────────────────
//
// A fixture pins a primitive into one cell of a content × metadata × state
// matrix and sweeps it across container widths. The harness renders it with the
// REAL component + REAL Tailwind, measures the `[data-geo]` boxes per width, and
// asserts geometry invariants against the measured boxes.

export type FixtureState = "idle" | "running" | "error";

export interface FixtureDims {
  contentLen: "short" | "long";
  withMeta: boolean;
  state: FixtureState;
}

// ── Measured geometry (the oracle's input) ─────────────────────────
//
// `MeasuredBox` mirrors the load-bearing fields of `getBoundingClientRect`.
// `MeasuredFixture` is one width's measurement of a rendered fixture: the
// container box, every measured slot keyed by its `data-geo` id, and the DOM
// order of those slot ids (left → right). `truncates` is the standard
// `scrollWidth > clientWidth` "is this text ellipsized" signal.

export type MeasuredBox = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
};

export interface MeasuredFixture {
  container: MeasuredBox;
  slots: Record<string, { box: MeasuredBox; truncates: boolean }>;
  order: string[];
}

// ── Geometry invariants (the oracle's contract) ────────────────────
//
// Slot identity is the `data-geo` contract authored by the fixture — the oracle
// never references a primitive's internal class names, so it survives refactors
// of the primitive's mechanics. The eight kinds:
//
// - noOverlap                 adjacent boxes (in DOM `order`) never collide.
// - noClip                    every slot box stays inside `container`.
// - leftPack                  `slot` sits one `gap` after `after`'s right edge.
// - rigidIntegrity            `slot`'s width is STABLE across the width sweep
//                             (measured-stable — never a magic constant).
// - pinnedRight               `slot`'s right edge ≈ container's right edge.
// - truncationOnsetOrder      `first` enters the truncating state at a WIDER
//                             container width than `last` (first truncates first).
// - neverTruncatesWhenRoomy   at the widest width, no listed slot truncates.
// - falsification             NOT evaluated by the oracle — the suite re-renders
//                             the mutated construct and asserts `expectViolated`
//                             is VIOLATED (proof the oracle has teeth).

export type GeometryInvariant =
  | { kind: "noOverlap"; epsilon?: number }
  | { kind: "noClip"; epsilon?: number }
  | { kind: "leftPack"; after: string; slot: string; gap: number; epsilon?: number }
  | { kind: "rigidIntegrity"; slot: string; epsilon?: number }
  | { kind: "pinnedRight"; slot: string; epsilon?: number }
  | { kind: "truncationOnsetOrder"; first: string; last: string }
  | { kind: "neverTruncatesWhenRoomy"; slots: string[] }
  | { kind: "falsification"; mutate: FixtureMutation; expectViolated: GeometryInvariant };

// A deliberate break the falsification case applies to the rendered construct,
// proving the inner `expectViolated` invariant actually bites on the wrong shape.
export type FixtureMutation =
  | { kind: "templateOverride"; value: string } // force a wrong grid template
  | { kind: "swapLeafDisplay"; value: string }; // e.g. "inline" / "absolute-pad" — the known-broken construct

// ── The fixture contribution ───────────────────────────────────────
//
// A primitive contributes `LayoutFixture[]` from its `fixtures/index.ts`
// (default export). `render` returns the REAL component; author `data-geo="<slot>"`
// on the boxes you want measured. The harness sweeps `widths` and evaluates
// `invariants` against the per-width measurements.

export interface LayoutFixture {
  id: string; // "<primitive>/<scenario>", e.g. "grid/uniform-cards"
  primitive: string; // "grid"
  dims: FixtureDims;
  widths: number[]; // container widths to sweep (px)
  render: () => ReactElement; // REAL component; author data-geo on measured boxes
  invariants: GeometryInvariant[];
}

/**
 * Type guard validating a default export is a `LayoutFixture` — used by
 * `loadCollectedDir`'s `isItem` to reject malformed contributions (and each item
 * of an array export) without throwing. Validates the load-bearing shape: a
 * string `id` + `primitive`, a `widths` number array, a `render` function, and
 * an `invariants` array.
 */
export function isLayoutFixture(v: unknown): v is LayoutFixture {
  if (typeof v !== "object" || v === null) return false;
  const f = v as Partial<LayoutFixture>;
  return (
    typeof f.id === "string" &&
    typeof f.primitive === "string" &&
    Array.isArray(f.widths) &&
    f.widths.every((w) => typeof w === "number") &&
    typeof f.render === "function" &&
    Array.isArray(f.invariants)
  );
}
