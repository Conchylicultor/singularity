// Graph emitted by the workflow tracer (trace-workflow.ts) and consumed by the
// swimlane renderer. Built by trace-EXECUTING the script with mocked hooks, so
// node counts and dependency edges reflect the script's real control flow
// rather than a static parse.

export interface TracedNode {
  /** Stable id, also embedded in result-handle sentinels: "n0", "n1", … */
  id: string;
  /** `agent()` step vs a nested `workflow()` sub-step. */
  kind: "agent" | "workflow";
  /** opts.label, else derived from the prompt's first line. */
  label: string;
  /** Active phase at record time (opts.phase ?? the last `phase()` call). */
  phase?: string;
  model?: string;
  agentType?: string;
  isolation?: string;
  hasSchema: boolean;
  /** Full original prompt — shown in the node side pane. */
  prompt: string;
  /** Prompt with dependency sentinels rewritten to «label», truncated — for the card. */
  promptPreview: string;
  /** Concurrency group this node belongs to (parallel/pipeline), if any. */
  groupId?: string;
  /** Ids of upstream nodes whose results this node's prompt interpolates. */
  deps: string[];
}

export interface Group {
  id: string;
  kind: "parallel" | "pipeline";
  /** Enclosing group, for nested parallel/pipeline. */
  parentGroupId?: string;
  /** Pipeline stage column index. */
  stageIndex?: number;
}

export interface Phase {
  title: string;
  detail?: string;
}

export interface TracedGraph {
  /** meta.phases first, then any `phase()`/opts.phase titles in first-appearance order. */
  phases: Phase[];
  /** Insertion order == execution order. */
  nodes: TracedNode[];
  groups: Group[];
  /** Hit the agent/node cap — graph is a partial preview. */
  truncated: boolean;
  /** Some steps fan out at runtime (iterated an unknown-size collection) — counts are representative. */
  dynamic: boolean;
}

export type TraceStatus = "tracing" | "ready" | "fallback";
