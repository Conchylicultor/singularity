import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Frame } from "@plugins/primitives/plugins/css/plugins/frame/web";
import type { LayoutFixture } from "@plugins/primitives/plugins/css/plugins/layout-harness/core";

// The second overlap bug shape: a RIGID control in a flexible cell with no clip.
// A `flex-1 min-w-0` cell holding a `shrink-0` child (a `SegmentedControl`, a
// fixed-width control) overflows onto the next sibling when the row narrows,
// because the flexible cell yields width the rigid child refuses to give back and
// nothing clips it. The structural fix is the `Frame` grid: a rigid control lives
// in a real track whose neighbour (`trailing`) sits in its own `auto` track, so
// the control can never slide onto the sibling — the collision is unrepresentable.
//
// This fixture documents that fixed behavior. We render the rigid control (a
// fixed-width `<Badge>` standing in for a `SegmentedControl` — a stateless
// `render()` can't drive `SegmentedControl`'s controlled value/onChange) as
// `content` and a `trailing` sibling, then assert `noOverlap` (content.right ≤
// trailing.left) and `noClip` across a narrowing sweep. There is NO falsification:
// the real `Frame` grid prevents the collision by construction, and neither
// available mutation (`templateOverride`, `swapLeafDisplay`) faithfully
// reproduces the historical "rigid child overflows an unclipped flex-1 cell"
// construct through the grid — so per the contract we omit it rather than invent
// an incoherent break.
//
// JSX lives in this `.tsx` internal file; the `fixtures/index.ts` barrel
// re-exports the default (codegen scans `fixtures/index.ts` for the default
// export, and TypeScript forbids JSX in a `.ts` file).
export const overlayFixtures: LayoutFixture[] = [
  {
    id: "overlay/control-in-unclipped-cell",
    primitive: "overlay",
    dims: { contentLen: "short", withMeta: false, state: "idle" },
    // Widths floored at the row's irreducible rigid minimum (the 96px control +
    // the trailing badge + gaps). Below it ANY layout overflows by definition —
    // the container is simply narrower than the un-shrinkable rigid cells — so a
    // narrower width would test the chosen widths, not the grid. The point of the
    // fixture is that the rigid control never slides ONTO its sibling once both
    // fit; 160px is the first width where they do.
    widths: [160, 200, 280],
    render: () => (
      <Frame
        content={
          <span data-geo="content" style={{ display: "inline-block", width: 96 }}>
            <Badge variant="primary">control</Badge>
          </span>
        }
        trailing={
          <span data-geo="trailing">
            <Badge>tool</Badge>
          </span>
        }
      />
    ),
    invariants: [{ kind: "noOverlap" }, { kind: "noClip" }],
  },
];
