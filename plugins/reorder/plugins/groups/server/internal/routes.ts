import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import {
  createGroup as createGroupEndpoint,
  patchGroup as patchGroupEndpoint,
  deleteGroup as deleteGroupEndpoint,
  addMembers as addMembersEndpoint,
  removeMemberEndpoint,
} from "../../core/endpoints";
import {
  addMembersToGroup,
  createGroup,
  deleteGroup,
  removeMember,
  updateGroup,
} from "./repo";

export const handleCreateGroup = implement(
  createGroupEndpoint,
  async ({ params, body }) => {
    const { id } = await createGroup({ slotId: params.slotId, ...body });
    return { id };
  },
);

export const handlePatchGroup = implement(
  patchGroupEndpoint,
  async ({ params, body }) => {
    const { slotId, ...patch } = body;
    const ok = await updateGroup(params.id, slotId, patch);
    if (!ok) throw new HttpError(404, "Not found");
  },
);

export const handleDeleteGroup = implement(
  deleteGroupEndpoint,
  async ({ params, body }) => {
    const ok = await deleteGroup(params.id, body.slotId);
    if (!ok) throw new HttpError(404, "Not found");
  },
);

export const handleAddMembers = implement(
  addMembersEndpoint,
  async ({ params, body }) => {
    await addMembersToGroup(params.id, body.slotId, body.contributionIds);
  },
);

export const handleRemoveMember = implement(
  removeMemberEndpoint,
  async ({ params }) => {
    const ok = await removeMember(params.slotId, params.contributionId);
    if (!ok) throw new HttpError(404, "Not a member of any group");
  },
);
