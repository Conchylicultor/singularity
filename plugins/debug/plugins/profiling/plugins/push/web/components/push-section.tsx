import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import {
  formatDuration,
  useProfilingContext,
  type Span,
} from "@plugins/debug/plugins/profiling/web";
import { attemptPane } from "@plugins/attempt-view/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { SectionLabel } from "@plugins/primitives/plugins/section-label/web";
import { cn } from "@/lib/utils";

interface PushEntry {
  pushId: string;
  branch: string;
  outcome: string;
  startedAt: string;
  startMs: number;
  waitMs: number;
  holdMs: number;
  conversationId: string | null;
}

interface BuildEntry {
  worktree: string;
  startMs: number;
  durationMs: number;
  success: boolean;
  crashed: boolean;
}

interface WorktreeGroup {
  worktree: string;
  pushes: PushEntry[];
  builds: BuildEntry[];
}

interface PushData {
  groups: WorktreeGroup[];
  totalMs: number;
}

const OUTCOME_STYLES: Record<string, { color: string; bg: string }> = {
  success: {
    color: "bg-emerald-500",
    bg: "bg-emerald-50 dark:bg-emerald-950/30",
  },
  failed_rebase: {
    color: "bg-red-500",
    bg: "bg-red-50 dark:bg-red-950/30",
  },
  failed_checks: {
    color: "bg-orange-500",
    bg: "bg-orange-50 dark:bg-orange-950/30",
  },
  failed_push: {
    color: "bg-red-600",
    bg: "bg-red-50 dark:bg-red-950/30",
  },
  error: {
    color: "bg-gray-500",
    bg: "bg-gray-50 dark:bg-gray-950/30",
  },
};

const DEFAULT_STYLE = {
  color: "bg-gray-400",
  bg: "bg-gray-50 dark:bg-gray-950/30",
};

const WAIT_COLOR = "bg-amber-400 dark:bg-amber-500";
const BUILD_COLOR = "bg-sky-400 dark:bg-sky-500";
const BUILD_FAILED_COLOR = "bg-sky-700 dark:bg-sky-800";
const BUILD_CRASHED_COLOR = "bg-red-400 dark:bg-red-500";

function formatTickMs(ms: number): string {
  if (ms === 0) return "0";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(0)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
}

export function PushSection(): ReactElement | null {
  const { refreshKey } = useProfilingContext();
  const [data, setData] = useState<PushData | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/debug/profiling/push");
      if (!res.ok) return;
      setData((await res.json()) as PushData);
    } catch (err) {
      if (err instanceof TypeError) return;
      throw err;
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  if (!data || data.groups.length === 0) return null;

  return (
    <>
      <PushTimeAxis totalMs={data.totalMs} />
      <div className="border-b">
        {data.groups.map((group) => (
          <PushAttemptRow
            key={group.worktree}
            group={group}
            totalMs={data.totalMs}
          />
        ))}
      </div>
    </>
  );
}

function PushTimeAxis({ totalMs }: { totalMs: number }): ReactElement {
  const tickCount = 6;
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) =>
    Math.round((i / tickCount) * totalMs),
  );

  return (
    <div className="relative flex h-6 border-b px-4">
      <div className="flex w-40 shrink-0 items-center gap-1.5">
        <SectionLabel
          as="span"
          className="text-[10px] font-medium tracking-wider"
        >
          Push & Build
        </SectionLabel>
        <span className="text-[10px] font-medium tabular-nums text-foreground">
          {formatDuration(totalMs)}
        </span>
      </div>
      <div className="relative flex-1">
        {ticks.map((ms) => (
          <div
            key={ms}
            className="absolute top-0 flex h-full flex-col items-center"
            style={{ left: `${(ms / totalMs) * 100}%` }}
          >
            <div className="h-2 w-px bg-border" />
            <span className="text-[9px] tabular-nums text-muted-foreground">
              {formatTickMs(ms)}
            </span>
          </div>
        ))}
      </div>
      <div className="w-16 shrink-0" />
    </div>
  );
}

function PushAttemptRow({
  group,
  totalMs,
}: {
  group: WorktreeGroup;
  totalMs: number;
}): ReactElement {
  const { hovered, setHovered } = useProfilingContext();
  const openPane = useOpenPane();

  const lastPush = group.pushes[group.pushes.length - 1];
  const lastStyle = lastPush
    ? (OUTCOME_STYLES[lastPush.outcome] ?? DEFAULT_STYLE)
    : { color: "bg-sky-500", bg: "bg-sky-50 dark:bg-sky-950/30" };
  const totalDuration =
    group.pushes.reduce((sum, p) => sum + p.waitMs + p.holdMs, 0) +
    group.builds.reduce((sum, b) => sum + b.durationMs, 0);

  const handleClick = useMemo(() => {
    const uniqueConvIds = [
      ...new Set(
        group.pushes
          .map((p) => p.conversationId)
          .filter((id): id is string => id != null),
      ),
    ];
    if (uniqueConvIds.length === 1) {
      return () =>
        openPane(conversationPane, { convId: uniqueConvIds[0]! }, { mode: "push" });
    }
    const attemptId = group.worktree.split("/").pop() ?? group.worktree;
    return () =>
      openPane(attemptPane, { attemptId }, { mode: "push" });
  }, [group, openPane]);

  return (
    <div
      className="flex cursor-pointer items-center gap-2 px-4 py-1 hover:bg-muted/50"
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
          const buildLabel = build.crashed
            ? "build (crashed)"
            : build.success
              ? "build (ok)"
              : "build (failed)";
          const buildColor = build.crashed
            ? BUILD_CRASHED_COLOR
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
                left: `${(build.startMs / totalMs) * 100}%`,
                width: `${Math.max((build.durationMs / totalMs) * 100, 0.3)}%`,
              }}
              onMouseEnter={() => setHovered(buildSpan)}
              onMouseLeave={() => setHovered(null)}
            />
          );
        })}
        {group.pushes.map((push) => {
          const style = OUTCOME_STYLES[push.outcome] ?? DEFAULT_STYLE;

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
                    left: `${(push.startMs / totalMs) * 100}%`,
                    width: `${Math.max((push.waitMs / totalMs) * 100, 0.3)}%`,
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
                  left: `${((push.startMs + push.waitMs) / totalMs) * 100}%`,
                  width: `${Math.max((push.holdMs / totalMs) * 100, 0.3)}%`,
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
