import { useMemo, useState, type ReactElement, type ReactNode } from "react";
import { MdChevronRight, MdExpandMore } from "react-icons/md";
import { z } from "zod";
import type { SpanKind } from "@plugins/infra/plugins/runtime-profiler/core";
import {
  cn,
  Button,
  SingleLineProvider,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import {
  MultiSpanLane,
  formatDuration,
  type SpanBar,
} from "@plugins/debug/plugins/profiling/web";
import type { TraceLaneProps, TraceSelection } from "@plugins/debug/plugins/trace/plugins/engine/web";
import {
  buildSpanTree,
  flattenTree,
  ancestorChain,
  type SpanNode,
} from "../internal/build-tree";

// Categorical color per span kind (fill = "what", never state — the push-gantt
// convention). The kind is now a per-row dot rather than a lane grouping: the rows
// are ordered by the call tree, not bucketed by kind.
const KIND_CONFIG: Record<SpanKind, { label: string; bar: string; dot: string }> = {
  http: { label: "HTTP", bar: "bg-categorical-1", dot: "bg-categorical-1" },
  sub: { label: "Sub", bar: "bg-categorical-2", dot: "bg-categorical-2" },
  push: { label: "Push", bar: "bg-categorical-3", dot: "bg-categorical-3" },
  flush: { label: "Flush", bar: "bg-categorical-4", dot: "bg-categorical-4" },
  cascade: { label: "Cascade", bar: "bg-categorical-8", dot: "bg-categorical-8" },
  loader: { label: "Loader", bar: "bg-categorical-5", dot: "bg-categorical-5" },
  job: { label: "Job", bar: "bg-categorical-6", dot: "bg-categorical-6" },
  db: { label: "DB", bar: "bg-categorical-7", dot: "bg-categorical-7" },
};

// px of indentation per tree depth.
const INDENT = 10;

// The tripping span's own instance id, when the trigger names one. Absent for
// non-span triggers (op-time, stall, client signals) — then no row is outlined.
const tripDetailSchema = z.object({ spanId: z.number() }).partial();
function tripSpanId(detail: unknown): number | null {
  const parsed = tripDetailSchema.safeParse(detail);
  return parsed.success ? (parsed.data.spanId ?? null) : null;
}

/**
 * The spans Gantt lane group: the captured flight window rendered as a **nested
 * waterfall** — one row per span *instance*, depth-indented under its true parent
 * (linked by the recorder's per-instance `parentId`, so two concurrent runs of the
 * same label are two rows under their own parents). A bar click reports the span's
 * full decomposition up to the pane's shared detail strip via `onSelect`.
 */
export function SpansLane({ trace, onSelect }: TraceLaneProps): ReactElement {
  const tree = useMemo(() => buildSpanTree(trace), [trace]);
  const [collapsed, setCollapsed] = useState<ReadonlySet<number>>(() => new Set());

  const rows = useMemo(
    () => (tree.kind === "ok" ? flattenTree(tree.roots, collapsed) : []),
    [tree, collapsed],
  );
  const tripId = useMemo(() => tripSpanId(trace.trigger.detail), [trace.trigger.detail]);

  if (tree.kind !== "ok") return <SectionPlaceholder section={tree} />;

  const { byId, roots } = tree;
  const collapseAll = (): void =>
    setCollapsed(new Set([...byId.values()].filter((n) => n.children.length > 0).map((n) => n.id)));

  return (
    <div className="border-b">
      <Stack direction="row" align="center" gap="sm" className="px-lg py-xs">
        <Text as="div" variant="caption" className="font-semibold">
          Spans
        </Text>
        <Text as="div" variant="caption" className="tabular-nums text-muted-foreground">
          {byId.size} span{byId.size === 1 ? "" : "s"} · {roots.length} root
          {roots.length === 1 ? "" : "s"}
        </Text>
        <Fill />
        <Button variant="ghost" onClick={() => setCollapsed(new Set())}>
          Expand all
        </Button>
        <Button variant="ghost" onClick={collapseAll}>
          Collapse all
        </Button>
      </Stack>
      <Stack gap="2xs" className="px-lg pb-sm">
        {rows.map(({ node, depth }) => (
          <SpanRow
            key={node.id}
            node={node}
            depth={depth}
            collapsed={collapsed.has(node.id)}
            isTrip={node.id === tripId}
            onToggle={() =>
              setCollapsed((prev) => {
                const next = new Set(prev);
                if (!next.delete(node.id)) next.add(node.id);
                return next;
              })
            }
            onClick={() => onSelect?.(toSelection(node, byId, trace.wallTime, trace.atMs))}
          />
        ))}
      </Stack>
    </div>
  );
}

function SpanRow({
  node,
  depth,
  collapsed,
  isTrip,
  onToggle,
  onClick,
}: {
  node: SpanNode;
  depth: number;
  collapsed: boolean;
  isTrip: boolean;
  onToggle: () => void;
  onClick: () => void;
}): ReactElement {
  const config = KIND_CONFIG[node.kind];
  const bar: SpanBar = {
    id: String(node.id),
    startMs: node.startMs,
    durationMs: node.durationMs,
    colorClass: config.bar,
    treatment: node.open ? "pulse" : "solid",
    segments: node.segments,
  };

  return (
    <div className={cn("rounded-md", isTrip && "ring-1 ring-primary")}>
      <MultiSpanLane
        label={
          <TreeLabel
            node={node}
            depth={depth}
            collapsed={collapsed}
            onToggle={onToggle}
          />
        }
        duration={formatDuration(node.ageMs)}
        bars={[bar]}
        onBarClick={onClick}
      />
    </div>
  );
}

// The indented label cell. MultiSpanLane's label slot is a rigid, clipping column,
// so this supplies its own single-line context: the <Text> leaf ellipsizes a long
// label while the chevron / dot / orphan marker stay rigid.
function TreeLabel({
  node,
  depth,
  collapsed,
  onToggle,
}: {
  node: SpanNode;
  depth: number;
  collapsed: boolean;
  onToggle: () => void;
}): ReactElement {
  const hasChildren = node.children.length > 0;
  return (
    <SingleLineProvider value={true}>
      {/* Depth indentation is a runtime value — no Tailwind class can express it. */}
      <Stack direction="row" align="center" gap="2xs" style={{ paddingLeft: depth * INDENT }}>
        {hasChildren ? (
          <button
            type="button"
            aria-label={collapsed ? "Expand" : "Collapse"}
            aria-expanded={!collapsed}
            className="text-muted-foreground hover:text-foreground"
            onClick={onToggle}
          >
            {collapsed ? <MdChevronRight className="size-3" /> : <MdExpandMore className="size-3" />}
          </button>
        ) : (
          <span className="size-3" />
        )}
        <span className={cn("size-2 rounded-full", KIND_CONFIG[node.kind].dot)} />
        <Fill>
          <Text as="span" variant="caption" className="font-mono" title={node.label}>
            {node.label}
          </Text>
        </Fill>
        {node.orphan && (
          <span
            className="text-muted-foreground"
            title="Parent span not in this window — evicted (<5ms, never entered the flight ring) or a detached child that outlived its parent."
          >
            ⇱
          </span>
        )}
      </Stack>
    </SingleLineProvider>
  );
}

function SectionPlaceholder({
  section,
}: {
  section: { kind: "absent" } | { kind: "legacy" } | { kind: "invalid"; message: string };
}): ReactElement {
  const message: ReactNode =
    section.kind === "absent"
      ? "No spans in flight or recently completed (≥5ms) during this window."
      : section.kind === "legacy"
        ? "Legacy spans section — captured before per-instance span ids existed, so the call tree cannot be reconstructed. Re-capture to see it."
        : `Malformed spans section: ${section.message}`;
  return (
    <Stack gap="none" className="px-lg py-sm">
      <Placeholder tone={section.kind === "invalid" ? "error" : "muted"}>{message}</Placeholder>
    </Stack>
  );
}

// Wall-clock anchor: profiler-clock t maps to wall via wallTime + (t − atMs).
function wallAt(wallTime: string, atMs: number, t: number): string {
  const base = new Date(wallTime).getTime();
  const d = new Date(base + (t - atMs));
  return d.toISOString().slice(11, 23); // HH:MM:SS.mmm
}

function toSelection(
  node: SpanNode,
  byId: Map<number, SpanNode>,
  wallTime: string,
  atMs: number,
): TraceSelection {
  const fields: TraceSelection["fields"] = [
    { label: "kind", value: KIND_CONFIG[node.kind].label },
    {
      label: "when",
      value:
        node.t1 === null
          ? `${wallAt(wallTime, atMs, node.t0)} → open`
          : `${wallAt(wallTime, atMs, node.t0)} → ${wallAt(wallTime, atMs, node.t1)}`,
    },
    { label: "duration", value: formatDuration(node.ageMs) },
    {
      label: "wait / child / self",
      value: `${ms(node.waitMs)} / ${ms(node.childMs)} / ${ms(node.selfMs)}`,
    },
  ];

  const chain = ancestorChain(node, byId);
  if (chain.length > 0) {
    fields.push({ label: "parent", value: chain.map((n) => `${n.kind}:${n.label}`).join(" ← ") });
  } else if (node.orphan) {
    fields.push({ label: "parent", value: "not in this window (evicted or detached)" });
  }
  if (node.children.length > 0) {
    fields.push({ label: "children", value: String(node.children.length) });
  }
  if (node.segments && node.waitMs > 0) {
    fields.push({ label: "wait total (position approximate)", value: ms(node.waitMs) });
  }
  if (node.waits && Object.keys(node.waits).length > 0) {
    fields.push({
      label: "waits",
      value: Object.entries(node.waits)
        .sort((a, b) => b[1] - a[1])
        .map(([layer, w]) => `${layer} ${ms(w)}`)
        .join(" · "),
    });
  }
  return { title: `${node.kind}:${node.label}`, fields };
}

function ms(v: number): string {
  return `${Math.round(v)}ms`;
}
