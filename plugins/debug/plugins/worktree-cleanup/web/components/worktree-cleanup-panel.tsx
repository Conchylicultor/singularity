import { useCallback, useEffect, useState } from "react";
import { MdDelete, MdFolderDelete, MdRefresh, MdWarning } from "react-icons/md";
import { Button } from "@/components/ui/button";

type WorktreeEntry = {
  attemptId: string;
  taskId: string;
  taskTitle: string;
  taskStatus: string;
  attemptStatus: string;
  worktreePath: string;
  createdAt: string;
  dirExists: boolean;
  dbExists: boolean;
  unpushedCount: number;
  isDirty: boolean;
  isSafe: boolean;
};

type ListResponse = { ok: true; entries: WorktreeEntry[] } | { ok: false; error: string };
type DeleteEvent =
  | { step: "worktree" | "database" }
  | { ok: true }
  | { ok: false; error: string };

type DeletingStep = "worktree" | "database";

function relativeAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d`;
  return `${Math.floor(days / 30)}mo`;
}

function StatusBadge({ status }: { status: string }) {
  const color: Record<string, string> = {
    done: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    dropped: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
    in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    need_action: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    attempted: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  };
  return (
    <span
      className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${color[status] ?? "bg-muted text-muted-foreground"}`}
    >
      {status}
    </span>
  );
}

function DirtyIndicator({ entry }: { entry: WorktreeEntry }) {
  if (!entry.dirExists && !entry.dbExists) {
    return <span className="text-xs text-green-600 dark:text-green-400">fully clean</span>;
  }
  if (!entry.dirExists) {
    return <span className="text-xs text-muted-foreground italic">no dir</span>;
  }
  if (entry.isSafe) {
    return <span className="text-xs text-muted-foreground">clean</span>;
  }
  const parts: string[] = [];
  if (entry.unpushedCount > 0) parts.push(`${entry.unpushedCount} unpushed`);
  if (entry.isDirty) parts.push("uncommitted");
  return (
    <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
      <MdWarning className="size-3.5 shrink-0" />
      {parts.join(", ")}
    </span>
  );
}

export function WorktreeCleanupPanel() {
  const [entries, setEntries] = useState<WorktreeEntry[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [deletingSteps, setDeletingSteps] = useState<Map<string, DeletingStep>>(new Map());
  const [confirmDirtyId, setConfirmDirtyId] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Map<string, string>>(new Map());
  const [bulkResult, setBulkResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setListError(null);
    setBulkResult(null);
    try {
      const res = await fetch("/api/debug/worktrees");
      const data = (await res.json()) as ListResponse;
      if (data.ok) {
        setEntries(data.entries);
      } else {
        setListError(data.error);
      }
    } catch (e) {
      setListError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const deleteOne = useCallback(async (id: string) => {
    setDeletingSteps((prev) => new Map(prev).set(id, "worktree"));
    setRowErrors((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
    try {
      const res = await fetch(`/api/debug/worktrees/${id}`, { method: "DELETE" });
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as DeleteEvent;
          if ("step" in event) {
            setDeletingSteps((prev) => new Map(prev).set(id, event.step));
          } else if (!event.ok) {
            setRowErrors((prev) => new Map(prev).set(id, event.error));
          }
        }
      }
    } catch (e) {
      setRowErrors((prev) => new Map(prev).set(id, String(e)));
    } finally {
      setDeletingSteps((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
    }
  }, []);

  const deleteSafe = useCallback(async () => {
    if (!entries) return;
    const safeIds = entries.filter((e) => e.isSafe).map((e) => e.attemptId);
    if (safeIds.length === 0) return;

    setBulkResult(null);
    const results = await Promise.allSettled(safeIds.map((id) => deleteOne(id)));
    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;
    setBulkResult(
      failed === 0
        ? `Deleted ${succeeded} worktree${succeeded !== 1 ? "s" : ""}`
        : `Deleted ${succeeded}, ${failed} error${failed !== 1 ? "s" : ""}`,
    );
    await load();
  }, [entries, deleteOne, load]);

  const safeCount = entries?.filter((e) => e.isSafe).length ?? 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-sm font-semibold shrink-0">Worktree Cleanup</h2>
          {entries && (
            <span className="text-xs text-muted-foreground truncate">
              {entries.length} worktree{entries.length !== 1 ? "s" : ""} · {safeCount} safe to delete
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="destructive"
            onClick={deleteSafe}
            disabled={loading || safeCount === 0 || deletingSteps.size > 0}
          >
            <MdFolderDelete className="size-4 mr-1.5" />
            Delete {safeCount} safe
          </Button>
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <MdRefresh className={`size-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Bulk result banner */}
      {bulkResult && (
        <div className="px-4 py-2 text-xs bg-muted text-muted-foreground border-b">
          {bulkResult}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {listError ? (
          <div className="p-6 text-sm text-destructive">{listError}</div>
        ) : loading && !entries ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : entries?.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">No worktrees found.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="text-left font-medium px-4 py-2">Task</th>
                <th className="text-left font-medium px-4 py-2">Age</th>
                <th className="text-left font-medium px-4 py-2">Dirty?</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {entries?.map((entry) => (
                <EntryRow
                  key={entry.attemptId}
                  entry={entry}
                  deletingStep={deletingSteps.get(entry.attemptId) ?? null}
                  highlighted={entry.isSafe}
                  error={rowErrors.get(entry.attemptId) ?? null}
                  confirmOpen={confirmDirtyId === entry.attemptId}
                  onDelete={() => {
                    if (!entry.isSafe && entry.dirExists) {
                      setConfirmDirtyId(entry.attemptId);
                    } else {
                      void deleteOne(entry.attemptId);
                    }
                  }}
                  onConfirm={() => {
                    setConfirmDirtyId(null);
                    void deleteOne(entry.attemptId);
                  }}
                  onCancelConfirm={() => setConfirmDirtyId(null)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const STEP_LABEL: Record<DeletingStep, string> = {
  worktree: "Removing…",
  database: "Dropping DB…",
};

function EntryRow({
  entry,
  deletingStep,
  highlighted,
  error,
  confirmOpen,
  onDelete,
  onConfirm,
  onCancelConfirm,
}: {
  entry: WorktreeEntry;
  deletingStep: DeletingStep | null;
  highlighted: boolean;
  error: string | null;
  confirmOpen: boolean;
  onDelete: () => void;
  onConfirm: () => void;
  onCancelConfirm: () => void;
}) {
  const branchName = entry.worktreePath.split("/").pop() ?? entry.attemptId;

  return (
    <>
      <tr className={`border-b transition-colors ${highlighted ? "bg-destructive/10" : "hover:bg-muted/30"}`}>
        <td className="px-4 py-2 max-w-[220px]">
          <div className="flex flex-col gap-0.5">
            <span className="truncate font-medium text-xs" title={entry.taskTitle}>
              {entry.taskTitle}
            </span>
            <div className="flex items-center gap-1">
              <StatusBadge status={entry.taskStatus} />
              <span className="text-[10px] text-muted-foreground font-mono truncate">
                {branchName}
              </span>
            </div>
          </div>
        </td>
        <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">
          {relativeAge(entry.createdAt)}
        </td>
        <td className="px-4 py-2">
          <DirtyIndicator entry={entry} />
        </td>
        <td className="px-4 py-2 text-right whitespace-nowrap">
          {!entry.dirExists && !entry.dbExists ? null : (
            <Button
              size="sm"
              variant={entry.isSafe || !entry.dirExists ? "outline" : "ghost"}
              onClick={onDelete}
              disabled={deletingStep != null}
              className="h-7 text-xs"
            >
              {deletingStep != null ? (
                <>
                  <MdRefresh className="size-3.5 animate-spin mr-1" />
                  {STEP_LABEL[deletingStep]}
                </>
              ) : (
                <>
                  <MdDelete className="size-3.5 mr-1" />
                  {entry.dirExists ? "Delete" : "Drop DB"}
                </>
              )}
            </Button>
          )}
        </td>
      </tr>

      {/* Inline confirmation for dirty worktrees */}
      {confirmOpen && (
        <tr className="border-b bg-amber-50 dark:bg-amber-950/30">
          <td colSpan={5} className="px-4 py-2">
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs text-amber-700 dark:text-amber-300">
                This worktree has unpushed commits or uncommitted changes. Delete anyway?
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <Button size="sm" variant="outline" onClick={onCancelConfirm} className="h-7 text-xs">
                  Cancel
                </Button>
                <Button size="sm" variant="destructive" onClick={onConfirm} className="h-7 text-xs">
                  Delete
                </Button>
              </div>
            </div>
          </td>
        </tr>
      )}

      {/* Per-row error */}
      {error && (
        <tr className="border-b">
          <td colSpan={5} className="px-4 py-1.5">
            <span className="text-xs text-destructive">{error}</span>
          </td>
        </tr>
      )}
    </>
  );
}
