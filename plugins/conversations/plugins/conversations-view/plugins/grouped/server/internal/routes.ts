import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import {
  createConversationGroup,
  patchConversationGroup,
  deleteConversationGroup,
  addConversationGroupMembers,
  removeConversationGroupMember,
} from "../../shared/endpoints";
import {
  addMembersToGroup,
  createGroupWithMembers,
  deleteGroup,
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
  return { ok: true };
});

export const handleDeleteGroup = implement(deleteConversationGroup, async ({ params }) => {
  const ok = await deleteGroup(params.id);
  if (!ok) throw new HttpError(404, "Not found");
  return { ok: true };
});

export const handleAddMember = implement(addConversationGroupMembers, async ({ params, body }) => {
  await addMembersToGroup(params.id, body.conversationIds);
  return { ok: true };
});

export const handleRemoveMember = implement(removeConversationGroupMember, async ({ params }) => {
  const ok = await removeMember(params.conversationId);
  if (!ok) throw new HttpError(404, "Not a member of any group");
  return { ok: true };
});
