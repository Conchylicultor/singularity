import { eq } from "drizzle-orm";
import { db } from "../../../../server/src/db/client";
import {
  _tasks,
  nextRankUnder,
  tasksResource,
} from "@plugins/tasks/server";
import { createConversation } from "@plugins/conversations/server";
import {
  ConversationModelSchema,
  type ConversationModel,
} from "@plugins/conversations/shared";
import { _agent_launches } from "./tables";
import { agents } from "./schema";
import { AGENTS_META_TASK_ID } from "./meta-agents";
import { agentLaunchesResource } from "./resources";

function formatLaunchTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

export async function handleLaunch(
  req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const agentId = params.id;
  if (!agentId) return new Response("Missing id", { status: 400 });

  const [agent] = await db
    .select()
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1);
  if (!agent) return new Response("Not found", { status: 404 });
  if (!agent.prompt) {
    return new Response("Agent has no prompt (folder node)", { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as { model?: string };
  const requestedModel =
    body.model ?? agent.model ?? undefined;
  const model: ConversationModel | undefined =
    requestedModel !== undefined
      ? ConversationModelSchema.parse(requestedModel)
      : undefined;

  const now = new Date();
  const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const rank = await nextRankUnder(AGENTS_META_TASK_ID);
  await db.insert(_tasks).values({
    id: taskId,
    parentId: AGENTS_META_TASK_ID,
    title: `Agent-${agent.name}-${formatLaunchTime(now)}`,
    author: "agents-plugin",
    rank,
  });
  // Expand the Agents meta task so the new row is visible in the tasks tree.
  await db
    .update(_tasks)
    .set({ expanded: true, updatedAt: new Date() })
    .where(eq(_tasks.id, AGENTS_META_TASK_ID));
  tasksResource.notify();

  const conversation = await createConversation({
    taskId,
    prompt: agent.prompt,
    model,
    spawnedBy: "agents-plugin",
  });

  const launchId = `launch-${Math.floor(Date.now() / 1000)}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;
  await db.insert(_agent_launches).values({ id: launchId, agentId, taskId });
  agentLaunchesResource.notify();

  return Response.json({
    launchId,
    taskId,
    conversationId: conversation.id,
  });
}
