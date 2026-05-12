import type { PluginDefinition } from "@core";
import "./styles.css";

export { Reorder } from "./internal/reorder";
export { setEditMode, useEditMode } from "./internal/edit-mode-store";
export type { ReorderableSlot, ReorderConfig } from "./internal/area";
export type {
  GroupEntry,
  HostOverride,
  ReorderGroup,
  SpacerItem,
  TopLevelEntry,
  UseAreaResult,
} from "./internal/use-area";
export {
  isGroupEntry,
  isSpacer,
  itemKey,
  SPACER_PREFIX,
} from "./internal/use-area";

export default {
  id: "reorder",
  name: "Reorder",
  description:
    "Generic reorder primitive. Slot owners opt in via Reorder.area; hosts render with Reorder.useArea.",
  loadBearing: true,
  contributions: [],
} satisfies PluginDefinition;
