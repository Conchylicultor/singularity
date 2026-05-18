import type { ServerPluginDefinition } from "@server/types";
import { Resource } from "@server/resources";
import { reorderPrefsResource } from "./internal/resource";
import {
  handleDeleteContribution,
  handleGetSlot,
  handlePatchSlot,
} from "./internal/handlers";
import { getSlot, patchSlot, deleteContribution } from "../shared/endpoints";

export { _reorderPrefs } from "./internal/tables";
export { reorderPrefsResource } from "./internal/resource";

export default {
  id: "reorder",
  name: "Reorder",
  description:
    "Generic reorder primitive: per-worktree storage of slot contribution ranks.",
  loadBearing: true,
  contributions: [Resource.Declare(reorderPrefsResource)],
  httpRoutes: {
    [getSlot.route]: handleGetSlot,
    [patchSlot.route]: handlePatchSlot,
    [deleteContribution.route]: handleDeleteContribution,
  },
} satisfies ServerPluginDefinition;
