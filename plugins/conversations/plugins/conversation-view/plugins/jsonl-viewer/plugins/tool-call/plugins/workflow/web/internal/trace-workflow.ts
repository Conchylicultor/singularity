// Trace-executes a Workflow script with mocked orchestration hooks to recover
// the agent DAG. The script's real control flow runs (loops, conditionals,
// .map), but agent()/parallel()/pipeline() record nodes instead of spawning
// agents and return placeholder handles. See handle.ts for the handle design.
//
// Safety: runs on the main thread inside try/catch. Hooks return real
// microtask-resolved Promises (no real async), so the whole AsyncFunction
// settles in a few ticks. An iteration tripwire (MAX_AGENTS/MAX_NODES) bounds
// result-driven infinite loops; any other throw falls back to meta-only.

import {
  extractDeps,
  makeHandle,
  resolveSentinels,
  type HandleEnv,
} from "./handle";
import { parseWorkflowMeta } from "./parse-workflow";
import type { Group, Phase, TracedGraph, TracedNode } from "./trace-types";

const MAX_AGENTS = 200;
const MAX_NODES = 64;
const MAX_PIPELINE_ITEMS = 6;
const BUDGET_TOTAL = 1_000_000;
const BUDGET_PER_AGENT = 100_000;
const PREVIEW_CHARS = 280;

/** Thrown internally when a cap is hit; caught to keep the partial graph. */
class TruncatedSignal extends Error {}

interface AgentOpts {
  label?: string;
  phase?: string;
  model?: string;
  agentType?: string;
  isolation?: string;
  schema?: unknown;
}

// No global `AsyncFunction` binding exists — derive it from an async function.
const AsyncFunction = Object.getPrototypeOf(async function () {})
  .constructor as new (
  ...args: string[]
) => (...args: unknown[]) => Promise<unknown>;

/** Strip the single leading `export` off `export const meta` so the body is a valid function body. */
function stripExportMeta(script: string): string {
  return script.replace(/export\s+const\s+meta\b/, "const meta");
}

function deriveLabel(prompt: string): string {
  const firstLine =
    prompt
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.length > 0) ?? "";
  const clipped = firstLine.slice(0, 48);
  return clipped.length < firstLine.length ? `${clipped}…` : clipped || "agent";
}

export async function traceWorkflow(
  script: string,
  args: unknown,
): Promise<TracedGraph | null> {
  const meta = parseWorkflowMeta(script);

  const nodes: TracedNode[] = [];
  const rawPrompts = new Map<string, string>();
  const groups: Group[] = [];
  const groupStack: Group[] = [];
  const phases: Phase[] = (meta?.phases ?? []).map((p) => ({
    title: p.title ?? "",
    detail: p.detail,
  }));
  const phaseSeen = new Set(phases.map((p) => p.title));

  let nodeSeq = 0;
  let groupSeq = 0;
  let agentCount = 0;
  let budgetSpent = 0;
  let dynamic = false;
  let truncated = false;
  let currentPhase: string | undefined;

  const env: HandleEnv = {
    markDynamic() {
      dynamic = true;
    },
  };

  function notePhase(title: string | undefined): void {
    if (!title || phaseSeen.has(title)) return;
    phaseSeen.add(title);
    phases.push({ title });
  }

  function makeGroup(kind: Group["kind"], stageIndex?: number): Group {
    const group: Group = {
      id: `g${groupSeq++}`,
      kind,
      parentGroupId: groupStack[groupStack.length - 1]?.id,
      stageIndex,
    };
    groups.push(group);
    return group;
  }

  function recordNode(
    kind: TracedNode["kind"],
    prompt: string,
    opts: AgentOpts | undefined,
  ): unknown {
    if (nodes.length >= MAX_NODES) {
      truncated = true;
      throw new TruncatedSignal();
    }
    const id = `n${nodeSeq++}`;
    const phase = opts?.phase ?? currentPhase;
    notePhase(phase);
    nodes.push({
      id,
      kind,
      label: opts?.label ?? deriveLabel(prompt),
      phase,
      model: opts?.model,
      agentType: opts?.agentType,
      isolation: opts?.isolation,
      hasSchema: opts?.schema != null,
      prompt, // resolved to «labels» after the run
      promptPreview: "",
      groupId: groupStack[groupStack.length - 1]?.id,
      deps: extractDeps(prompt),
    });
    rawPrompts.set(id, prompt);
    return makeHandle(id, env);
  }

  const agent = (prompt: unknown, opts?: AgentOpts): Promise<unknown> => {
    if (++agentCount > MAX_AGENTS) {
      truncated = true;
      throw new TruncatedSignal();
    }
    budgetSpent += BUDGET_PER_AGENT;
    return Promise.resolve(recordNode("agent", String(prompt ?? ""), opts));
  };

  const parallel = async (thunks: unknown): Promise<unknown[]> => {
    const list = Array.isArray(thunks) ? thunks : [];
    const group = makeGroup("parallel");
    groupStack.push(group);
    try {
      const results: unknown[] = [];
      for (const thunk of list) {
        results.push(typeof thunk === "function" ? await thunk() : thunk);
      }
      return results;
    } finally {
      groupStack.pop();
    }
  };

  const pipeline = async (
    items: unknown,
    ...stages: unknown[]
  ): Promise<unknown[]> => {
    let list: unknown[];
    if (Array.isArray(items)) {
      list = items.slice(0, MAX_PIPELINE_ITEMS);
      if (items.length > MAX_PIPELINE_ITEMS) dynamic = true;
    } else {
      // Unknown-size collection (e.g. a prior agent result) — trace one item.
      dynamic = true;
      list = [makeHandle("items", env)];
    }
    // A wrapper group binds the stages together; one stage group per column,
    // shared across items, so stages render as columns under the wrapper.
    const wrapper = makeGroup("pipeline");
    groupStack.push(wrapper);
    try {
      const stageGroups = stages.map((_s, i) => makeGroup("pipeline", i));
      const results: unknown[] = [];
      for (let i = 0; i < list.length; i++) {
        let prev: unknown = list[i];
        for (let s = 0; s < stages.length; s++) {
          const stage = stages[s];
          if (typeof stage !== "function") continue;
          groupStack.push(stageGroups[s]!);
          try {
            prev = await stage(prev, list[i], i);
          } finally {
            groupStack.pop();
          }
        }
        results.push(prev);
      }
      return results;
    } finally {
      groupStack.pop();
    }
  };

  const phase = (title: unknown): void => {
    currentPhase = title == null ? undefined : String(title);
    notePhase(currentPhase);
  };

  const log = (): void => {};

  const workflow = (name: unknown): Promise<unknown> =>
    Promise.resolve(
      recordNode("workflow", String(name ?? "workflow"), {
        label: String(name ?? "workflow"),
      }),
    );

  const budget = {
    total: BUDGET_TOTAL,
    spent: () => budgetSpent,
    remaining: () => Math.max(0, BUDGET_TOTAL - budgetSpent),
  };

  try {
    const body = stripExportMeta(script);
    const fn = new AsyncFunction(
      "agent",
      "parallel",
      "pipeline",
      "phase",
      "log",
      "args",
      "budget",
      "workflow",
      body,
    );
    await fn(agent, parallel, pipeline, phase, log, args, budget, workflow);
  } catch (err) {
    if (!(err instanceof TruncatedSignal)) {
      // Syntax error, runtime throw, or an unmodeled shape — fall back to meta.
      return null;
    }
    // Tripwire fired: keep the partial graph recorded so far.
  }

  // Resolve dependency sentinels to «labels» now that every node has a label.
  const labelOf = (id: string): string =>
    nodes.find((n) => n.id === id)?.label ?? id;
  for (const node of nodes) {
    const raw = rawPrompts.get(node.id) ?? node.prompt;
    node.prompt = resolveSentinels(raw, labelOf);
    const preview = node.prompt.replace(/\s+/g, " ").trim();
    node.promptPreview =
      preview.length > PREVIEW_CHARS
        ? `${preview.slice(0, PREVIEW_CHARS)}…`
        : preview;
  }

  // Drop phases that ended up with no nodes (e.g. declared meta phases beyond a
  // truncation point), but keep first-appearance order.
  const usedPhases = new Set(nodes.map((n) => n.phase));
  const keptPhases = phases.filter((p) => usedPhases.has(p.title));

  // Drop empty groups (no nodes and no child groups).
  const usedGroups = new Set(nodes.map((n) => n.groupId).filter(Boolean));
  const keptGroups = groups.filter(
    (g) =>
      usedGroups.has(g.id) ||
      groups.some((c) => c.parentGroupId === g.id && usedGroups.has(c.id)),
  );

  if (nodes.length === 0) return null;

  return {
    phases: keptPhases,
    nodes,
    groups: keptGroups,
    truncated,
    dynamic,
  };
}
