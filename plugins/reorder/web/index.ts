import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import {
  registerSlotItemMiddleware,
  registerSlotListMiddleware,
} from "@plugins/primitives/plugins/slot-render/web";
import { Staging } from "@plugins/config_v2/plugins/staging/web";
import { ReorderListMiddleware } from "./internal/dnd-list-middleware";
import { ReorderItemMiddleware } from "./internal/dnd-item-middleware";
import { reorderConfigContributions } from "./internal/config-registrations";
import { reorderDescriptorEntries } from "./internal/descriptors";
import { ReorderDiffRenderer } from "./components/reorder-diff-renderer";
import "./styles.css";

export {
  getEditMode,
  setEditMode,
  useEditMode,
} from "./internal/edit-mode-store";
export {
  getReorderScope,
  setReorderScope,
  useReorderScope,
} from "./internal/scope-store";
export type { ReorderScope } from "./internal/scope-store";
export { diffReorderTrees } from "./internal/diff";
export type {
  ReorderDiffEntry,
  ReorderTreesDiff,
} from "./internal/diff";
export { ReorderLayoutContext } from "./internal/reorder-layout";
export type { ReorderLayout } from "./internal/reorder-layout";

export default {
  description:
    "Generic reorder primitive: every defineRenderSlot is unconditionally reorderable; use defineMountSlot for headless slots. DnD is automatic via middleware.",
  loadBearing: true,
  register: [
    {
      register() {
        registerSlotListMiddleware({
          priority: 0,
          Component: ReorderListMiddleware,
        });
        registerSlotItemMiddleware({
          priority: 50,
          Component: ReorderItemMiddleware,
        });
      },
    },
  ],
  // One config_v2 directive per reorderable slot, registered under the slot's
  // DEFINING plugin (via `pluginId`). The descriptor instances are the
  // SAME objects the middleware passes to `useConfig`/`useSetConfig` (reference
  // identity matters — both import the shared `descriptors` map). Plus reorder's
  // rich diff renderer for the generic config_v2 staging review section: it
  // claims every reorderable slot key and renders the moved/shown/hidden diff.
  contributions: [
    ...reorderConfigContributions,
    Staging.DiffRenderer({
      match: ({ configName }) =>
        reorderDescriptorEntries.some((e) => e.slotId === configName),
      component: ReorderDiffRenderer,
    }),
  ],
} satisfies PluginDefinition;
