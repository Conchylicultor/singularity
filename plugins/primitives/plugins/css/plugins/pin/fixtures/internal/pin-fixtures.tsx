import type { LayoutFixture } from "@plugins/primitives/plugins/css/plugins/layout-harness/core";

// The former `pin/menu-indicator-over-label` fixture documented the `<Frame>`
// rigid `trailing` track as the structural fix for a menu indicator overlapping a
// long label (with an absolute-`Pin` falsification). The `<Frame>` primitive has
// been removed, so that Frame-specific fixture was dropped — the pin primitive
// currently contributes no geometry fixtures.
export const pinFixtures: LayoutFixture[] = [];
