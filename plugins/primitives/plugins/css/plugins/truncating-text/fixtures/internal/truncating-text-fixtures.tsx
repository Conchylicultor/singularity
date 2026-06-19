import type { LayoutFixture } from "@plugins/primitives/plugins/css/plugins/layout-harness/core";
import { TruncatingText } from "@plugins/primitives/plugins/css/plugins/truncating-text/web";

// The silent-inline no-op regression: a `<TruncatingText>` leaf rendered as the
// node child of a PLAIN BLOCK parent (not a flex/grid item). `truncate`
// (`overflow:hidden` + ellipsis) only takes effect on a box that establishes a
// block formatting context; on a plain inline span it silently no-ops and the
// text overflows. The leaf's fix (`inline-block max-w-full` alongside
// `min-w-0 truncate`) makes it honor overflow against the block parent in every
// context. This fixture pins the leaf in a narrow block parent and asserts the
// leaf stays inside the container (`noClip`); the falsification reproduces the
// old bare-`inline` construct via `swapLeafDisplay:"inline"` and asserts `noClip`
// is then VIOLATED — the leaf overflows its block parent (the historical bug).
//
// The harness wraps every fixture in `[data-geo="container"]` (the width
// wrapper), so the explicit block parent here is a plain `<div>` inside it; the
// `noClip` invariant measures the leaf against that container box.
//
// JSX lives in this `.tsx` internal file; the `fixtures/index.ts` barrel
// re-exports the default (codegen scans `fixtures/index.ts` for the default
// export, and TypeScript forbids JSX in a `.ts` file).
export const truncatingTextFixtures: LayoutFixture[] = [
  {
    id: "truncating-text/block-parent-no-op",
    primitive: "truncating-text",
    dims: { contentLen: "long", withMeta: false, state: "idle" },
    widths: [120, 160, 200],
    render: () => (
      <div>
        <TruncatingText data-geo="content">
          a/very/long/file/path/that/should/ellipsize/against/the/block/parent.tsx
        </TruncatingText>
      </div>
    ),
    invariants: [
      { kind: "noClip" },
      {
        kind: "falsification",
        mutate: { kind: "swapLeafDisplay", value: "inline" },
        expectViolated: { kind: "noClip" },
      },
    ],
  },
];
