import { Frame } from "@plugins/primitives/plugins/css/plugins/frame/web";
import type { LayoutFixture } from "@plugins/primitives/plugins/css/plugins/layout-harness/core";
import { TruncatingText } from "@plugins/primitives/plugins/css/plugins/truncating-text/web";

// The menu-indicator-over-label overlap shape (the SelectItem / DropdownMenu
// indicator): a long menu label with a trailing checkmark indicator.
//
// THE STRUCTURAL FIX routes the indicator through a real RIGID, IN-FLOW track
// (`Frame`'s `trailing` `auto` column), so it reserves actual space the grid
// honors: the label's `content` track shrinks to leave room, its `TruncatingText`
// ellipsizes BEFORE reaching the indicator, and the two never collide.
//
// THE OLD BROKEN CONSTRUCT floated the checkmark `absolute` (a `Pin`) over the
// row and reserved space only with row padding — a hint the flexible `flex-1`
// label could ignore, so a long label slid UNDER the indicator. `Pin` is
// `position:absolute`, so it occupies NO grid flow; that is exactly the fault.
// The `swapLeafDisplay:"absolute-pad"` falsification reproduces it — it pulls the
// indicator out of flow (absolute, fixed right offset) and forces the label to
// its full width — and asserts `noOverlap` is then VIOLATED (the measured label
// box overruns the indicator box). Proof the rigid track is load-bearing.
//
// The fixture wraps the row in its own `data-geo="container"` `relative` div so
// the mutation's absolute indicator resolves against a stable positioning
// context.
//
// JSX lives in this `.tsx` internal file; the `fixtures/index.ts` barrel
// re-exports the default (codegen scans `fixtures/index.ts` for the default
// export, and TypeScript forbids JSX in a `.ts` file).
export const pinFixtures: LayoutFixture[] = [
  {
    id: "pin/menu-indicator-over-label",
    primitive: "pin",
    dims: { contentLen: "long", withMeta: false, state: "idle" },
    widths: [120, 160, 200, 280],
    render: () => (
      <div data-geo="container" style={{ position: "relative" }}>
        <Frame
          content={
            <TruncatingText data-geo="content">
              a/very/long/menu/item/label/that/should/ellipsize
            </TruncatingText>
          }
          trailing={<span data-geo="indicator">✓</span>}
        />
      </div>
    ),
    invariants: [
      { kind: "noOverlap" },
      { kind: "noClip" },
      {
        kind: "falsification",
        mutate: { kind: "swapLeafDisplay", value: "absolute-pad" },
        expectViolated: { kind: "noOverlap" },
      },
    ],
  },
];
