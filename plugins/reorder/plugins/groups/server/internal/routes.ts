import { z } from "zod";
import { RankSchema } from "@plugins/primitives/plugins/rank/core";
import {
  addMembersToGroup,
  createGroup,
  deleteGroup,
  removeMember,
  updateGroup,
} from "./repo";

const CreateBody = z.object({
  title: z.string().optional(),
  contributionIds: z.array(z.string().min(1)).optional(),
});

export async function handleCreateGroup(
  req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const slotId = params.slotId;
  if (!slotId) return new Response("Missing slotId", { status: 400 });
  const body = CreateBody.parse(await req.json());
  const { id } = await createGroup({ slotId, ...body });
  return Response.json({ id });
}

const PatchBody = z.object({
  slotId: z.string(),
  title: z.string().optional(),
  expanded: z.boolean().optional(),
  rank: RankSchema.optional(),
});

export async function handlePatchGroup(
  req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const id = params.id;
  if (!id) return new Response("Missing id", { status: 400 });
  const { slotId, ...patch } = PatchBody.parse(await req.json());
  const ok = await updateGroup(id, slotId, patch);
  if (!ok) return new Response("Not found", { status: 404 });
  return Response.json({ ok: true });
}

export async function handleDeleteGroup(
  req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const id = params.id;
  if (!id) return new Response("Missing id", { status: 400 });
  const body = z.object({ slotId: z.string() }).parse(await req.json());
  const ok = await deleteGroup(id, body.slotId);
  if (!ok) return new Response("Not found", { status: 404 });
  return Response.json({ ok: true });
}

const AddMembersBody = z.object({
  slotId: z.string(),
  contributionIds: z.array(z.string().min(1)).min(1),
});

export async function handleAddMembers(
  req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const id = params.id;
  if (!id) return new Response("Missing id", { status: 400 });
  const { slotId, contributionIds } = AddMembersBody.parse(await req.json());
  await addMembersToGroup(id, slotId, contributionIds);
  return Response.json({ ok: true });
}

export async function handleRemoveMember(
  _req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const slotId = params.slotId;
  const contributionId = params.contributionId;
  if (!slotId || !contributionId)
    return new Response("Missing params", { status: 400 });
  const ok = await removeMember(slotId, contributionId);
  if (!ok) return new Response("Not a member of any group", { status: 404 });
  return Response.json({ ok: true });
}
