// The geometry vocabulary an exhibit declares and the layout harness measures:
// the state cell a fixture pins (`FixtureDims`), the invariants the oracle
// asserts (`GeometryInvariant`), the deliberate breaks a falsification applies
// (`FixtureMutation`), and the host marker those mutations find.
//
// Types-only leaf, split out of `layout-harness/core` so the exhibit catalog
// (`plugin-meta/exhibits`) can carry a `GeometrySpec` without depending on the
// harness, while the harness consumes the catalog — no cycle.

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

// ── Geometry invariants (the oracle's contract) ────────────────────
//
// Slot identity is the `data-geo` contract authored by the fixture — the oracle
// never references a primitive's internal class names, so it survives refactors
// of the primitive's mechanics. The ten kinds:
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
// - opticalCenter             the named slots' INK is centred on one line — the
//                             only VERTICAL kind. Every other one above is a
//                             claim about x; a row whose icon sits below its own
//                             words satisfies all of them.
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
  | { kind: "opticalCenter"; slots: string[]; epsilon?: number }
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
 * It lives here, in this shared core leaf, and not beside `RAIL_MARKER_ATTR` in the harness's own
 * `region-children.tsx`, because the two markers are authored by opposite sides.
 * The rail marker is the harness's wrapper around children the harness itself
 * supplies, so only harness code ever writes it; this one marks a box in the
 * FIXTURE's own tree, and a fixture reaches the harness only through core barrels. The
 * mutation reads it back through the same constant, so the box the fixture
 * marked and the box the mutation finds cannot drift apart.
 */
export const HOST_MARKER_ATTR = "data-geo-host";

// A deliberate break the falsification case applies to the rendered construct,
// proving the inner `expectViolated` invariant actually bites on the wrong shape.
export type FixtureMutation =
  | { kind: "templateOverride"; value: string } // force a wrong grid template
  // Re-declare the fixture's `[data-geo="content"]` leaf as a known-broken
  // construct. Each `value` names one historical shape of the single-line text
  // leaf, not a raw CSS display keyword:
  //
  //   "inline"        the leaf silently no-ops `overflow`, so it overflows its
  //                   block parent instead of ellipsizing → violates `noClip`.
  //   "absolute-pad"  the old menu-indicator shape, where a long label slides
  //                   UNDER an absolutely-placed indicator → violates `noOverlap`.
  //   "inline-block"  the leaf sinks its parent's line box. An inline-block whose
  //                   overflow is not `visible` takes its bottom margin edge as
  //                   its baseline, so the block parent must still fit the
  //                   strut's descent BELOW it — the cell comes out taller than
  //                   its own text, and a row centring on that cell drops every
  //                   sibling half the phantom space → violates `opticalCenter`.
  | { kind: "swapLeafDisplay"; value: string }
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

/**
 * What an exhibit declares to be geometry-gated: the state cell it pins and the
 * invariants the harness asserts against its per-width measurements.
 */
export interface GeometrySpec {
  dims: FixtureDims;
  invariants: GeometryInvariant[];
}
