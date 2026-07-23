import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { createTask } from "@plugins/tasks/plugins/tasks-core/server";
import { setTaskCategory } from "@plugins/tasks/plugins/task-category/server";
import { createConversation } from "@plugins/conversations/server";
import {
  DEFAULT_MODEL,
  normalizeModel,
} from "@plugins/conversations/plugins/model-provider/core";
import { launchAgent } from "../../core/endpoints";
import { _agent_launches } from "./tables";
import { agents } from "./views";

function formatLaunchTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

export const handleLaunch = implement(launchAgent, async ({ params, body }) => {
  const agentId = params.id;

  const [agent] = await db
    .select()
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!agent) throw new HttpError(404, "Not found");
  if (!agent.prompt) {
    throw new HttpError(400, "Agent has no prompt (folder node)");
  }

  // body.model is a validated ConversationModel (strict enum) — use it as-is.
  // Only the stored agent.model fallback (a DB value that may hold a legacy id)
  // goes through normalizeModel.
  const model = body.model ?? normalizeModel(agent.model ?? DEFAULT_MODEL);

  const now = new Date();
  const task = await createTask({
    title: `Agent-${agent.name}-${formatLaunchTime(now)}`,
    author: "agents-plugin",
  });
  await setTaskCategory(task.id, "agents");

  const conversation = await createConversation({
    taskId: task.id,
    prompt: agent.prompt,
    model,
    spawnedBy: "agents-plugin",
    kind: "agent",
  });

  const launchId = `launch-${Math.floor(Date.now() / 1000)}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;
  await db.insert(_agent_launches).values({ id: launchId, agentId, taskId: task.id });

  return {
    launchId,
    taskId: task.id,
    conversationId: conversation.id,
  };
});
