import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { conversationGroupsResource } from "./internal/resource";
import {
  handleAddMember,
  handleCreateGroup,
  handleDeleteGroup,
  handleMoveMember,
  handlePatchGroup,
  handleRemoveMember,
} from "./internal/routes";
import {
  createConversationGroup,
  patchConversationGroup,
  deleteConversationGroup,
  addConversationGroupMembers,
  removeConversationGroupMember,
  moveConversationGroupMember,
} from "../core/endpoints";

export { _conversationGroups, _conversationGroupMembers } from "./internal/tables";
export { conversationGroupsResource } from "./internal/resource";
export { addMemberToGroup } from "./internal/repo";

export default {
  description:
    "User-defined groups in the conversation sidebar list — drag a conversation onto another to create a group; drag onto a group to join.",
  httpRoutes: {
    [createConversationGroup.route]:      handleCreateGroup,
    [patchConversationGroup.route]:       handlePatchGroup,
    [deleteConversationGroup.route]:      handleDeleteGroup,
    [addConversationGroupMembers.route]:  handleAddMember,
    [removeConversationGroupMember.route]: handleRemoveMember,
    [moveConversationGroupMember.route]:   handleMoveMember,
  },
  contributions: [Resource.Declare(conversationGroupsResource)],
} satisfies ServerPluginDefinition;
