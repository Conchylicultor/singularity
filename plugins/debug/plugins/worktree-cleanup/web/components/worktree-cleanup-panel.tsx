import { useCallback, useEffect, useState } from "react";
import { MdDelete, MdFolderDelete, MdWarning } from "react-icons/md";
import { Badge } from "@plugins/primitives/plugins/badge/web";
import { Spinner } from "@plugins/primitives/plugins/spinner/web";
import { Placeholder } from "@plugins/primitives/plugins/placeholder/web";
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
type BulkDeleteResponse =
  | { ok: true; succeeded: number; failed: { id: string; error: string }[] }
  | { ok: false; error: string };

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
    done: "bg-success/10 text-success",
    dropped: "bg-muted text-muted-foreground",
    in_progress: "bg-info/10 text-info",
    need_action: "bg-warning/10 text-warning",
    attempted: "bg-muted text-muted-foreground",
  };
  return (
    <Badge size="sm" colorClass={color[status]} className="inline-block">
      {status}
    </Badge>
  );
}

function DirtyIndicator({ entry }: { entry: WorktreeEntry }) {
  if (!entry.dirExists && !entry.dbExists) {
    return <span className="text-xs text-success">fully clean</span>;
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
    <span className="flex items-center gap-1 text-xs text-warning">
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
    await load();
  }, [load]);

  const deleteSafe = useCallback(async () => {
    if (!entries) return;
    const safeIds = entries.filter((e) => e.isSafe).map((e) => e.attemptId);
    if (safeIds.length === 0) return;

    setBulkResult(null);
    setLoading(true);
    try {
      const res = await fetch("/api/debug/worktrees/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: safeIds }),
      });
      const data = (await res.json()) as BulkDeleteResponse;
      if (data.ok) {
        const { succeeded, failed } = data;
        setBulkResult(
          failed.length === 0
            ? `Deleted ${succeeded} worktree${succeeded !== 1 ? "s" : ""}`
            : `Deleted ${succeeded}, ${failed.length} error${failed.length !== 1 ? "s" : ""}`,
        );
        if (failed.length > 0) {
          setRowErrors(new Map(failed.map((f) => [f.id, f.error])));
        }
      } else {
        setBulkResult(`Error: ${data.error}`);
      }
    } catch (e) {
      setBulkResult(`Error: ${String(e)}`);
    } finally {
      setLoading(false);
    }
    await load();
  }, [entries, load]);

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
            <Spinner spinning={loading} className="size-4" />
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
          <Placeholder tone="error">{listError}</Placeholder>
        ) : loading && !entries ? (
          <Placeholder>Loading…</Placeholder>
        ) : entries?.length === 0 ? (
          <Placeholder>No worktrees found.</Placeholder>
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
          {!entry.dirExists && !entry.dbExists ? (
            <Button size="sm" variant="ghost" disabled className="h-7 text-xs opacity-40 cursor-default">
              <MdDelete className="size-3.5 mr-1" />
              Drop DB
            </Button>
          ) : (
            <Button
              size="sm"
              variant={entry.isSafe || !entry.dirExists ? "outline" : "ghost"}
              onClick={onDelete}
              disabled={deletingStep != null}
              className="h-7 text-xs"
            >
              {deletingStep != null ? (
                <>
                  <Spinner className="size-3.5 mr-1" />
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
        <tr className="border-b bg-warning/5">
          <td colSpan={5} className="px-4 py-2">
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs text-warning">
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
