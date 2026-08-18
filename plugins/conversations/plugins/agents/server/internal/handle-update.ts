import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { extractAttachmentIds } from "@plugins/primitives/plugins/text-editor/plugins/paste-images/core";
import { updateAgent } from "../../core/endpoints";
import { AgentSchema } from "../../core/schemas";
import { _agents } from "./tables";
import { agentAttachments } from "./tables-attachments";
import { agents } from "./views";
import { isAgentDescendant } from "./hierarchy";

export const handleUpdate = implement(updateAgent, async ({ params, body }) => {
  const id = params.id;
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof body.name === "string") patch.name = body.name;
  if (body.prompt === null || typeof body.prompt === "string") {
    patch.prompt = body.prompt;
  }
  if (body.model === null || typeof body.model === "string") {
    patch.model = body.model;
  }
  if (body.icon === null || typeof body.icon === "string") {
    patch.icon = body.icon;
  }
  if (body.iconColor === null || typeof body.iconColor === "string") {
    patch.iconColor = body.iconColor;
  }
  if (body.iconSvgNodes === null || typeof body.iconSvgNodes === "string") {
    patch.iconSvgNodes = body.iconSvgNodes;
  }
  if (body.parentId === null || typeof body.parentId === "string") {
    if (body.parentId === id) {
      throw new HttpError(400, "Cannot parent an agent to itself");
    }
    if (
      body.parentId !== null &&
      (await isAgentDescendant(id, body.parentId))
    ) {
      throw new HttpError(
        400,
        "Cannot parent an agent under its own descendant",
      );
    }
    patch.parentId = body.parentId;
  }
  const [updated] = await db
    .update(_agents)
    .set(patch)
    .where(eq(_agents.id, id))
    .returning({ id: _agents.id });
  if (!updated) throw new HttpError(404, "Not found");
  // No destination force-expand on a re-parent: expand/collapse is device-local
  // view state owned by the data-view primitive, not a column. `TreeList.
  // onDragEnd` opens a collapsed drop target client-side, and the destination
  // folder's `updatedAt` is not a fact about the folder.

  if (body.prompt === null || typeof body.prompt === "string") {
    const [{ prompt } = { prompt: null }] = await db
      .select({ prompt: _agents.prompt })
      .from(_agents)
      .where(eq(_agents.id, id))
      .limit(1);
    await agentAttachments.set(
      id,
      Array.from(extractAttachmentIds(prompt ?? "")),
    );
  }

  const [row] = await db
    .select()
    .from(agents)
    .where(eq(agents.id, id))
    .limit(1);
  if (!row) throw new HttpError(404, "Not found after update");
  return AgentSchema.parse(row);
});
