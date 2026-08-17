import { createElement } from "react";
import {
  isRegionFixture,
  type HarnessFixture,
  type LayoutFixture,
  type RegionFixture,
} from "@plugins/primitives/plugins/css/plugins/layout-harness/core";
import { RegionChildren } from "./region-children";

// ── Region fixtures → layout fixtures ───────────────────────────────
//
// Pure sugar, and deliberately so: a `RegionFixture` becomes an ordinary
// `LayoutFixture` that renders the whole kit inside the region — ONE render, N
// measured slots — so every consumer downstream (the bun:test gate, the check
// that shells out to it, the Layout Lab gallery) keeps consuming exactly the
// shape it already consumed. The new fixture kind costs the three of them
// nothing but one call.
//
// The invariants are supplied here rather than by the fixture, which is the
// second half of "the child set is not authorable": a region can no more choose
// what is checked than what is rendered.

/** The invariants every region fixture is gated on. Not overridable. */
function regionInvariants(): LayoutFixture["invariants"] {
  return [
    // The contract itself: every child's content starts on the published rail.
    { kind: "railAlignment" },
    // The rail's other half. `rail-bleed` reaches back out to the region's edge,
    // and `noClip` is what says "back out to the EDGE" rather than past it — a
    // bleed that cancels more than the region applied overhangs, which is the
    // classic way a divider ends up 4px wider than its panel.
    { kind: "noClip" },
    // Proof the gate bites. The mutation re-publishes the rail as a different
    // number from below the region, leaving the children where the region put
    // them: only the claimed value moved, so an oracle that merely checked the
    // children agree with EACH OTHER would stay green. `railAlignment` must go
    // red. (The `bled-row` member re-reads the pair by design and un-bleeds
    // itself — it then lands off the claimed rail too, so it fails for the same
    // reason as its siblings rather than a different one.)
    {
      kind: "falsification",
      mutate: { kind: "railOverride", value: "0px" },
      expectViolated: { kind: "railAlignment" },
    },
    // Proof the gate bites on the DOUBLE-PAY, which is a different bug from the
    // one above and invisible to it. Forcing the debt back to the full rail
    // makes the `follower` member apply an inset the region already applied —
    // 24px becomes 48px, the exact regression `--rail-owed-*` exists to prevent
    // — while every inheriting sibling stays exactly where it was. So this
    // falsification can only be satisfied by the follower, and it fails loudly
    // ("falsification did not bite") the moment a region stops paying the debt
    // it publishes.
    {
      kind: "falsification",
      mutate: { kind: "railOwedOverride", value: "var(--rail-start)" },
      expectViolated: { kind: "railAlignment" },
    },
  ];
}

function expandOne(fixture: RegionFixture): LayoutFixture {
  return {
    id: fixture.id,
    primitive: fixture.primitive,
    // A region fixture pins no cell of the content × metadata × state matrix —
    // it sweeps the CHILD axis instead, which the matrix does not model. The
    // neutral cell keeps the gallery's grouping label honest rather than
    // inventing a dimension the fixture never chose.
    dims: { contentLen: "short", withMeta: false, state: "idle" },
    widths: fixture.widths,
    render: () => fixture.render(createElement(RegionChildren)),
    invariants: regionInvariants(),
  };
}

/**
 * Expand every `RegionFixture` in the catalog into a `LayoutFixture`, leaving
 * layout fixtures untouched. Call this once, immediately after `loadFixtures()`.
 */
export function expandRegionFixtures(
  fixtures: HarnessFixture[],
): LayoutFixture[] {
  return fixtures.map((f) => (isRegionFixture(f) ? expandOne(f) : f));
}
