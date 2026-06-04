import { useEffect, useMemo, useState } from "react";
import { MdExpandLess, MdExpandMore, MdHourglassEmpty } from "react-icons/md";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { Spinner } from "@plugins/primitives/plugins/spinner/web";
import type { ConversationRecord } from "@plugins/conversations/plugins/conversation-view/web";
import { worktreeOpsResource, type WorktreeOp } from "../../shared";

// The op markers are keyed on the worktree directory basename, exactly how the
// status poller keys them (`basename(worktreePath)`). Avoid node:path in the
// browser — derive the basename by hand.
function slugOf(worktreePath: string): string {
  const parts = worktreePath.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? worktreePath;
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

function summaryLabel(op: WorktreeOp): string {
  if (op.op === "build") return "Build in progress";
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
// waiting pushes in request order), then the independent builds.
function buildRows(ops: WorktreeOp[], selfSlug: string): OpRow[] {
  const pushes = ops.filter((o) => o.op === "push");
  const running = pushes.filter((o) => o.phase === "running").sort(byStartedAt);
  const waiting = pushes.filter((o) => o.phase === "waiting-for-lock").sort(byStartedAt);
  const builds = ops.filter((o) => o.op === "build").sort(byStartedAt);

  const queue = [...running, ...waiting];
  const pushRows: OpRow[] = queue.map((op, i) => ({
    op,
    queuePos: i + 1,
    isSelf: op.slug === selfSlug,
  }));
  const buildRows: OpRow[] = builds.map((op) => ({
    op,
    queuePos: null,
    isSelf: op.slug === selfSlug,
  }));
  return [...pushRows, ...buildRows];
}

function OpRowView({ row, now }: { row: OpRow; now: number }) {
  const { op, queuePos, isSelf } = row;
  const waiting = op.op === "push" && op.phase === "waiting-for-lock";
  const elapsed = formatElapsed(now - new Date(op.startedAt).getTime());
  const phaseText =
    op.op === "build" ? "Building" : waiting ? "Waiting for lock" : "Pushing";

  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 text-xs ${
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
      <span className="min-w-0 flex-1 truncate font-mono">
        {op.slug}
        {isSelf && <span className="ml-1.5 text-muted-foreground">(this conversation)</span>}
      </span>
      <span className="shrink-0 text-muted-foreground">{phaseText}</span>
      <span className="shrink-0 font-mono tabular-nums text-muted-foreground">{elapsed}</span>
    </div>
  );
}

export function OpStatusBanner({ conversation }: { conversation: ConversationRecord }) {
  const result = useResource(worktreeOpsResource);
  const now = useNow(1000);
  const [expanded, setExpanded] = useState(false);

  const selfSlug = slugOf(conversation.worktreePath);
  const ops = useMemo(
    () => (result.pending ? [] : Object.values(result.data)),
    [result],
  );
  const rows = useMemo(() => buildRows(ops, selfSlug), [ops, selfSlug]);

  if (result.pending) return null;
  const op = result.data[selfSlug];
  if (!op) return null;

  const queued = op.op === "push" && op.phase === "waiting-for-lock";
  const elapsed = formatElapsed(now - new Date(op.startedAt).getTime());
  const others = rows.length - 1;

  return (
    <div
      className={`overflow-hidden rounded-md border text-xs ${
        queued
          ? "border-warning/40 bg-warning/10 text-warning"
          : "border-border bg-muted/30 text-foreground"
      }`}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-foreground/[0.03]"
      >
        {queued ? (
          <MdHourglassEmpty className="size-3.5 shrink-0" />
        ) : (
          <Spinner className="size-3.5 shrink-0" />
        )}
        <span className="flex-1 leading-snug">{summaryLabel(op)}</span>
        {others > 0 && (
          <span className="shrink-0 text-muted-foreground">
            +{others} other{others === 1 ? "" : "s"}
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
        <div className="border-t border-border/60 bg-background/40 py-1 text-foreground">
          {rows.map((row) => (
            <OpRowView key={`${row.op.op}:${row.op.slug}`} row={row} now={now} />
          ))}
        </div>
      )}
    </div>
  );
}
