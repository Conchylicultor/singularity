import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import {
  createConversationGroup,
  patchConversationGroup,
  deleteConversationGroup,
  addConversationGroupMembers,
  removeConversationGroupMember,
  moveConversationGroupMember,
} from "../../core/endpoints";
import {
  addMembersToGroup,
  createGroupWithMembers,
  deleteGroup,
  moveMember,
  removeMember,
  updateGroup,
} from "./repo";

export const handleCreateGroup = implement(createConversationGroup, async ({ body }) => {
  const { id } = await createGroupWithMembers(body);
  return { id };
});

export const handlePatchGroup = implement(patchConversationGroup, async ({ params, body }) => {
  const ok = await updateGroup(params.id, body);
  if (!ok) throw new HttpError(404, "Not found");
});

export const handleDeleteGroup = implement(deleteConversationGroup, async ({ params }) => {
  const ok = await deleteGroup(params.id);
  if (!ok) throw new HttpError(404, "Not found");
});

export const handleAddMember = implement(addConversationGroupMembers, async ({ params, body }) => {
  await addMembersToGroup(params.id, body.conversationIds);
});

export const handleRemoveMember = implement(removeConversationGroupMember, async ({ params }) => {
  const ok = await removeMember(params.conversationId);
  if (!ok) throw new HttpError(404, "Not a member of any group");
});

export const handleMoveMember = implement(moveConversationGroupMember, async ({ params, body }) => {
  const result = await moveMember(params.conversationId, body.targetId, body.zone);
  if (result.ok) return;
  if (result.reason === "target-not-a-member") {
    throw new HttpError(404, `Target ${body.targetId} is not a member of any group`);
  }
  throw new HttpError(409, `Cannot place ${params.conversationId} ${body.zone} ${body.targetId}`);
});
