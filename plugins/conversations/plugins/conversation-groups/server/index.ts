import type { ServerPluginDefinition } from "@server/types";
import { conversationGroupsResource } from "./internal/resource";
import {
  handleAddMember,
  handleCreateGroup,
  handleDeleteGroup,
  handlePatchGroup,
  handleRemoveMember,
} from "./internal/routes";

export { _conversationGroups, _conversationGroupMembers } from "./internal/tables";
export { conversationGroupsResource } from "./internal/resource";
export { addMemberToGroup } from "./internal/repo";

export default {
  id: "conversation-groups",
  name: "Conversation Groups",
  description:
    "User-defined groups in the conversation sidebar list — drag a conversation onto another to create a group; drag onto a group to join.",
  httpRoutes: {
    "POST /api/conversation-groups": handleCreateGroup,
    "PATCH /api/conversation-groups/:id": handlePatchGroup,
    "DELETE /api/conversation-groups/:id": handleDeleteGroup,
    "POST /api/conversation-groups/:id/members": handleAddMember,
    "DELETE /api/conversation-groups/members/:conversationId": handleRemoveMember,
  },
  resources: [conversationGroupsResource],
} satisfies ServerPluginDefinition;
