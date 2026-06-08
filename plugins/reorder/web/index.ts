import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import {
  registerSlotItemMiddleware,
  registerSlotListMiddleware,
} from "@plugins/primitives/plugins/slot-render/web";
import { ReorderListMiddleware } from "./internal/dnd-list-middleware";
import { ReorderItemMiddleware } from "./internal/dnd-item-middleware";
import { reorderConfigContributions } from "./internal/config-registrations";
import "./styles.css";

export {
  getEditMode,
  setEditMode,
  useEditMode,
} from "./internal/edit-mode-store";

export default {
  name: "Reorder",
  description:
    "Generic reorder primitive. Slots opt in via defineRenderSlot reorder config; DnD is automatic via middleware.",
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
  // identity matters — both import the shared `descriptors` map).
  contributions: reorderConfigContributions,
} satisfies PluginDefinition;
