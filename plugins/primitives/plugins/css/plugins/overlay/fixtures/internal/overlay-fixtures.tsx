import type { LayoutFixture } from "@plugins/primitives/plugins/css/plugins/layout-harness/core";

// The former `overlay/control-in-unclipped-cell` fixture documented the `<Frame>`
// grid as the structural fix for a rigid control overflowing an unclipped flex
// cell. The `<Frame>` primitive has been removed, so that Frame-specific fixture
// was dropped — the overlay primitive currently contributes no geometry fixtures.
export const overlayFixtures: LayoutFixture[] = [];
