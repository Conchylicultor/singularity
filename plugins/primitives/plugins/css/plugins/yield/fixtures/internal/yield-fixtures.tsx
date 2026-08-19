import type { LayoutFixture } from "@plugins/primitives/plugins/css/plugins/layout-harness/core";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { yieldClass } from "@plugins/primitives/plugins/css/plugins/yield/web";

// The collapsible-card row: a summary and an aside sharing one single-line row,
// where BOTH must fall below their content width and NEITHER may take the row's
// slack. Three files documented this shape in prose (`collapsible-card.tsx`,
// `workflow-tool-view.tsx`, `breadcrumb.tsx`) before it had a name; this is that
// prose as a gate.
//
// What is asserted is a claim about the shrink hierarchy, not about classes: as
// the row narrows, the two cells give up characters TOGETHER
// (`truncatesTogether`), because both are content-sized (basis `auto`) and the
// engine shares the deficit between them in proportion to their content.
//
// The falsification is the mistake itself. `swapSlotRole` re-declares the aside
// cell as `fill` — what an author reaches for when the only named yielding cell
// is `<Fill>` — and `flex-1`'s basis ZERO then resolves that cell to 0 and hands
// the summary (basis `auto`) its full content width. The aside is squeezed
// alone, so at a width where the summary comfortably fits, the two slots
// disagree and `truncatesTogether` fails. A style assertion cannot see this:
// both roles carry `min-width: 0`, and only a real layout engine across a width
// sweep separates the basis.
//
// **Which boxes carry which marker.** The `*-cell` spans are the space-sharing
// cells and so are what the mutation re-declares; the `<Text>` leaves inside
// them are what actually ellipsizes, and `truncates` is `scrollWidth >
// clientWidth`, which only a box with real overflow reports — so the leaves are
// what `truncatesTogether` names. The summary is deliberately much shorter than
// the aside: the falsification needs a width at which the summary alone would
// fit, which is exactly where a basis-0 sibling starves.
//
// JSX lives in this `.tsx` internal file; `fixtures/index.ts` re-exports the
// default (codegen scans that barrel, and TypeScript forbids JSX in a `.ts`).
export const yieldFixtures: LayoutFixture[] = [
  {
    id: "yield/siblings-yield-together",
    primitive: "yield",
    dims: { contentLen: "long", withMeta: true, state: "idle" },
    widths: [240, 320, 400, 480],
    render: () => (
      <Line className="gap-sm">
        <span data-geo="summary-cell" className={yieldClass("x")}>
          <Text data-geo="summary">Ran the workflow</Text>
        </span>
        <span data-geo="aside-cell" className={yieldClass("x")}>
          <Text data-geo="aside" side="start">
            plugins/primitives/plugins/css/plugins/yield/web/internal/yield.ts
          </Text>
        </span>
      </Line>
    ),
    invariants: [
      { kind: "noClip" },
      { kind: "truncatesTogether", slots: ["summary", "aside"] },
      {
        kind: "falsification",
        mutate: { kind: "swapSlotRole", slot: "aside-cell", role: "fill" },
        expectViolated: {
          kind: "truncatesTogether",
          slots: ["summary", "aside"],
        },
      },
    ],
  },
];
