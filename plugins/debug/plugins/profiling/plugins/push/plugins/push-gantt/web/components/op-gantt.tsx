import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import {
  useMemo,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
} from "react";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Sticky } from "@plugins/primitives/plugins/css/plugins/sticky/web";
import { StatusDot } from "@plugins/primitives/plugins/css/plugins/status-dot/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Cluster } from "@plugins/primitives/plugins/css/plugins/cluster/web";
import type { Lane } from "@plugins/infra/plugins/host-admission/core";
import type {
  OpKind,
  OpWait,
  WaitKind,
} from "@plugins/debug/plugins/profiling/plugins/op-log/core";
import {
  formatDuration,
  GanttContainer,
  SpanDetail,
  useGanttContainerContext,
  type Span,
} from "@plugins/debug/plugins/profiling/web";

/**
 * One op on the Gantt — structurally the wire's `OpEntry`
 * (`debug/profiling/push`'s `shared/endpoints.ts`), restated here because
 * `shared/` is plugin-private and a Gantt must stay renderable from any source.
 * The two enums are IMPORTED from op-log's `core` rather than re-typed, so the
 * fill maps below are exhaustive by construction.
 */
export interface OpEntry {
  opId: string;
  kind: OpKind;
  /** Offset from the Gantt origin. */
  startMs: number;
  /** The op's FULL span: waits + the work gaps between them + the final hold. */
  totalMs: number;
  /** Each entry's `startMs` is relative to THIS op's start. May gap; may repeat a kind. */
  waits: OpWait[];
  holdMs: number;
  outcome: string;
  interrupted: boolean;
  branch: string;
  buildId: string | null;
  conversationId: string | null;
  lane: Lane | null;
}

export interface WorktreeGroup {
  worktree: string;
  conversationId: string | null;
  title: string | null;
  ops: OpEntry[];
}

export interface OpData {
  groups: WorktreeGroup[];
  totalMs: number;
}

export interface OpGanttProps {
  groups: WorktreeGroup[];
  totalMs: number;
  title?: string;
  highlightWorktree?: string;
  onWorktreeClick?: (worktree: string, conversationId: string | null) => void;
  /**
   * Handle a click on an op bar. Always fired (so the click never silently falls
   * through to the row's onWorktreeClick); the consumer dispatches on
   * `op.kind` — and, for a build, decides what to do when `op.buildId` is null
   * (legacy log entries predating the field have no profile to open).
   * `worktree` is the row's canonical worktree id, which the build-profile pane
   * needs and the op itself does not carry.
   */
  onOpClick?: (op: OpEntry, worktree: string) => void;
}

// ── The render model ────────────────────────────────────────────────────────
// An op is ONE bar spanning `startMs → startMs + totalMs`, colored by kind,
// with each `waits[]` entry painted as an overlay segment at its own true
// offset INSIDE that span.
//
// This is deliberately NOT a `[wait][hold]` head-to-tail split. Waits interleave
// with real work — a build reads
// `[build-lock][…migrations/codegen…][duress-valve][host-grant][…heavy work…]` —
// and one op may carry SEVERAL waits of the same kind (a build re-queues for the
// host grant across duress requeue cycles). So: N segments at arbitrary offsets,
// and `sum(waits) + holdMs` is generally LESS than `totalMs`. The gaps are the
// op actually working.

// ── Visual language ─────────────────────────────────────────────────────────
// Three orthogonal channels so a bar is never ambiguous:
//
//   • TYPE_FILL answers "what is this?" — the base bar's fill, keyed on kind.
//     Cool/semantic hues. NEVER changes with status.
//   • WAIT_FILL answers "what is it blocked on?" — the overlay segments, keyed
//     on wait kind. Warm hues, drawn from the `categorical` token group (which
//     exists precisely to supply N mutually-distinguishable, light+dark-tested
//     hues — see plugins/ui/plugins/tokens/plugins/categorical). The warm/cool
//     split IS the gestalt: any warm patch on a bar means "not working here",
//     and its hue names WHICH resource — self-queued (push-mutex / build-lock)
//     vs. fleet-starved (host-grant) vs. duress-held (duress-valve). That
//     distinction is the entire diagnostic value of this pane.
//   • STATUS_TREATMENT answers "how did it go?" — layered on top of the fill:
//     ok → solid, in-flight → pulsing, failed/interrupted → red ring. Status
//     NEVER recolors the fill.
//
// This is why a running push is green+pulsing (not blue) and a failed build is
// blue+red-ring (not a different hue): color = type, ring = error.
const TYPE_FILL: Record<OpKind, string> = {
  build: "bg-info",
  push: "bg-success",
  // No semantic status token means "check", and every warm hue is spoken for by
  // a wait — so a check takes the one strongly-saturated cool hue neither the
  // other kinds nor any wait uses.
  check: "bg-categorical-5",
};

// A warm severity ramp: benign self-inflicted queueing (amber → orange), then
// the fleet starving you (red), then the cluster sentinel holding you out of a
// storm (magenta). The two closest hues — amber/orange — are exactly the pair
// that can never co-occur on one bar (a push never takes the build lock, a
// build never takes the push mutex), so the weakest contrast pair is the one
// you never have to tell apart in place.
const WAIT_FILL: Record<WaitKind, string> = {
  "push-mutex": "bg-categorical-3",
  "build-lock": "bg-categorical-9",
  "host-grant": "bg-categorical-4",
  "duress-valve": "bg-categorical-8",
};

/** The fill a kind's base bar uses — for consumers rendering the same op elsewhere. */
export function opFillClass(kind: OpKind): string {
  return TYPE_FILL[kind];
}

/** The fill a wait's segment uses — for consumers rendering the same op elsewhere. */
export function waitFillClass(kind: WaitKind): string {
  return WAIT_FILL[kind];
}

type EventStatus = "ok" | "running" | "failed" | "interrupted";

const STATUS_TREATMENT: Record<EventStatus, string> = {
  ok: "",
  running: "animate-pulse",
  // ring-inset so the ring isn't clipped by the row's overflow-hidden track.
  failed: "ring-1 ring-inset ring-destructive",
  interrupted: "ring-1 ring-inset ring-destructive",
};

// Status dot in the row label — summarizes the worktree's last op. Mirrors the
// bar language: green = landed, green-pulse = in flight, red = failed/interrupted.
const STATUS_DOT: Record<EventStatus, string> = {
  ok: "bg-success",
  running: "bg-success animate-pulse",
  failed: "bg-destructive",
  interrupted: "bg-destructive",
};

/**
 * ONE status derivation for all three kinds, replacing the separate
 * `pushStatus`/`buildStatus` — the duplication that let build and push drift.
 *
 * The terminal vocabularies differ per kind (`build`/`check`:
 * `success | failed | error`; `push`: `success | failed_rebase | failed_checks |
 * failed_push | error`) but they agree on `success`, and the two synthetic
 * in-flight outcomes (`waiting` = still queued, `running` = admitted, possibly
 * parked in a POST-grant wait) are shared. So: success → ok, in-flight →
 * running, everything else → failed.
 */
function opStatus(op: OpEntry): EventStatus {
  if (op.interrupted) return "interrupted";
  switch (op.outcome) {
    case "success":
      return "ok";
    case "waiting":
    case "running":
      return "running";
    // failed, error, failed_rebase, failed_checks, failed_push
    default:
      return "failed";
  }
}

// Hard-killed ops have no known end, so there is no duration to scale a bar
// from (the reader stamps totalMs 0). Render them as a fixed-width marker at
// their start instead — a visible trace that the op began and never finished,
// without a fake bar. No wait segments either: an unbounded span cannot place
// them honestly.
const INTERRUPTED_MARKER_PX = 4;

export function OpGantt({
  groups,
  totalMs,
  title = "Ops",
  highlightWorktree,
  onWorktreeClick,
  onOpClick,
}: OpGanttProps): ReactElement {
  const [hovered, setHovered] = useState<Span | null>(null);

  return (
    <div className="relative">
      <GanttContainer title={title} totalMs={totalMs}>
        <div className="border-b">
          {groups.map((group) => (
            <OpRow
              key={group.worktree}
              group={group}
              hovered={hovered}
              setHovered={setHovered}
              highlighted={group.worktree === highlightWorktree}
              onWorktreeClick={onWorktreeClick}
              onOpClick={onOpClick}
            />
          ))}
        </div>
      </GanttContainer>
      <OpLegend groups={groups} />
      <Sticky edge="bottom" className="backdrop-blur-sm">
        <SpanDetail span={hovered} />
      </Sticky>
    </div>
  );
}

/**
 * Four wait hues are only diagnostic if the mapping is readable, so the legend
 * is part of the feature, not decoration. It lists ONLY what the current data
 * actually contains, so a pane with no duress episode never spends a line
 * explaining one.
 */
function OpLegend({ groups }: { groups: WorktreeGroup[] }): ReactElement | null {
  const entries = useMemo(() => {
    const kinds = new Set<OpKind>();
    const waits = new Set<WaitKind>();
    for (const group of groups) {
      for (const op of group.ops) {
        kinds.add(op.kind);
        for (const wait of op.waits) {
          if (wait.durationMs > 0) waits.add(wait.kind);
        }
      }
    }
    return [
      ...[...kinds].map((k) => ({ key: `kind:${k}`, label: k, fill: TYPE_FILL[k] })),
      ...[...waits].map((w) => ({
        key: `wait:${w}`,
        label: `${w} wait`,
        fill: WAIT_FILL[w],
      })),
    ];
  }, [groups]);

  if (entries.length === 0) return null;

  return (
    <Cluster gap="md" className="border-b px-lg py-xs">
      {entries.map((entry) => (
        <Stack key={entry.key} direction="row" align="center" gap="2xs">
          <StatusDot colorClass={entry.fill} />
          <Text as="span" variant="caption" className="text-muted-foreground">
            {entry.label}
          </Text>
        </Stack>
      ))}
    </Cluster>
  );
}

function OpRow({
  group,
  hovered,
  setHovered,
  highlighted,
  onWorktreeClick,
  onOpClick,
}: {
  group: WorktreeGroup;
  hovered: Span | null;
  setHovered: (span: Span | null) => void;
  highlighted: boolean;
  onWorktreeClick?: (worktree: string, conversationId: string | null) => void;
  onOpClick?: (op: OpEntry, worktree: string) => void;
}): ReactElement {
  const lastOp = group.ops[group.ops.length - 1];
  const dotColor = lastOp ? STATUS_DOT[opStatus(lastOp)] : TYPE_FILL.build;
  // Each op's own FULL span, summed. Never `waits + hold` — that omits the work
  // gaps between the waits and would under-report every build.
  const totalDuration = group.ops.reduce((sum, op) => sum + op.totalMs, 0);

  const handleClick = useMemo(() => {
    if (!onWorktreeClick) return undefined;
    const uniqueConvIds = [
      ...new Set(
        group.ops
          .map((o) => o.conversationId)
          .filter((id): id is string => id != null),
      ),
    ];
    const singleConvId = uniqueConvIds.length === 1 ? uniqueConvIds[0]! : null;
    return () => onWorktreeClick(group.worktree, singleConvId);
  }, [group, onWorktreeClick]);

  return (
    <Stack
      direction="row"
      align="center"
      gap="sm"
      className={cn(
        "px-lg py-xs hover:bg-muted/50",
        handleClick && "cursor-pointer",
        highlighted && "ring-1 ring-inset ring-primary/40 bg-primary/5",
      )}
      onClick={handleClick}
    >
      <div
        // eslint-disable-next-line layout/no-adhoc-layout -- fixed 160px (w-40) worktree-label column kept rigid (shrink-0) to align with the Gantt time axis (LABEL_WIDTH)
        className="flex w-40 shrink-0 items-center gap-xs truncate"
        // Bare worktree id stays discoverable on hover even when a title shows.
        title={group.worktree.replace(/^claude-web\//, "")}
      >
        <StatusDot colorClass={dotColor} />
        <span
          className={cn(
            "truncate text-2xs text-muted-foreground",
            // Titles read as prose; the opaque worktree id stays monospace.
            group.title ? "" : "font-mono",
          )}
        >
          {group.title ?? group.worktree.replace(/^claude-web\//, "")}
        </span>
      </div>
      {/* eslint-disable-next-line layout/no-adhoc-layout -- flexible timeline track (flex-1) clipping the runtime-positioned bars (overflow-hidden) */}
      <div className="relative h-5 flex-1 overflow-hidden rounded-md bg-muted/30">
        {group.ops.map((op) => (
          <OpBar
            key={op.opId}
            op={op}
            worktree={group.worktree}
            hovered={hovered}
            setHovered={setHovered}
            onOpClick={onOpClick}
          />
        ))}
      </div>
      {/* eslint-disable-next-line layout/no-adhoc-layout -- fixed 64px (w-16) duration column kept rigid (shrink-0) to align with the Gantt time axis (DURATION_WIDTH) */}
      <div className="w-16 shrink-0 text-right font-mono text-2xs tabular-nums text-muted-foreground">
        {formatDuration(totalDuration)}
      </div>
    </Stack>
  );
}

/** The op's base bar plus one overlay per wait, each at its true in-span offset. */
function OpBar({
  op,
  worktree,
  hovered,
  setHovered,
  onOpClick,
}: {
  op: OpEntry;
  worktree: string;
  hovered: Span | null;
  setHovered: (span: Span | null) => void;
  onOpClick?: (op: OpEntry, worktree: string) => void;
}): ReactElement {
  const { toLeftPct, toWidthPct, totalMs } = useGanttContainerContext();
  const status = opStatus(op);
  const clickable = onOpClick !== undefined;

  // The lane explains WHY an op waited (interactive draws from a reserved
  // floor; background does not), so it rides the hover label rather than taking
  // room on the bar — the diagnosis is one hover away, and the track stays a
  // pure time axis.
  const laneSuffix = op.lane ? ` · ${op.lane}` : "";

  // Shared handlers: the whole op — base bar and every wait segment — is one
  // click target. stopPropagation on pointerdown keeps GanttContainer's
  // drag-zoom from setPointerCapture'ing and retargeting the click off the bar;
  // stopPropagation on click keeps it from falling through to the row's
  // onWorktreeClick (a surprising silent redirect into the conversation).
  const interactions = clickable
    ? {
        onPointerDown: (e: ReactPointerEvent) => e.stopPropagation(),
        onClick: (e: ReactMouseEvent) => {
          e.stopPropagation();
          onOpClick(op, worktree);
        },
      }
    : {};

  if (op.interrupted) {
    const markerSpan: Span = {
      id: `op:${op.opId}`,
      phase: worktree,
      label: `${op.kind} (interrupted)${laneSuffix}`,
      startMs: op.startMs,
      durationMs: 0,
    };
    return (
      <div
        // eslint-disable-next-line layout/no-adhoc-layout -- interrupted-op marker positioned by runtime ms→% offset (left/width inline style)
        className={cn(
          "absolute top-0 h-full rounded-md transition-opacity",
          TYPE_FILL[op.kind],
          STATUS_TREATMENT[status],
          hovered?.id === markerSpan.id ? "opacity-100" : "opacity-70",
          clickable && "cursor-pointer",
        )}
        style={{
          left: toLeftPct(op.startMs, totalMs),
          width: `${INTERRUPTED_MARKER_PX}px`,
        }}
        onMouseEnter={() => setHovered(markerSpan)}
        onMouseLeave={() => setHovered(null)}
        {...interactions}
      />
    );
  }

  const baseSpan: Span = {
    id: `op:${op.opId}`,
    phase: worktree,
    label: `${op.kind} (${op.outcome})${laneSuffix}`,
    startMs: op.startMs,
    durationMs: op.totalMs,
  };

  // Skip zero-length waits so toWidthPct's min-width floor never paints an
  // empty segment as a misleading sliver.
  const waits = op.waits.filter((w) => w.durationMs > 0);

  return (
    <>
      <div
        // eslint-disable-next-line layout/no-adhoc-layout -- op bar positioned by runtime ms→% offsets (left/width inline style)
        className={cn(
          "absolute top-0 h-full rounded-md transition-opacity",
          TYPE_FILL[op.kind],
          STATUS_TREATMENT[status],
          hovered?.id === baseSpan.id ? "opacity-100" : "opacity-50",
          clickable && "cursor-pointer",
        )}
        style={{
          left: toLeftPct(op.startMs, totalMs),
          width: toWidthPct(op.totalMs, totalMs),
        }}
        onMouseEnter={() => setHovered(baseSpan)}
        onMouseLeave={() => setHovered(null)}
        {...interactions}
      />
      {waits.map((wait, i) => {
        // startMs is relative to the op's own start — waits are painted at their
        // true offsets inside the span, never packed head-to-tail.
        const waitSpan: Span = {
          id: `wait:${op.opId}:${i}`,
          phase: worktree,
          label: `${wait.kind} wait`,
          startMs: op.startMs + wait.startMs,
          durationMs: wait.durationMs,
        };
        return (
          <div
            key={waitSpan.id}
            // eslint-disable-next-line layout/no-adhoc-layout -- wait segment positioned by runtime ms→% offsets (left/width inline style)
            className={cn(
              "absolute top-0 h-full rounded-sm transition-opacity",
              WAIT_FILL[wait.kind],
              hovered?.id === waitSpan.id ? "opacity-100" : "opacity-90",
              clickable && "cursor-pointer",
            )}
            style={{
              left: toLeftPct(waitSpan.startMs, totalMs),
              width: toWidthPct(wait.durationMs, totalMs),
            }}
            onMouseEnter={() => setHovered(waitSpan)}
            onMouseLeave={() => setHovered(null)}
            {...interactions}
          />
        );
      })}
    </>
  );
}
