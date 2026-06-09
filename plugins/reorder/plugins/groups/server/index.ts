import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { reorderGroupsResource } from "./internal/resource";
import {
  handleAddMembers,
  handleCreateGroup,
  handleDeleteGroup,
  handlePatchGroup,
  handleRemoveMember,
} from "./internal/routes";
import {
  createGroup,
  patchGroup,
  deleteGroup,
  addMembers,
  removeMemberEndpoint,
} from "../core/endpoints";

export { _reorderGroups, _reorderGroupMembers } from "./internal/tables";
export { reorderGroupsResource } from "./internal/resource";

export default {
  description:
    "User-created groups within reorderable areas. Drag items onto each other to form groups.",
  contributions: [Resource.Declare(reorderGroupsResource)],
  httpRoutes: {
    [createGroup.route]: handleCreateGroup,
    [patchGroup.route]: handlePatchGroup,
    [deleteGroup.route]: handleDeleteGroup,
    [addMembers.route]: handleAddMembers,
    [removeMemberEndpoint.route]: handleRemoveMember,
  },
} satisfies ServerPluginDefinition;
