import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  ToggleChip,
  SegmentedControl,
  type ToggleChipProps,
  type ToggleChipVariant,
  type ToggleChipSize,
  type SegmentedControlProps,
  type SegmentedOption,
} from "./internal/toggle-chip";

export default {
  name: "Toggle Chip",
  description:
    "Toggle-chip primitive: solid/ghost interactive pill with active state, optional icon and polymorphic `as`, plus a SegmentedControl single-select group helper.",
  contributions: [],
} satisfies PluginDefinition;
