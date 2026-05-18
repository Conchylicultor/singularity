import type { ServerPluginDefinition } from "@server/types";
import { Resource } from "@server/resources";
import { conversationGroupsResource } from "./internal/resource";
import {
  handleAddMember,
  handleCreateGroup,
  handleDeleteGroup,
  handlePatchGroup,
  handleRemoveMember,
} from "./internal/routes";
import {
  createConversationGroup,
  patchConversationGroup,
  deleteConversationGroup,
  addConversationGroupMembers,
  removeConversationGroupMember,
} from "../shared/endpoints";

export { _conversationGroups, _conversationGroupMembers } from "./internal/tables";
export { conversationGroupsResource } from "./internal/resource";
export { addMemberToGroup } from "./internal/repo";

export default {
  id: "conversation-groups",
  name: "Conversation Groups",
  description:
    "User-defined groups in the conversation sidebar list — drag a conversation onto another to create a group; drag onto a group to join.",
  httpRoutes: {
    [createConversationGroup.route]:      handleCreateGroup,
    [patchConversationGroup.route]:       handlePatchGroup,
    [deleteConversationGroup.route]:      handleDeleteGroup,
    [addConversationGroupMembers.route]:  handleAddMember,
    [removeConversationGroupMember.route]: handleRemoveMember,
  },
  contributions: [Resource.Declare(conversationGroupsResource)],
} satisfies ServerPluginDefinition;
