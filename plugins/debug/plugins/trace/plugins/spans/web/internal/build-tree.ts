import type { SpanKind, FlightSpan } from "@plugins/infra/plugins/runtime-profiler/core";
import type { TraceSnapshot } from "@plugins/debug/plugins/trace/plugins/engine/core";
import { parseSpansSection } from "../../shared/flight-window";

/** One span *instance* positioned on the window, linked to its true parent run. */
export interface SpanNode {
  id: number;
  parentId: number | null;
  kind: SpanKind;
  label: string;
  /** Window-relative, clamped to [0, totalMs]. */
  startMs: number;
  durationMs: number;
  /** t1 === null at capture → still in flight (renders to the window edge, pulsing). */
  open: boolean;
  /** Leading wait segment + trailing work (completed spans with waitMs > 0). */
  segments?: { kind: "wait" | "work"; ms: number }[];
  /**
   * `parentId` names a span that is not in this window: a detached (fire-and-forget)
   * child outliving its parent, a parent that closed in <5 ms and never entered the
   * flight ring, or a back-edge we refused to link (see below). Renders as a root.
   */
  orphan: boolean;
  // Raw, unclamped, profiler-clock detail for the bottom strip.
  t0: number;
  t1: number | null;
  ageMs: number;
  waitMs: number;
  childMs: number;
  selfMs: number;
  waits?: Record<string, number>;
  children: SpanNode[];
}

/**
 * The outcome of building a tree from a trace's `spans` section. Mirrors
 * `SpansSection`'s discrimination rather than collapsing "absent" / "legacy" /
 * "corrupt" into an empty tree — the lane renders a different message for each.
 */
export type SpanTreeResult =
  | { kind: "ok"; totalMs: number; roots: SpanNode[]; byId: Map<number, SpanNode> }
  | { kind: "absent" }
  | { kind: "legacy" }
  | { kind: "invalid"; message: string };

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Resolve a node's parent, refusing any back-edge.
 *
 * A parent always OPENS before its child, and ids are minted monotonically at open,
 * so `parentId < id` holds by construction. Refusing the reverse means following
 * parent pointers strictly decreases the id — a corrupt payload can never produce a
 * cycle (and neither the builder nor `ancestorChain` can loop).
 */
function resolveParent(node: SpanNode, byId: Map<number, SpanNode>): SpanNode | undefined {
  if (node.parentId === null || node.parentId >= node.id) return undefined;
  return byId.get(node.parentId);
}

function toNode(span: FlightSpan, windowStartMs: number, atMs: number, totalMs: number): SpanNode {
  const open = span.t1 === null;
  const rawEnd = span.t1 ?? atMs;
  const startMs = clamp(span.t0 - windowStartMs, 0, totalMs);
  const endMs = clamp(rawEnd - windowStartMs, startMs, totalMs);
  const durationMs = Math.max(0, endMs - startMs);

  // Completed spans with a positive `waitMs` get a lighter LEADING wait segment — an
  // approximation (waits are union TOTALS, not intervals, so only the size is real,
  // not the position); the detail strip labels it as such.
  let segments: SpanNode["segments"];
  if (!open && span.waitMs > 0 && durationMs > 0) {
    const wait = clamp(span.waitMs, 0, durationMs);
    segments = [
      { kind: "wait", ms: wait },
      { kind: "work", ms: durationMs - wait },
    ];
  }

  return {
    id: span.id,
    parentId: span.parentId,
    kind: span.kind,
    label: span.label,
    startMs,
    durationMs,
    open,
    segments,
    orphan: false,
    t0: span.t0,
    t1: span.t1,
    ageMs: span.ageMs,
    waitMs: span.waitMs,
    childMs: span.childMs,
    selfMs: span.selfMs,
    waits: span.waits,
    children: [],
  };
}

function byStart(a: SpanNode, b: SpanNode): number {
  return a.t0 - b.t0 || a.id - b.id;
}

/**
 * Pure builder: fold a trace's `spans` flight window into the exact call tree.
 *
 * `open` and `completed` never overlap — a span is deleted from the recorder's
 * open-entry registry before it is pushed to the flight ring — so indexing both by
 * `id` into one map is lossless. Linking is by `parentId` (a span *instance*, not a
 * `{kind,label}` label snapshot), which is what makes concurrent same-label spans
 * land under their own parents instead of one shared bucket.
 */
export function buildSpanTree(snapshot: TraceSnapshot): SpanTreeResult {
  const section = parseSpansSection(snapshot.events["spans"]);
  if (section.kind !== "ok") return section;

  const totalMs = Math.max(1, snapshot.atMs - snapshot.windowStartMs);
  const { window } = section;

  const byId = new Map<number, SpanNode>();
  for (const span of [...window.open, ...window.completed]) {
    byId.set(span.id, toNode(span, snapshot.windowStartMs, snapshot.atMs, totalMs));
  }

  const roots: SpanNode[] = [];
  for (const node of byId.values()) {
    if (node.parentId === null) {
      roots.push(node);
      continue;
    }
    const parent = resolveParent(node, byId);
    if (!parent) {
      node.orphan = true;
      roots.push(node);
      continue;
    }
    parent.children.push(node);
  }

  for (const node of byId.values()) node.children.sort(byStart);
  roots.sort(byStart);

  return { kind: "ok", totalMs, roots, byId };
}

/** Depth-first flatten of the tree, skipping the subtrees of collapsed node ids. */
export function flattenTree(
  roots: SpanNode[],
  collapsed: ReadonlySet<number>,
): { node: SpanNode; depth: number }[] {
  const rows: { node: SpanNode; depth: number }[] = [];
  const walk = (nodes: SpanNode[], depth: number): void => {
    for (const node of nodes) {
      rows.push({ node, depth });
      if (!collapsed.has(node.id)) walk(node.children, depth + 1);
    }
  };
  walk(roots, 0);
  return rows;
}

/** The node's ancestors, innermost → outermost. Empty for a root or an orphan. */
export function ancestorChain(node: SpanNode, byId: Map<number, SpanNode>): SpanNode[] {
  const chain: SpanNode[] = [];
  for (let cur = resolveParent(node, byId); cur; cur = resolveParent(cur, byId)) {
    chain.push(cur);
  }
  return chain;
}
