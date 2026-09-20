import type { LayoutFixture } from "@plugins/primitives/plugins/css/plugins/layout-harness/core";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { rigidClass } from "@plugins/primitives/plugins/css/plugins/rigid/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { SingleLineProvider } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";

// A stand-in for a Material glyph, drawn so the two things it could be measured
// by are DIFFERENT: the element is 16×16, while the ink covers only y=4..20 of a
// 24-unit viewBox — the clear space every icon set leaves around its artwork. A
// check reading the element's box would therefore be reading something the eye
// never sees. The ink is centred in the viewBox, because the claim under test is
// about where the ROW puts this glyph, not about how the glyph is drawn.
function Glyph() {
  return (
    <svg
      data-geo="glyph"
      className={rigidClass()}
      width={16}
      height={16}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M5 4h14v16H5z" fill="currentColor" />
    </svg>
  );
}

// The silent-inline no-op regression: a single-line `<Text>` leaf rendered as the
// node child of a PLAIN BLOCK parent (not a flex/grid item). `truncate`
// (`overflow:hidden` + ellipsis) only takes effect on a box that establishes a
// block formatting context; on a plain inline span it silently no-ops and the text
// overflows. `Text`'s single-line recipe (`block w-fit max-w-full` alongside
// `min-w-0 truncate`) makes it honor overflow against the block parent in every
// context. The leaf truncates only inside a SingleLine context, so the fixture
// supplies one explicitly (what a line container does), then pins the leaf in a
// narrow block parent and asserts it stays inside the container (`noClip`). The
// falsification reproduces the old bare-`inline` construct via
// `swapLeafDisplay:"inline"` and asserts `noClip` is then VIOLATED — the leaf
// overflows its block parent (the historical bug).
//
// The harness wraps every fixture in `[data-geo="container"]` (the width wrapper),
// so the explicit block parent here is a plain `<div>` inside it; the `noClip`
// invariant measures the leaf against that container box.
//
// JSX lives in this `.tsx` internal file; the `fixtures/index.ts` barrel re-exports
// the default (codegen scans `fixtures/index.ts` for the default export, and
// TypeScript forbids JSX in a `.ts` file).
export const textFixtures: LayoutFixture[] = [
  {
    id: "text/block-parent-no-op",
    primitive: "text",
    dims: { contentLen: "long", withMeta: false, state: "idle" },
    widths: [120, 160, 200],
    render: () => (
      <SingleLineProvider value={true}>
        <div>
          <Text data-geo="content">
            a/very/long/file/path/that/should/ellipsize/against/the/block/parent.tsx
          </Text>
        </div>
      </SingleLineProvider>
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
  // THE canonical row — `Line > glyph + Fill(Text) + trailing mark` — the recipe
  // the css skill teaches and `rg '<Fill>\s*\n\s*<Text'` finds in 72 places.
  //
  // What it pins is VERTICAL, and until `opticalCenter` existed nothing in the
  // repo could state it: the glyph and the words must look centred on one line.
  // Every horizontal invariant is satisfied by the broken row — the boxes do not
  // overlap, nothing clips, the cell truncates on cue — because the fault is not
  // in any box's x, and not in any box's height either. `items-center` centres
  // the boxes exactly. It is the TEXT that is not in the middle of its own cell.
  //
  // The falsification is the construct this recipe was fixed BY, restored: the
  // single-line leaf as an `inline-block`. With `overflow: hidden` on it, its
  // baseline becomes its bottom margin edge, so the `Fill` around it must also
  // leave room for the strut's descent underneath — a cell ~6px taller than its
  // own text. The row then centres the glyph against that inflated cell and
  // drops it ~3px below the words. Restoring one display keyword is the whole
  // mutation, which is what makes a red result mean THIS and nothing else.
  {
    id: "text/row-glyph-and-words-on-one-line",
    primitive: "text",
    dims: { contentLen: "long", withMeta: true, state: "idle" },
    widths: [180, 260, 340],
    render: () => (
      <Line>
        <Glyph />
        <Fill>
          <Text data-geo="content" variant="body">
            Live subagent transcripts, and a title long enough to ellipsize
          </Text>
        </Fill>
        <span data-geo="mark" className={rigidClass()}>
          12
        </span>
      </Line>
    ),
    invariants: [
      { kind: "opticalCenter", slots: ["glyph", "content"] },
      { kind: "noOverlap" },
      {
        kind: "falsification",
        mutate: { kind: "swapLeafDisplay", value: "inline-block" },
        expectViolated: { kind: "opticalCenter", slots: ["glyph", "content"] },
      },
    ],
  },
];
