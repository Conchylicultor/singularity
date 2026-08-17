import type { HarnessFixture } from "@plugins/primitives/plugins/css/plugins/layout-harness/core";
import { SectionCard } from "@plugins/primitives/plugins/section-card/web";

// ── The card body as a rail region ──────────────────────────────────
//
// A `SectionCard`'s body is `rail-x-lg`: it applies the inset AND publishes it,
// so a descendant that follows the rail (a DataView's bands, a `DataTable`'s
// rows) knows the card already paid. That one class carries two claims that fail
// in opposite directions, and only a fixture whose children it does not choose
// can hold both:
//
//   - **it stopped publishing.** Swap `rail-x-lg` back to `px-lg` and every
//     inheriting child still lands exactly where it does today — the padding is
//     unchanged. Nothing about the card looks different; what breaks is a
//     follower somewhere inside it, which now has no number to read. The
//     harness's `railAlignment` fails on an unpublished rail outright, so the
//     silent half becomes the loud half.
//   - **a follower inside started paying twice.** `rail-x-lg` sets
//     `--rail-owed-*` to `0px` because the owner paid; if that ever stops, the
//     `follower` member of `REGION_CHILDREN` insets itself a second time and
//     24px becomes 48px, while every inheriting sibling stays put. That is the
//     regression the whole owed pair exists to prevent, and the kit's follower
//     is what makes it visible here.
//
// Both are exactly why the card is a region owner in the first place: it is the
// host that insets a DataView, the shape `pane-gutter-flush` used to spell one
// wrapper at a time.
//
// Widths are two real detail-pane column widths rather than the panel roles —
// a card body's inset is a fixed step, so the sweep is checking the rail holds
// as the box around it changes, not that a role was picked.
export const sectionCardFixtures: HarnessFixture[] = [
  {
    kind: "region",
    id: "section-card/region",
    primitive: "section-card",
    widths: [320, 640],
    // `defaultOpen` because a collapsed card genuinely unmounts its body, and an
    // unmounted region publishes nothing to measure. The header is the card's
    // own chrome, outside the hole.
    render: (children) => (
      <SectionCard title="Dependencies" defaultOpen>
        {children}
      </SectionCard>
    ),
  },
];
