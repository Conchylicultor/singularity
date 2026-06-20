import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  ToggleChip,
  SegmentedControl,
  type ToggleChipProps,
  type ToggleChipVariant,
  type SegmentedControlProps,
  type SegmentedOption,
} from "./internal/toggle-chip";

export default {
  description:
    "Toggle-chip control: a stateful solid/ghost pill (composes Badge) with active state, button-height matching, polymorphic `as`, plus a SegmentedControl single-select group helper.",
  contributions: [],
} satisfies PluginDefinition;
