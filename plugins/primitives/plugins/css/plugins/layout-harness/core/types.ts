import type { ReactElement, ReactNode } from "react";

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
//
// The three rail fields exist because the oracle cannot compute them: they are
// the published inline rail (`--rail-start` / `--rail-end`) and the box edge it
// is measured from. Both custom properties are RESOLVED TO PIXELS by laying them
// out, never by parsing the computed text — `--rail-start: var(--space-lg)`
// computes to the string `1rem`, so `parseFloat` would read `1`. `null` means
// the region published NOTHING, which `railAlignment` reports as a failure
// rather than silently treating as a 0px rail.

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
  slots: Record<
    string,
    {
      box: MeasuredBox;
      truncates: boolean;
      /**
       * Where this box's CONTENT starts: `rect.left + paddingLeft`. The rail is
       * about content edges, not border-box edges — a `rail-bleed` row's box
       * deliberately reaches back out to the region's edge and re-applies the
       * rail as its own padding, so only its content edge is on the rail. A box
       * that applies no padding of its own reports its plain left edge.
       */
      contentLeft: number;
    }
  >;
  order: string[];
  /**
   * The PUBLISHER's padding-box left edge — the x that `--rail-start` is
   * measured from. It is the padding box (`rect.left + borderLeftWidth`), not
   * the border box, because a region's border sits outside the rail: a bordered
   * `OverlayPanel` would otherwise read one pixel off at every width.
   */
  railOrigin: number;
  /** Published `--rail-start`, in px; `null` when no ancestor publishes one. */
  railStart: number | null;
  /** Published `--rail-end`, in px; `null` when no ancestor publishes one. */
  railEnd: number | null;
}

// ── Geometry invariants (the oracle's contract) ────────────────────
//
// Slot identity is the `data-geo` contract authored by the fixture — the oracle
// never references a primitive's internal class names, so it survives refactors
// of the primitive's mechanics. The nine kinds:
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
// - railAlignment             EVERY measured slot's content starts on the rail
//                             the region published (`railOrigin + railStart`),
//                             and a region that published none fails outright.
//                             The one invariant asserted over the WHOLE slot set
//                             rather than named slots, because it is the one the
//                             fixture must not be able to scope to the children
//                             it already handles.
// - falsification             NOT evaluated by the oracle — the suite re-renders
//                             the mutated construct and asserts `expectViolated`
//                             is VIOLATED (proof the oracle has teeth).

export type GeometryInvariant =
  | { kind: "noOverlap"; epsilon?: number }
  | { kind: "noClip"; epsilon?: number }
  | {
      kind: "leftPack";
      after: string;
      slot: string;
      gap: number;
      epsilon?: number;
    }
  | { kind: "rigidIntegrity"; slot: string; epsilon?: number }
  | { kind: "pinnedRight"; slot: string; epsilon?: number }
  | { kind: "truncationOnsetOrder"; first: string; last: string }
  | { kind: "neverTruncatesWhenRoomy"; slots: string[] }
  | { kind: "railAlignment"; epsilon?: number }
  | {
      kind: "falsification";
      mutate: FixtureMutation;
      expectViolated: GeometryInvariant;
    };

// A deliberate break the falsification case applies to the rendered construct,
// proving the inner `expectViolated` invariant actually bites on the wrong shape.
export type FixtureMutation =
  | { kind: "templateOverride"; value: string } // force a wrong grid template
  | { kind: "swapLeafDisplay"; value: string } // e.g. "inline" / "absolute-pad" — the known-broken construct
  // Re-publish the rail as `value` from BELOW the region, so the children keep
  // the geometry the region gave them while the published number no longer
  // describes it. That is the only way to prove `railAlignment` compares
  // against the PUBLISHED rail rather than merely observing that the children
  // agree with each other — which they would, whatever the number said.
  | { kind: "railOverride"; value: string }
  // Re-publish what a FOLLOWER still owes as `value` (both `--rail-owed-*`),
  // from below the region. A region that pays sets the debt to `0px`; forcing it
  // back to the full rail reproduces the double-pay bug exactly — the owner pads
  // and the follower pads again, so the follower's content lands at twice the
  // rail while every inheriting sibling stays put. One `value` goes to both
  // properties: `railAlignment` asserts the inline START only (the end is along
  // for the ride), which is where the bug class lives.
  | { kind: "railOwedOverride"; value: string };

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
  // A `RegionFixture` also has a string id/primitive, a widths array and a
  // `render` function, so the discriminant is checked FIRST — otherwise a region
  // fixture would need only an `invariants` typo to be mistaken for a layout one.
  if ((v as { kind?: unknown }).kind === "region") return false;
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

// ── The region contribution ────────────────────────────────────────
//
// A `RegionFixture` hands the harness a HOLE where a `LayoutFixture` hands it a
// child list: `render` receives the children and must place them inside the
// region under test. The author says "this box opens a region"; the harness says
// what goes in it.
//
// That inversion is the whole point, and it is structural rather than polite.
// Every `LayoutFixture` authors its own children, so a container is only ever
// measured against the child kind it already handles — which is how three
// geometry bugs shipped past a green suite while `control-panel/CLAUDE.md`
// carried a warning sentence asking authors to please render something else. A
// region fixture cannot scope its own gate: the child set is `REGION_CHILDREN`,
// one kit for every region in the repo, and adding a member re-gates every
// region at once.
//
// There is no `invariants` field for the same reason. `expandRegionFixtures`
// supplies them (`railAlignment`, `noClip`, and the `railOverride`
// falsification), so a region cannot opt out of the check it exists to pass.

export interface RegionFixture {
  kind: "region";
  id: string; // "<primitive>/region", e.g. "control-panel/region"
  primitive: string;
  widths: number[]; // container widths to sweep (px)
  /**
   * Render the region with the harness's children inside it. Author NOTHING
   * else in the hole — no wrapper, no rail class, no `data-geo`: the children
   * arrive already marked, and a child that knows nothing about the rail is
   * exactly what proves the rail.
   */
  render: (children: ReactNode) => ReactElement;
}

/** The `RegionFixture` half of `loadFixtures()`'s `isItem` — see `isLayoutFixture`. */
export function isRegionFixture(v: unknown): v is RegionFixture {
  if (typeof v !== "object" || v === null) return false;
  const f = v as Partial<RegionFixture>;
  return (
    f.kind === "region" &&
    typeof f.id === "string" &&
    typeof f.primitive === "string" &&
    Array.isArray(f.widths) &&
    f.widths.every((w) => typeof w === "number") &&
    typeof f.render === "function"
  );
}

/**
 * What a `fixtures/index.ts` may contribute. `loadFixtures()` returns this
 * union; `expandRegionFixtures()` collapses it back to `LayoutFixture[]`, which
 * is what all three consumers (the bun:test gate, the check, the Layout Lab
 * gallery) actually render.
 */
export type HarnessFixture = LayoutFixture | RegionFixture;
