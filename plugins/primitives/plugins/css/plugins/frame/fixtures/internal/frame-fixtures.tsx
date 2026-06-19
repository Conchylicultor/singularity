import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Frame } from "@plugins/primitives/plugins/css/plugins/frame/web";
import type { LayoutFixture } from "@plugins/primitives/plugins/css/plugins/layout-harness/core";
import { TruncatingText } from "@plugins/primitives/plugins/css/plugins/truncating-text/web";

// The canonical victim: the `CollapsibleCard` header's badge-over-file-path
// overlap, structurally fixed by `Frame`'s grid track function. This fixture
// pins a real `<Frame>` (leading/trailing badges + a content label + a long meta
// path) and asserts the full geometry contract the bespoke geometry test proved:
// no overlap / no clip, rigid badge clusters, content left-packed, trailing
// pinned right, and STRICT truncation priority (meta gives up space first). The
// falsification feeds the rejected weighted `3fr/1fr` template and asserts the
// strict-priority invariant is VIOLATED — proof the gate has teeth.
//
// JSX lives in this `.tsx` internal file; the `fixtures/index.ts` barrel
// re-exports the default (codegen scans `fixtures/index.ts` for the default
// export, and TypeScript forbids JSX in a `.ts` file).
export const frameFixtures: LayoutFixture[] = [
  {
    id: "frame/header-badge-over-path",
    primitive: "frame",
    dims: { contentLen: "long", withMeta: true, state: "idle" },
    widths: [240, 360, 480, 720, 900],
    render: () => (
      <Frame
        leading={
          <span data-geo="leading">
            <Badge>main</Badge>
          </span>
        }
        content={
          <TruncatingText data-geo="content">
            Refactor the frame primitive layout
          </TruncatingText>
        }
        meta={
          <TruncatingText data-geo="meta">
            src/primitives/css/frame/web/internal/frame.tsx
          </TruncatingText>
        }
        trailing={
          <span data-geo="trailing">
            <Badge>tool</Badge>
          </span>
        }
      />
    ),
    invariants: [
      { kind: "noOverlap" },
      { kind: "noClip" },
      { kind: "rigidIntegrity", slot: "leading" },
      { kind: "rigidIntegrity", slot: "trailing" },
      { kind: "leftPack", after: "leading", slot: "content", gap: 8 },
      { kind: "pinnedRight", slot: "trailing" },
      { kind: "neverTruncatesWhenRoomy", slots: ["content", "meta"] },
      { kind: "truncationOnsetOrder", first: "meta", last: "content" },
      {
        // The rejected weighted `3fr/1fr` split shares space PROPORTIONALLY:
        // `meta`'s small `fr` track is starved below its content width even in a
        // roomy row, so `meta` ellipsizes when it should not. That violates
        // `neverTruncatesWhenRoomy` (meta truncates at the WIDEST width) — the
        // genuine fault of the wrong template, and proof the gate has teeth. (The
        // strict-priority ONSET order still nominally holds for this template,
        // since meta truncates earliest of all; the roomy-truncation is the real
        // tell.)
        kind: "falsification",
        mutate: { kind: "templateOverride", value: "auto minmax(0,3fr) minmax(0,1fr) auto" },
        expectViolated: { kind: "neverTruncatesWhenRoomy", slots: ["content", "meta"] },
      },
    ],
  },
  {
    // The no-meta centering regression: a `leading | content | trailing` row with
    // NO `meta`. Without `Frame`'s inert flexible spacer the leftover width pools
    // into the rigid `auto` clusters and CENTERS `content` (and unpins `trailing`
    // from the right) — exactly what bit every `CollapsibleCard` without a file
    // path. The invariants assert the structural fix: `content` is left-packed one
    // gap after `leading`, `trailing` stays pinned right, the badge clusters keep
    // their measured width, and nothing overlaps or clips across the sweep.
    id: "frame/no-meta-centering",
    primitive: "frame",
    dims: { contentLen: "long", withMeta: false, state: "idle" },
    widths: [240, 360, 480, 720],
    render: () => (
      <Frame
        leading={
          <span data-geo="leading">
            <Badge>main</Badge>
          </span>
        }
        content={
          <TruncatingText data-geo="content">
            Refactor the frame primitive layout
          </TruncatingText>
        }
        trailing={
          <span data-geo="trailing">
            <Badge>tool</Badge>
          </span>
        }
      />
    ),
    invariants: [
      { kind: "noOverlap" },
      { kind: "noClip" },
      { kind: "rigidIntegrity", slot: "leading" },
      { kind: "rigidIntegrity", slot: "trailing" },
      { kind: "leftPack", after: "leading", slot: "content", gap: 8 },
      { kind: "pinnedRight", slot: "trailing" },
    ],
  },
];
