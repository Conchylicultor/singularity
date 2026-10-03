import { createElement, type ReactElement } from "react";
import type {
  FixtureDims,
  GeometryInvariant,
} from "@plugins/primitives/plugins/css/plugins/layout-harness/plugins/geometry/core";
import type {
  Exhibit,
  IsolatedExhibit,
  RegionExhibit,
} from "@plugins/plugin-meta/plugins/exhibits/core";
import { RegionChildren } from "./region-children";

// ── Catalog exhibits → what the harness measures ────────────────────
//
// The harness reads the ONE exhibit catalog (`plugin-meta/exhibits`) and
// measures two of its arms:
//
//   - an `isolated` exhibit that declares `geometry` — it authors its own
//     children and states the invariants they hold;
//   - every `isolated-region` exhibit — it authors a HOLE, and this module
//     fills it with the `REGION_CHILDREN` kit.
//
// An `app` exhibit is never measured, and never loaded here: its component is
// behind `load()`, which this module does not call, so the bare measurer page
// evaluates no app-runtime code. An `isolated` exhibit without `geometry` is a
// gallery-only exhibit and is skipped too.
//
// The region half is pure sugar, and deliberately so: a region becomes an
// ordinary measurable entry that renders the whole kit inside the region — ONE
// render, N measured slots — so the bun:test gate and the bare page consume one
// shape.
//
// The invariants are supplied here rather than by the exhibit, which is the
// second half of "the child set is not authorable": a region can no more choose
// what is checked than what is rendered.

/** One exhibit the harness measures: its render plus the geometry it asserts. */
export interface MeasurableExhibit {
  id: string;
  dims: FixtureDims;
  widths: readonly number[];
  render: () => ReactElement;
  invariants: GeometryInvariant[];
}

/** The invariants every region fixture is gated on. Not overridable. */
function regionInvariants(): GeometryInvariant[] {
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

function fromRegion(exhibit: RegionExhibit): MeasurableExhibit {
  return {
    id: exhibit.id,
    // A region pins no cell of the content × metadata × state matrix — it
    // sweeps the CHILD axis instead, which the matrix does not model. The
    // neutral cell keeps the label honest rather than inventing a dimension
    // the exhibit never chose.
    dims: { contentLen: "short", withMeta: false, state: "idle" },
    widths: exhibit.widths,
    render: () => exhibit.render(createElement(RegionChildren)),
    invariants: regionInvariants(),
  };
}

function fromIsolated(
  exhibit: IsolatedExhibit & {
    geometry: NonNullable<IsolatedExhibit["geometry"]>;
  },
): MeasurableExhibit {
  return {
    id: exhibit.id,
    dims: exhibit.geometry.dims,
    widths: exhibit.widths,
    render: exhibit.render,
    invariants: exhibit.geometry.invariants,
  };
}

/**
 * The geometry-gated subset of the catalog, as measurable entries: every
 * `isolated` exhibit with `geometry`, plus every `isolated-region` exhibit
 * (with the region kit and its fixed invariants filled in). Call this once,
 * immediately after `loadExhibits()`.
 */
export function measurableExhibits(
  exhibits: readonly Exhibit[],
): MeasurableExhibit[] {
  const out: MeasurableExhibit[] = [];
  const seen = new Set<string>();
  for (const e of exhibits) {
    // The catalog is not de-duplicated, so a clash reaches here. Two exhibits
    // under one id would measure as one (the page looks entries up by id), so
    // the second would be silently unmeasured — fail instead.
    if (e.runtime !== "app" && seen.has(e.id)) {
      throw new Error(
        `layout harness: two exhibits share the id "${e.id}" — exhibit ids must be unique`,
      );
    }
    seen.add(e.id);
    switch (e.runtime) {
      case "isolated":
        if (e.geometry !== undefined) {
          out.push(fromIsolated({ ...e, geometry: e.geometry }));
        }
        break;
      case "isolated-region":
        out.push(fromRegion(e));
        break;
      case "app":
        break;
    }
  }
  return out;
}
