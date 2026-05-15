import { eq, desc, asc, and } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { _workflowDefinitions, _workflowExecutions, _workflowExecutionSteps } from "./tables";
import {
  createDefinition,
  updateDefinition,
  deleteDefinition,
  createExecution,
  cancelExecution,
} from "./mutations";
import {
  serializeDefinition,
  serializeExecution,
} from "./resources";
import { workflowRunJob } from "./run-job";
import { userInputSubmitted } from "./tables-events";

// ─── Definitions ──────────────────────────────────────────

export async function handleListDefinitions(_req: Request): Promise<Response> {
  const rows = await db
    .select()
    .from(_workflowDefinitions)
    .orderBy(desc(_workflowDefinitions.createdAt));
  return Response.json(rows.map(serializeDefinition));
}

export async function handleCreateDefinition(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    description?: string;
    steps?: unknown[];
  };
  if (!body.name) {
    return Response.json({ error: "name is required" }, { status: 400 });
  }
  const row = await createDefinition({
    name: body.name,
    description: body.description,
    steps: body.steps as Parameters<typeof createDefinition>[0]["steps"],
  });
  return Response.json(serializeDefinition(row), { status: 201 });
}

export async function handleGetDefinition(
  _req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const [row] = await db
    .select()
    .from(_workflowDefinitions)
    .where(eq(_workflowDefinitions.id, params.id));
  if (!row) return new Response("Not found", { status: 404 });
  return Response.json(serializeDefinition(row));
}

export async function handleUpdateDefinition(
  req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    description?: string | null;
    steps?: unknown[];
  };
  const row = await updateDefinition(params.id, {
    name: body.name,
    description: body.description,
    steps: body.steps as Parameters<typeof updateDefinition>[1]["steps"],
  });
  if (!row) return new Response("Not found", { status: 404 });
  return Response.json(serializeDefinition(row));
}

export async function handleDeleteDefinition(
  _req: Request,
  params: Record<string, string>,
): Promise<Response> {
  await deleteDefinition(params.id);
  return new Response(null, { status: 204 });
}

// ─── Executions ───────────────────────────────────────────

export async function handleListExecutions(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const definitionId = url.searchParams.get("definitionId");

  const executions = await db
    .select()
    .from(_workflowExecutions)
    .where(
      definitionId
        ? eq(_workflowExecutions.definitionId, definitionId)
        : undefined,
    )
    .orderBy(desc(_workflowExecutions.createdAt));

  if (executions.length === 0) return Response.json([]);

  const execIds = executions.map((e) => e.id);
  const allSteps = await db
    .select()
    .from(_workflowExecutionSteps)
    .orderBy(asc(_workflowExecutionSteps.stepIndex));

  const stepsByExec = new Map<string, (typeof _workflowExecutionSteps.$inferSelect)[]>();
  for (const step of allSteps) {
    if (!execIds.includes(step.executionId)) continue;
    const list = stepsByExec.get(step.executionId) ?? [];
    list.push(step);
    stepsByExec.set(step.executionId, list);
  }

  return Response.json(
    executions.map((exec) => serializeExecution(exec, stepsByExec.get(exec.id) ?? [])),
  );
}

export async function handleCreateExecution(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as {
    definitionId?: string;
  };
  if (!body.definitionId) {
    return Response.json({ error: "definitionId is required" }, { status: 400 });
  }
  let execution;
  try {
    execution = await createExecution(body.definitionId);
  } catch (err) {
    if (err instanceof Error && err.message.includes("not found")) {
      return Response.json({ error: err.message }, { status: 404 });
    }
    throw err;
  }

  await workflowRunJob.enqueue(
    { executionId: execution.id },
    { jobKey: execution.id },
  );

  const steps = await db
    .select()
    .from(_workflowExecutionSteps)
    .where(eq(_workflowExecutionSteps.executionId, execution.id))
    .orderBy(asc(_workflowExecutionSteps.stepIndex));

  return Response.json(serializeExecution(execution, steps), { status: 201 });
}

export async function handleGetExecution(
  _req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const [execution] = await db
    .select()
    .from(_workflowExecutions)
    .where(eq(_workflowExecutions.id, params.id));
  if (!execution) return new Response("Not found", { status: 404 });

  const steps = await db
    .select()
    .from(_workflowExecutionSteps)
    .where(eq(_workflowExecutionSteps.executionId, params.id))
    .orderBy(asc(_workflowExecutionSteps.stepIndex));

  return Response.json(serializeExecution(execution, steps));
}

export async function handleDeleteExecution(
  _req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const row = await cancelExecution(params.id);
  if (!row) return new Response("Not found", { status: 404 });
  return new Response(null, { status: 204 });
}

// ─── Submit ───────────────────────────────────────────────

export async function handleSubmitStep(
  req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as {
    data?: Record<string, unknown>;
  };

  const [execution] = await db
    .select()
    .from(_workflowExecutions)
    .where(eq(_workflowExecutions.id, params.execId));
  if (!execution) return new Response("Execution not found", { status: 404 });

  const [step] = await db
    .select()
    .from(_workflowExecutionSteps)
    .where(
      and(
        eq(_workflowExecutionSteps.id, params.stepId),
        eq(_workflowExecutionSteps.executionId, params.execId),
      ),
    );
  if (!step) return new Response("Step not found", { status: 404 });
  if (step.status !== "suspended") {
    return Response.json(
      { error: `Step status is "${step.status}", expected "suspended"` },
      { status: 409 },
    );
  }

  await userInputSubmitted.emit({
    executionId: params.execId,
    stepId: params.stepId,
    data: body.data ?? {},
  });

  return new Response(null, { status: 202 });
}
