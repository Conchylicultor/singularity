import type { ServerPluginDefinition } from "@server/types";
import { Resource } from "@server/resources";
import { reorderGroupsResource } from "./internal/resource";
import {
  handleAddMembers,
  handleCreateGroup,
  handleDeleteGroup,
  handlePatchGroup,
  handleRemoveMember,
} from "./internal/routes";

export { _reorderGroups, _reorderGroupMembers } from "./internal/tables";
export { reorderGroupsResource } from "./internal/resource";

export default {
  id: "reorder-groups",
  name: "Reorder Groups",
  description:
    "User-created groups within reorderable areas. Drag items onto each other to form groups.",
  contributions: [Resource.Declare(reorderGroupsResource)],
  httpRoutes: {
    "POST /api/reorder/:slotId/groups": handleCreateGroup,
    "PATCH /api/reorder/groups/:id": handlePatchGroup,
    "DELETE /api/reorder/groups/:id": handleDeleteGroup,
    "POST /api/reorder/groups/:id/members": handleAddMembers,
    "DELETE /api/reorder/:slotId/groups/members/:contributionId":
      handleRemoveMember,
  },
} satisfies ServerPluginDefinition;
