import type { PluginDefinition } from "@core";

export { Reorder } from "./internal/reorder";
export { setEditMode, useEditMode } from "./internal/edit-mode-store";
export type { ReorderableSlot, ReorderConfig } from "./internal/area";
export type { HostOverride, UseAreaResult } from "./internal/use-area";

export default {
  id: "reorder",
  name: "Reorder",
  description:
    "Generic reorder primitive. Slot owners opt in via Reorder.area; hosts render with Reorder.useArea.",
  loadBearing: true,
  contributions: [],
} satisfies PluginDefinition;
