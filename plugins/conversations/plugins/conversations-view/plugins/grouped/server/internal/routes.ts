import { z } from "zod";
import {
  addMembersToGroup,
  createGroupWithMembers,
  deleteGroup,
  removeMember,
  updateGroup,
} from "./repo";
import { RankSchema } from "@plugins/primitives/plugins/rank/core";

const CreateBody = z.object({
  title: z.string().optional(),
  conversationIds: z.array(z.string().min(1)).min(1),
});

export async function handleCreateGroup(req: Request): Promise<Response> {
  const body = CreateBody.parse(await req.json());
  const { id } = await createGroupWithMembers(body);
  return Response.json({ id });
}

const PatchBody = z.object({
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
  const patch = PatchBody.parse(await req.json());
  const ok = await updateGroup(id, patch);
  if (!ok) return new Response("Not found", { status: 404 });
  return Response.json({ ok: true });
}

export async function handleDeleteGroup(
  _req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const id = params.id;
  if (!id) return new Response("Missing id", { status: 400 });
  const ok = await deleteGroup(id);
  if (!ok) return new Response("Not found", { status: 404 });
  return Response.json({ ok: true });
}

const AddMembersBody = z.object({
  conversationIds: z.array(z.string().min(1)).min(1),
});

export async function handleAddMember(
  req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const id = params.id;
  if (!id) return new Response("Missing id", { status: 400 });
  const { conversationIds } = AddMembersBody.parse(await req.json());
  await addMembersToGroup(id, conversationIds);
  return Response.json({ ok: true });
}

export async function handleRemoveMember(
  _req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const conversationId = params.conversationId;
  if (!conversationId) return new Response("Missing conversationId", { status: 400 });
  const ok = await removeMember(conversationId);
  if (!ok) return new Response("Not a member of any group", { status: 404 });
  return Response.json({ ok: true });
}
