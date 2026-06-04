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

const OUTCOME_STYLES: Record<string, { color: string; bg: string }> = {
  success: {
    color: "bg-success",
    bg: "bg-success/10",
  },
  failed_rebase: {
    color: "bg-destructive",
    bg: "bg-destructive/10",
  },
  failed_checks: {
    color: "bg-warning",
    bg: "bg-warning/10",
  },
  failed_push: {
    color: "bg-destructive",
    bg: "bg-destructive/10",
  },
  error: {
    color: "bg-muted-foreground",
    bg: "bg-muted/50",
  },
  // In-flight, still blocked on the lock. Its hold bar has zero width (holdMs 0),
  // so only the growing yellow wait bar (WAIT_COLOR) renders for this row.
  waiting: {
    color: "bg-warning",
    bg: "bg-warning/10",
  },
  // In-flight, lock acquired and running. The wait bar is now frozen and the
  // hold bar grows in this color on each refresh until the push completes.
  running: {
    color: "bg-info",
    bg: "bg-info/10",
  },
};

const DEFAULT_STYLE = {
  color: "bg-muted-foreground/60",
  bg: "bg-muted/50",
};

const WAIT_COLOR = "bg-warning";
const BUILD_COLOR = "bg-info";
const BUILD_FAILED_COLOR = "bg-info/70";
const BUILD_INTERRUPTED_COLOR = "bg-destructive";

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
  const lastStyle = lastPush
    ? (OUTCOME_STYLES[lastPush.outcome] ?? DEFAULT_STYLE)
    : { color: "bg-info", bg: "bg-info/10" };
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
        <div
          className={cn("size-2 shrink-0 rounded-full", lastStyle.color)}
        />
        <span className="truncate font-mono text-[11px] text-muted-foreground">
          {group.worktree.replace(/^claude-web\//, "")}
        </span>
      </div>
      <div className="relative h-5 flex-1 overflow-hidden rounded bg-muted/30">
        {group.builds.map((build, i) => {
          const buildLabel = build.interrupted
            ? "build (interrupted)"
            : build.success
              ? "build (ok)"
              : "build (failed)";
          const buildColor = build.interrupted
            ? BUILD_INTERRUPTED_COLOR
            : build.success
              ? BUILD_COLOR
              : BUILD_FAILED_COLOR;
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
                buildColor,
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
          const style = OUTCOME_STYLES[push.outcome] ?? DEFAULT_STYLE;

          // Hard-killed mid-flight: no known end, no real duration. Render a
          // fixed-width marker at the start, like an interrupted build.
          if (push.interrupted) {
            const markerSpan: Span = {
              id: `${push.pushId}:interrupted`,
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
                  BUILD_INTERRUPTED_COLOR,
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
                  id: `${push.pushId}:wait`,
                  phase: group.worktree,
                  label: "lock wait",
                  startMs: push.startMs,
                  durationMs: push.waitMs,
                }
              : null;

          const pushSpan: Span = {
            id: `${push.pushId}:push`,
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
                    WAIT_COLOR,
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
                  style.color,
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
