import { Clip } from "@plugins/primitives/plugins/css/plugins/clip/web";
import {
  pct,
  Placed,
} from "@plugins/primitives/plugins/css/plugins/coords/web";
import {
  HOST_MARKER_ATTR,
  type LayoutFixture,
} from "@plugins/primitives/plugins/css/plugins/layout-harness/core";

// How far the track is inset inside the harness's width wrapper. It is the
// falsification's whole margin: `unpositionHost` re-resolves the bars against
// the wrapper, and the bars only land outside the track because the track is
// narrower than — and offset within — the box they fall back to. Written as a
// number, in an inline style, so the fixture states the geometry it depends on
// instead of hiding it behind a spacing token that a density preset may move.
const TRACK_INSET_PX = 40;

// A Gantt row in miniature: three `%`-placed bars in a clipped track, which is
// the shape ~46 corpus sites hand-rolled. What is asserted is the claim the
// primitive actually makes — that a fraction of the TRACK is where the box
// lands, at every width — rather than anything about the classes it emits.
//
// The bars are `%` on x and `fill` on y, so nothing here has an intrinsic size:
// every measured edge is a function of the host's box alone. That is what makes
// the width sweep meaningful (a px-sized bar would report the same numbers at
// every width) and what makes the falsification total (lose the host and every
// edge moves at once).
//
// Widths sweep WIDE → NARROW, matching `shrinkWrapHost`'s requirement, so the
// mutations in this family stay orderable together.
export const coordsFixtures: LayoutFixture[] = [
  {
    id: "coords/percent-bars-in-track",
    primitive: "coords",
    dims: { contentLen: "short", withMeta: false, state: "idle" },
    widths: [520, 440, 360, 280],
    render: () => (
      <div
        style={{ paddingLeft: TRACK_INSET_PX, paddingRight: TRACK_INSET_PX }}
      >
        {/* The coordinate host: an in-flow clipped track. It carries
            `data-geo="container"` so `noClip` is judged against the TRACK (the
            box the fractions are of), not the harness's width wrapper, and
            `data-geo-host` so `unpositionHost` knows which box to unposition. */}
        <Clip
          data-geo="container"
          {...{ [HOST_MARKER_ATTR]: "" }}
          className="bg-muted relative h-8 rounded-sm"
        >
          <Placed
            data-geo="bar-a"
            x={{ start: pct(0.05), size: pct(0.2) }}
            y="fill"
            className="bg-primary"
          />
          <Placed
            data-geo="bar-b"
            x={{ start: pct(0.35), size: pct(0.2) }}
            y="fill"
            className="bg-secondary"
          />
          <Placed
            data-geo="bar-c"
            x={{ start: pct(0.7), size: pct(0.28) }}
            y="fill"
            className="bg-accent"
          />
        </Clip>
      </div>
    ),
    invariants: [
      // Every bar stays inside the track it is a fraction OF — at 5%/35%/70%
      // starts with 20%/20%/28% widths, the rightmost ends at 98%, so any
      // resolution against a different box overruns.
      { kind: "noClip" },
      // The bars are laid out so their fractions cannot collide at any width;
      // if two boxes ever touch, the percentages resolved against something
      // other than a shared coordinate space.
      { kind: "noOverlap" },
      {
        kind: "falsification",
        mutate: { kind: "unpositionHost" },
        expectViolated: { kind: "noClip" },
      },
    ],
  },
];
