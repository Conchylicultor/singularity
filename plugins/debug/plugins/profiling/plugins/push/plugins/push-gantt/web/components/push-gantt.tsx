import { useMemo, useState, type ReactElement } from "react";
import {
  formatDuration,
  GanttContainer,
  SpanDetail,
  useGanttContainerContext,
  type Span,
} from "@plugins/debug/plugins/profiling/web";
import { cn } from "@/lib/utils";

export interface PushEntry {
  pushId: string;
  branch: string;
  outcome: string;
  startedAt: string;
  startMs: number;
  waitMs: number;
  holdMs: number;
  conversationId: string | null;
  interrupted: boolean;
}

export interface BuildEntry {
  worktree: string;
  startMs: number;
  durationMs: number;
  success: boolean;
  interrupted: boolean;
}

export interface WorktreeGroup {
  worktree: string;
  pushes: PushEntry[];
  builds: BuildEntry[];
}

export interface PushData {
  groups: WorktreeGroup[];
  totalMs: number;
}

export interface PushGanttProps {
  groups: WorktreeGroup[];
  totalMs: number;
  title?: string;
  highlightWorktree?: string;
  onWorktreeClick?: (
    worktree: string,
    conversationId: string | null,
  ) => void;
}

// ── Visual language ─────────────────────────────────────────────────────────
// Two orthogonal channels so a bar is never ambiguous:
//   • Fill color answers "what is this?" — build → blue, push → green,
//     lock-wait → yellow. The fill NEVER changes with status.
//   • Status answers "how did it go?" via a treatment layered on top of the
//     fill: ok → solid, in-flight → pulsing, failed/interrupted → red ring.
//     Status NEVER recolors the fill.
// This is why a running push is green+pulsing (not blue) and a failed build is
// blue+red-ring (not a different hue): color = type, ring = error.
const TYPE_FILL = {
  build: "bg-info",
  push: "bg-success",
  wait: "bg-warning",
} as const;

type EventStatus = "ok" | "running" | "failed" | "interrupted";

const STATUS_TREATMENT: Record<EventStatus, string> = {
  ok: "",
  running: "animate-pulse",
  // ring-inset so the ring isn't clipped by the row's overflow-hidden track.
  failed: "ring-1 ring-inset ring-destructive",
  interrupted: "ring-1 ring-inset ring-destructive",
};

// Status dot in the row label — summarizes the worktree's last push. Mirrors
// the bar language: green = push landed, green-pulse = push in flight,
// red = failed/interrupted.
const STATUS_DOT: Record<EventStatus, string> = {
  ok: "bg-success",
  running: "bg-success animate-pulse",
  failed: "bg-destructive",
  interrupted: "bg-destructive",
};

function buildStatus(build: BuildEntry): EventStatus {
  if (build.interrupted) return "interrupted";
  return build.success ? "ok" : "failed";
}

function pushStatus(push: PushEntry): EventStatus {
  if (push.interrupted) return "interrupted";
  switch (push.outcome) {
    case "success":
      return "ok";
    // In-flight: "waiting" still blocked on the lock (hold bar zero-width, only
    // the yellow wait bar shows); "running" has the lock and the green hold bar
    // grows each refresh until done.
    case "waiting":
    case "running":
      return "running";
    // failed_rebase, failed_checks, failed_push, error
    default:
      return "failed";
  }
}

// Hard-killed builds have no known end, so there is no duration to scale a bar
// from. Render them as a fixed-width marker at their start instead — a visible
// trace that the build began and never finished, without a fake bar.
const INTERRUPTED_MARKER_PX = 4;

export function PushGantt({
  groups,
  totalMs,
  title = "Push & Build",
  highlightWorktree,
  onWorktreeClick,
}: PushGanttProps): ReactElement {
  const [hovered, setHovered] = useState<Span | null>(null);

  return (
    <div className="relative">
      <GanttContainer title={title} totalMs={totalMs}>
        <div className="border-b">
          {groups.map((group) => (
            <PushAttemptRow
              key={group.worktree}
              group={group}
              hovered={hovered}
              setHovered={setHovered}
              highlighted={group.worktree === highlightWorktree}
              onWorktreeClick={onWorktreeClick}
            />
          ))}
        </div>
      </GanttContainer>
      <SpanDetail
        span={hovered}
        className="sticky bottom-0 z-10 backdrop-blur-sm"
      />
    </div>
  );
}

function PushAttemptRow({
  group,
  hovered,
  setHovered,
  highlighted,
  onWorktreeClick,
}: {
  group: WorktreeGroup;
  hovered: Span | null;
  setHovered: (span: Span | null) => void;
  highlighted: boolean;
  onWorktreeClick?: (
    worktree: string,
    conversationId: string | null,
  ) => void;
}): ReactElement {
  const { toLeftPct, toWidthPct, totalMs } = useGanttContainerContext();

  const lastPush = group.pushes[group.pushes.length - 1];
  const dotColor = lastPush
    ? STATUS_DOT[pushStatus(lastPush)]
    : TYPE_FILL.build;
  const totalDuration =
    group.pushes.reduce((sum, p) => sum + p.waitMs + p.holdMs, 0) +
    group.builds.reduce((sum, b) => sum + b.durationMs, 0);

  const handleClick = useMemo(() => {
    if (!onWorktreeClick) return undefined;
    const uniqueConvIds = [
      ...new Set(
        group.pushes
          .map((p) => p.conversationId)
          .filter((id): id is string => id != null),
      ),
    ];
    const singleConvId =
      uniqueConvIds.length === 1 ? uniqueConvIds[0]! : null;
    return () => onWorktreeClick(group.worktree, singleConvId);
  }, [group, onWorktreeClick]);

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-4 py-1 hover:bg-muted/50",
        handleClick && "cursor-pointer",
        highlighted && "ring-1 ring-inset ring-primary/40 bg-primary/5",
      )}
      onClick={handleClick}
    >
      <div className="flex w-40 shrink-0 items-center gap-1.5 truncate">
        <div className={cn("size-2 shrink-0 rounded-full", dotColor)} />
        <span className="truncate font-mono text-[11px] text-muted-foreground">
          {group.worktree.replace(/^claude-web\//, "")}
        </span>
      </div>
      <div className="relative h-5 flex-1 overflow-hidden rounded bg-muted/30">
        {group.builds.map((build, i) => {
          const status = buildStatus(build);
          const buildLabel =
            status === "interrupted"
              ? "build (interrupted)"
              : status === "ok"
                ? "build (ok)"
                : "build (failed)";
          const buildSpan: Span = {
            id: `build:${group.worktree}:${i}`,
            phase: group.worktree,
            label: buildLabel,
            startMs: build.startMs,
            durationMs: build.durationMs,
          };
          const isBuildHovered = hovered?.id === buildSpan.id;

          return (
            <div
              key={buildSpan.id}
              className={cn(
                "absolute top-0 h-full rounded transition-opacity",
                TYPE_FILL.build,
                STATUS_TREATMENT[status],
                isBuildHovered ? "opacity-100" : "opacity-40",
              )}
              style={{
                left: toLeftPct(build.startMs, totalMs),
                width: build.interrupted
                  ? `${INTERRUPTED_MARKER_PX}px`
                  : toWidthPct(build.durationMs, totalMs),
              }}
              onMouseEnter={() => setHovered(buildSpan)}
              onMouseLeave={() => setHovered(null)}
            />
          );
        })}
        {group.pushes.map((push) => {
          const status = pushStatus(push);

          // Hard-killed mid-flight: no known end, no real duration. Render a
          // fixed-width green marker (still a push) at the start; the red ring
          // from STATUS_TREATMENT marks it as interrupted.
          if (push.interrupted) {
            const markerSpan: Span = {
              id: `push:${push.pushId}:interrupted`,
              phase: group.worktree,
              label: "push (interrupted)",
              startMs: push.startMs,
              durationMs: 0,
            };
            const isMarkerHovered = hovered?.id === markerSpan.id;
            return (
              <div
                key={push.pushId}
                className={cn(
                  "absolute top-0 h-full rounded transition-opacity",
                  TYPE_FILL.push,
                  STATUS_TREATMENT[status],
                  isMarkerHovered ? "opacity-100" : "opacity-70",
                )}
                style={{
                  left: toLeftPct(push.startMs, totalMs),
                  width: `${INTERRUPTED_MARKER_PX}px`,
                }}
                onMouseEnter={() => setHovered(markerSpan)}
                onMouseLeave={() => setHovered(null)}
              />
            );
          }

          const waitSpan: Span | null =
            push.waitMs > 0
              ? {
                  id: `wait:${push.pushId}`,
                  phase: group.worktree,
                  label: "lock wait",
                  startMs: push.startMs,
                  durationMs: push.waitMs,
                }
              : null;

          const pushSpan: Span = {
            id: `push:${push.pushId}`,
            phase: group.worktree,
            label: `push (${push.outcome})`,
            startMs: push.startMs + push.waitMs,
            durationMs: push.holdMs,
          };

          const isWaitHovered = hovered?.id === waitSpan?.id;
          const isPushHovered = hovered?.id === pushSpan.id;

          return (
            <span key={push.pushId}>
              {waitSpan && (
                <div
                  className={cn(
                    "absolute top-0 h-full rounded-l transition-opacity",
                    // Lock-wait is always yellow — its own event, never recolored
                    // by the push outcome that follows it.
                    TYPE_FILL.wait,
                    isWaitHovered ? "opacity-100" : "opacity-50",
                  )}
                  style={{
                    left: toLeftPct(push.startMs, totalMs),
                    width: toWidthPct(push.waitMs, totalMs),
                  }}
                  onMouseEnter={() => setHovered(waitSpan)}
                  onMouseLeave={() => setHovered(null)}
                />
              )}
              <div
                className={cn(
                  "absolute top-0 h-full transition-opacity",
                  TYPE_FILL.push,
                  STATUS_TREATMENT[status],
                  push.waitMs > 0 ? "rounded-r" : "rounded",
                  isPushHovered ? "opacity-100" : "opacity-70",
                )}
                style={{
                  left: toLeftPct(push.startMs + push.waitMs, totalMs),
                  width: toWidthPct(push.holdMs, totalMs),
                }}
                onMouseEnter={() => setHovered(pushSpan)}
                onMouseLeave={() => setHovered(null)}
              />
            </span>
          );
        })}
      </div>
      <div className="w-16 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
        {formatDuration(totalDuration)}
      </div>
    </div>
  );
}
