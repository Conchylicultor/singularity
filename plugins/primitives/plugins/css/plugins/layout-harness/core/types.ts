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
  | { kind: "truncatesTogether"; slots: string[] }
  | { kind: "neverTruncatesWhenRoomy"; slots: string[] }
  | { kind: "railAlignment"; epsilon?: number }
  | {
      kind: "falsification";
      mutate: FixtureMutation;
      expectViolated: GeometryInvariant;
    };

/**
 * The attribute a fixture puts on the box that HOSTS its primitive — the one
 * whose properties the primitive silently depends on. Two mutations take it
 * away: `shrinkWrapHost` removes the width the host hands down,
 * `unpositionHost` removes the positioning context it establishes.
 *
 * One marker for both because there is one relationship: only the fixture knows
 * which box is the host, and a fixture that named two would be describing two
 * primitives.
 *
 * It lives here, in core, and not beside `RAIL_MARKER_ATTR` in the harness's own
 * `region-children.tsx`, because the two markers are authored by opposite sides.
 * The rail marker is the harness's wrapper around children the harness itself
 * supplies, so only harness code ever writes it; this one marks a box in the
 * FIXTURE's own tree, and a fixture may import nothing but this core barrel. The
 * mutation reads it back through the same constant, so the box the fixture
 * marked and the box the mutation finds cannot drift apart.
 */
export const HOST_MARKER_ATTR = "data-geo-host";

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
  // Hand every measured `[data-geo]` box back to the layout engine —
  // `flex-shrink: 1` + `min-width: 0`, which is what an ordinary flex item is.
  // The falsification for a primitive whose contract is "a box I measure is the
  // size of its own content, whatever else is in the row": under it the engine
  // takes the row's deficit out of the slots, so a slot's width becomes a
  // function of its neighbours and `rigidIntegrity` must fail.
  | { kind: "shrinkSlots" }
  // Re-publish what a FOLLOWER still owes as `value` (both `--rail-owed-*`),
  // from below the region. A region that pays sets the debt to `0px`; forcing it
  // back to the full rail reproduces the double-pay bug exactly — the owner pads
  // and the follower pads again, so the follower's content lands at twice the
  // rail while every inheriting sibling stays put. One `value` goes to both
  // properties: `railAlignment` asserts the inline START only (the end is along
  // for the ride), which is where the bug class lives.
  | { kind: "railOwedOverride"; value: string }
  // Re-declare ONE measured slot as a different space-sharing role — the four
  // roles being the closed set `rigid | yield | grow | fill` (see
  // `css/plugins/{rigid,yield,grow,fill}`). Role-shaped rather than
  // mechanic-shaped on purpose: every wrong-role falsification in the family is
  // one mutation, and the fixture states the mistake it is reproducing
  // ("someone reached for Fill here") rather than the CSS that mistake emits.
  //
  // The motivating case is `yield` vs `fill`. Both let a cell fall below its
  // content, so a style assertion cannot tell them apart; what separates them is
  // `flex-1`'s basis ZERO, which resolves the fill'd cell to 0 and hands its
  // sibling (basis `auto`) full content width — so the deficit comes out of one
  // cell instead of being shared. Only a real layout engine across a width sweep
  // shows that, which is why it is a mutation here and not a unit test.
  | {
      kind: "swapSlotRole";
      slot: string;
      role: "rigid" | "yield" | "grow" | "fill";
    }
  // Set `width: max-content` on the fixture's {@link HOST_MARKER_ATTR} box: the
  // host stops handing this primitive a width and starts taking its width FROM
  // it.
  //
  // The historical broken construct for every measure-then-decide primitive, not
  // just the one that motivated it. Such a primitive reads the room it has been
  // given, commits a decision, and reads again — sound only while the reading is
  // an input. Under a shrink-to-content host the reading is an OUTPUT of the last
  // decision, so each pass shrinks the number that decides the next one: a
  // one-way ratchet ending wherever the content runs out. Nothing about the
  // declaration says so — a `flex-1` child of a `w-fit` parent has grow 1 and no
  // slack — which is why proving a guard bites here needs a real layout engine
  // rather than a style assertion.
  //
  // Applied to the painted DOM of an ALREADY-MOUNTED primitive, which is the
  // shape of the fault in the app too: a framing variant swaps, a wrapper's class
  // flips, contributions arrive in a later plugin wave. So it falsifies the
  // SCHEDULE of a premise check as much as its existence — a primitive that asks
  // its host once at mount passes this mutation, and one that re-asks when the
  // room narrows does not.
  | { kind: "shrinkWrapHost" }
  // Set `position: static` on the fixture's {@link HOST_MARKER_ATTR} box: the
  // host stops being the containing block its absolutely-positioned children are
  // placed against.
  //
  // The falsification for every coordinate primitive. A placed box says
  // `left: 70%`; what that resolves to is decided by an ancestor the box never
  // names, and losing that ancestor is silent in a way no other layout fault is —
  // there is no error, no overflow warning, and no class on the child changes.
  // The offsets simply re-resolve against whatever positioned box is further up,
  // so the children keep their relative arrangement and drift together into a
  // bigger coordinate space. Nothing about the child's own declaration says which
  // box it landed in, which is exactly why only a real layout engine can tell.
  //
  // For it to bite, the fixture's host must be genuinely SMALLER than (and
  // inset within) the harness's own `position: relative` width wrapper — the
  // next positioned ancestor. A host that fills the wrapper would re-resolve to
  // the same numbers and the mutation would prove nothing.
  | { kind: "unpositionHost" };

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
