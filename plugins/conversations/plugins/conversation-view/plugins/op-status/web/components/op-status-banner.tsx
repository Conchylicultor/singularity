import { useEffect, useMemo, useState } from "react";
import { MdExpandLess, MdExpandMore, MdHourglassEmpty } from "react-icons/md";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { Spinner } from "@plugins/primitives/plugins/css/plugins/spinner/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Clip } from "@plugins/primitives/plugins/css/plugins/clip/web";
import {
  conversationsActiveResource,
  conversationsGoneResource,
  conversationsSystemResource,
} from "@plugins/tasks/plugins/tasks-core/core";
import type { Conversation as ConversationRecord } from "@plugins/tasks/plugins/tasks-core/core";
import { worktreeOpsResource, type WorktreeOp } from "../../shared";

// The op markers are keyed on the worktree directory basename, exactly how the
// status poller keys them (`basename(worktreePath)`). Avoid node:path in the
// browser — derive the basename by hand.
function slugOf(worktreePath: string): string {
  const parts = worktreePath.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? worktreePath;
}

// Map each worktree slug → a human-friendly conversation title, so the op queue
// reads as task names rather than opaque attempt ids. Built from the live
// conversations resource (in the agent-manager that's the full main-DB set);
// rows with no match (e.g. the main `singularity` build, or a push from a
// conversation outside the recent window) fall back to the slug.
const EMPTY_TITLES: Record<string, string> = {};

// Build a partial slug→title map from one conversation list.
function titleMapOf(rows: ConversationRecord[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const c of rows) {
    const title = c.title?.trim();
    if (title) map[slugOf(c.worktreePath)] = title;
  }
  return map;
}

function useTitleBySlug(): Record<string, string> {
  // Subscribe to a derived SLICE — the per-resource slug→title map — via
  // `select`, so the banner re-renders only when a mapping actually changes
  // (structural sharing deep-compares the Record), not on every status flip in
  // the conversations list. One select per keyed sub-resource keeps the lists
  // independent.
  const active = useResource(conversationsActiveResource, undefined, { select: titleMapOf });
  const gone = useResource(conversationsGoneResource, undefined, { select: titleMapOf });
  const system = useResource(conversationsSystemResource, undefined, { select: titleMapOf });
  return useMemo(() => {
    if (active.pending || gone.pending || system.pending) return EMPTY_TITLES;
    // Spread order matches the previous [...system, ...recentGone, ...active]:
    // a live `active` title wins over a stale gone/system one.
    return { ...system.data, ...gone.data, ...active.data };
  }, [active, gone, system]);
}

// Presentational 1s ticker: the op STATE is push-driven via the resource; this
// only re-renders the elapsed clock. Returns the current epoch ms.
function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

// The instant the op's CURRENT phase began. A running push clocks its push time
// from when the lock was granted (`runningAt`); a waiting push and a build clock
// from `startedAt`. So the live timer always measures the phase shown, never
// wait + push lumped together.
function phaseStartedAt(op: WorktreeOp): number {
  return new Date(op.runningAt ?? op.startedAt).getTime();
}

// How long a now-running push spent queued for the lock before it started
// pushing (startedAt → runningAt). null when the op isn't a running push or
// never actually waited.
function waitedMs(op: WorktreeOp): number | null {
  if (op.op !== "push" || op.phase !== "running" || !op.runningAt) return null;
  const ms = new Date(op.runningAt).getTime() - new Date(op.startedAt).getTime();
  return ms > 1000 ? ms : null;
}

function summaryLabel(op: WorktreeOp): string {
  if (op.op === "build") return "Build in progress";
  if (op.op === "check") return "Check in progress";
  return op.phase === "waiting-for-lock" ? "Push queued — waiting for lock" : "Push in progress";
}

const byStartedAt = (a: WorktreeOp, b: WorktreeOp): number =>
  new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime();

// One row in the expanded list. `queuePos` is the 1-based position in the global
// push lock queue (the running push that holds the lock is #1); null for builds,
// which serialize per-worktree and never contend on the global lock.
interface OpRow {
  op: WorktreeOp;
  queuePos: number | null;
  isSelf: boolean;
}

// Build the ordered view: the global push queue first (lock holder, then the
// waiting pushes in request order), then the independent builds and checks,
// which serialize per-worktree and don't contend on the global push lock.
function buildRows(ops: WorktreeOp[], selfSlug: string): OpRow[] {
  const pushes = ops.filter((o) => o.op === "push");
  const running = pushes.filter((o) => o.phase === "running").sort(byStartedAt);
  const waiting = pushes.filter((o) => o.phase === "waiting-for-lock").sort(byStartedAt);
  const unqueued = ops
    .filter((o) => o.op === "build" || o.op === "check")
    .sort(byStartedAt);

  const queue = [...running, ...waiting];
  const pushRows: OpRow[] = queue.map((op, i) => ({
    op,
    queuePos: i + 1,
    isSelf: op.slug === selfSlug,
  }));
  const unqueuedRows: OpRow[] = unqueued.map((op) => ({
    op,
    queuePos: null,
    isSelf: op.slug === selfSlug,
  }));
  return [...pushRows, ...unqueuedRows];
}

function OpRowView({ row, title, now }: { row: OpRow; title?: string; now: number }) {
  const { op, queuePos, isSelf } = row;
  const waiting = op.op === "push" && op.phase === "waiting-for-lock";
  const elapsed = formatElapsed(now - phaseStartedAt(op));
  const waited = waitedMs(op);
  const phaseText =
    op.op === "build"
      ? "Building"
      : op.op === "check"
        ? "Checking"
        : waiting
          ? "Waiting for lock"
          : "Pushing";

  return (
    <Text
      as="div"
      variant="caption"
      className={`flex items-center gap-sm px-md py-xs ${
        isSelf ? "bg-primary/5" : ""
      }`}
    >
      {queuePos !== null ? (
        <span className="w-6 shrink-0 text-center font-mono tabular-nums text-muted-foreground">
          #{queuePos}
        </span>
      ) : (
        <span className="w-6 shrink-0" />
      )}
      {waiting ? (
        <MdHourglassEmpty className="size-3.5 shrink-0 text-warning" />
      ) : (
        <Spinner className="size-3.5 shrink-0" />
      )}
      <span className="min-w-0 flex-1 truncate">
        {title ? <span className="truncate">{title}</span> : <span className="font-mono">{op.slug}</span>}
        {/* eslint-disable-next-line spacing/no-adhoc-spacing -- inline left offset on a trailing label inside a truncating flex cell; not a sibling gap the parent can own */}
        {isSelf && <span className="ml-1.5 text-muted-foreground">(this conversation)</span>}
      </span>
      <span className="shrink-0 text-muted-foreground">{phaseText}</span>
      {waited !== null && (
        <span
          className="shrink-0 text-muted-foreground/70"
          title="Time spent queued for the push lock before pushing started"
        >
          waited {formatElapsed(waited)}
        </span>
      )}
      <span className="shrink-0 font-mono tabular-nums text-muted-foreground">{elapsed}</span>
    </Text>
  );
}

export function OpStatusBanner({ conversation }: { conversation: ConversationRecord }) {
  const result = useResource(worktreeOpsResource);
  const titleBySlug = useTitleBySlug();
  const now = useNow(1000);
  const [expanded, setExpanded] = useState(false);

  const selfSlug = slugOf(conversation.worktreePath);

  if (result.pending) return null;
  const ops = Object.values(result.data);
  const rows = buildRows(ops, selfSlug);
  const op = result.data[selfSlug];
  if (!op) return null;

  const queued = op.op === "push" && op.phase === "waiting-for-lock";
  const elapsed = formatElapsed(now - phaseStartedAt(op));
  const waited = waitedMs(op);
  const others = rows.length - 1;

  return (
    <Text as="div" variant="caption">
    <Clip
      className={`rounded-md border ${
        queued
          ? "border-warning/40 bg-warning/10 text-warning"
          : "border-border bg-muted/30 text-foreground"
      }`}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-sm px-md py-sm text-left hover:bg-foreground/[0.03]"
      >
        {queued ? (
          <MdHourglassEmpty className="size-3.5 shrink-0" />
        ) : (
          <Spinner className="size-3.5 shrink-0" />
        )}
        <span className="flex-1">{summaryLabel(op)}</span>
        {others > 0 && (
          <span className="shrink-0 text-muted-foreground">
            +{others} other{others === 1 ? "" : "s"}
          </span>
        )}
        {waited !== null && (
          <span
            className="shrink-0 text-muted-foreground/70"
            title="Time spent queued for the push lock before pushing started"
          >
            waited {formatElapsed(waited)}
          </span>
        )}
        <span className="shrink-0 font-mono tabular-nums text-muted-foreground">{elapsed}</span>
        {expanded ? (
          <MdExpandLess className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <MdExpandMore className="size-4 shrink-0 text-muted-foreground" />
        )}
      </button>
      {expanded && (
        <div className="border-t border-border/60 bg-background/40 py-xs text-foreground">
          {rows.map((row) => (
            <OpRowView
              key={`${row.op.op}:${row.op.slug}`}
              row={row}
              title={titleBySlug[row.op.slug]}
              now={now}
            />
          ))}
        </div>
      )}
    </Clip>
    </Text>
  );
}
