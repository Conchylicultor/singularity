import { useEffect, useState } from "react";
import { MdHourglassEmpty } from "react-icons/md";
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

function labelFor(op: WorktreeOp): string {
  if (op.op === "build") return "Build in progress";
  return op.phase === "waiting-for-lock" ? "Push queued — waiting for lock" : "Push in progress";
}

export function OpStatusBanner({ conversation }: { conversation: ConversationRecord }) {
  const result = useResource(worktreeOpsResource);
  const now = useNow(1000);
  if (result.pending) return null;
  const op = result.data[slugOf(conversation.worktreePath)];
  if (!op) return null;

  const queued = op.op === "push" && op.phase === "waiting-for-lock";
  const elapsed = formatElapsed(now - new Date(op.startedAt).getTime());

  return (
    <div
      className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs ${
        queued
          ? "border-warning/40 bg-warning/10 text-warning"
          : "border-border bg-muted/30 text-foreground"
      }`}
    >
      {queued ? (
        <MdHourglassEmpty className="size-3.5 shrink-0" />
      ) : (
        <Spinner className="size-3.5 shrink-0" />
      )}
      <span className="flex-1 leading-snug">{labelFor(op)}</span>
      <span className="shrink-0 font-mono tabular-nums text-muted-foreground">{elapsed}</span>
    </div>
  );
}
