import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MdDelete, MdFolderDelete, MdRefresh, MdWarning } from "react-icons/md";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Spinner } from "@plugins/primitives/plugins/css/plugins/spinner/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { fetchEndpoint, getEndpointErrorMessage } from "@plugins/infra/plugins/endpoints/web";
import { interpolatePath } from "@plugins/infra/plugins/endpoints/core";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { readNdjson } from "@plugins/infra/plugins/ndjson-stream/web";
import {
  listWorktrees,
  bulkDeleteWorktrees,
  deleteWorktree,
  WorktreeEntrySchema,
  type WorktreeEntry,
} from "../../shared/endpoints";

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
    done: "bg-success/10 text-success",
    dropped: "bg-muted text-muted-foreground",
    in_progress: "bg-info/10 text-info",
    need_action: "bg-warning/10 text-warning",
    attempted: "bg-muted text-muted-foreground",
  };
  return (
    <Badge colorClass={color[status]} className="inline-block">
      {status}
    </Badge>
  );
}

function DirtyIndicator({ entry }: { entry: WorktreeEntry }) {
  if (!entry.dirExists && !entry.dbExists) {
    return <Text as="span" variant="caption" className="text-success">fully clean</Text>;
  }
  if (!entry.dirExists) {
    return <Text as="span" variant="caption" className="text-muted-foreground italic">no dir</Text>;
  }
  if (entry.isSafe) {
    return <Text as="span" variant="caption" className="text-muted-foreground">clean</Text>;
  }
  const parts: string[] = [];
  if (entry.unpushedCount > 0) parts.push(`${entry.unpushedCount} unpushed`);
  if (entry.isDirty) parts.push("uncommitted");
  return (
    <Text as="div" variant="caption" className="text-warning">
      <Stack direction="row" gap="xs" align="center">
        <MdWarning className="size-3.5" />
        {parts.join(", ")}
      </Stack>
    </Text>
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

  const loadAbort = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    loadAbort.current?.abort();
    const ctrl = new AbortController();
    loadAbort.current = ctrl;

    setLoading(true);
    setListError(null);
    setBulkResult(null);
    setEntries([]);

    const acc: WorktreeEntry[] = [];
    let ended = false;
    let sinceFlush = 0;
    try {
      for await (const frame of readNdjson(
        listWorktrees.route,
        interpolatePath(listWorktrees.path, {}),
        { signal: ctrl.signal },
      )) {
        if ("error" in frame) throw new Error(String(frame.error));
        if ("end" in frame) {
          ended = true;
          continue;
        }
        acc.push(WorktreeEntrySchema.parse((frame as { item: unknown }).item));
        // Batch renders (~25 setEntries for 1257 rows) instead of one per row.
        if (++sinceFlush >= 50) {
          sinceFlush = 0;
          setEntries([...acc]);
        }
      }
      setEntries([...acc]);
      // A dropped socket yields no terminal sentinel — fail loud rather than
      // render a partial list as if it were complete.
      if (!ended) throw new Error("worktree list stream truncated");
    } catch (e) {
      if (ctrl.signal.aborted) return; // superseded by a newer load / unmount
      setListError(getEndpointErrorMessage(e));
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Abort any in-flight stream on unmount.
  useEffect(() => () => loadAbort.current?.abort(), []);

  const deleteOne = useCallback(async (id: string) => {
    setDeletingSteps((prev) => new Map(prev).set(id, "worktree"));
    setRowErrors((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
    try {
      for await (const frame of readNdjson(
        deleteWorktree.route,
        interpolatePath(deleteWorktree.path, { id }),
        { method: "DELETE" },
      )) {
        const event = frame as DeleteEvent;
        if ("step" in event) {
          setDeletingSteps((prev) => new Map(prev).set(id, event.step));
        } else if (!event.ok) {
          setRowErrors((prev) => new Map(prev).set(id, event.error));
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
      const { succeeded, failed } = await fetchEndpoint(
        bulkDeleteWorktrees,
        {},
        { body: { ids: safeIds } },
      );
      setBulkResult(
        failed.length === 0
          ? `Deleted ${succeeded} worktree${succeeded !== 1 ? "s" : ""}`
          : `Deleted ${succeeded}, ${failed.length} error${failed.length !== 1 ? "s" : ""}`,
      );
      if (failed.length > 0) {
        setRowErrors(new Map(failed.map((f) => [f.id, f.error])));
      }
    } catch (e) {
      setBulkResult(`Error: ${getEndpointErrorMessage(e)}`);
    } finally {
      setLoading(false);
    }
    await load();
  }, [entries, load]);

  // Server streams rows in completion order; sort for display (was a server sort).
  const sortedEntries = useMemo(
    () => (entries ? [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : null),
    [entries],
  );

  const safeCount = entries?.filter((e) => e.isSafe).length ?? 0;

  return (
    <Stack gap="none" className="h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-lg py-md border-b gap-md">
        <div className="flex items-center gap-sm min-w-0">
          <Text as="h2" variant="label" className="font-semibold shrink-0">Worktree Cleanup</Text>
          {entries && entries.length > 0 && (
            <Text as="span" variant="caption" className="text-muted-foreground truncate">
              {entries.length} worktree{entries.length !== 1 ? "s" : ""} · {safeCount} safe to delete
            </Text>
          )}
        </div>
        <div className="flex items-center gap-sm shrink-0">
          <Button
            variant="destructive"
            onClick={deleteSafe}
            loading={loading || deletingSteps.size > 0}
            disabled={safeCount === 0}
          >
            {/* eslint-disable-next-line spacing/no-adhoc-spacing -- icon-to-label inset inside a Button; parent is a 3rd-party Button, no gap to own it */}
            <MdFolderDelete className="size-4 mr-1.5" />
            Delete {safeCount} safe
          </Button>
          <Button aspect="icon" variant="outline" onClick={() => load()} loading={loading}>
            <MdRefresh className="size-4" />
          </Button>
        </div>
      </div>

      {/* Automatic-reaper policy note */}
      <Text as="div" variant="caption" className="px-lg py-sm text-muted-foreground border-b">
        Orphaned forks are dropped hourly; worktrees are deleted automatically after 30 days. Use the controls below to reap early.
      </Text>

      {/* Bulk result banner */}
      {bulkResult && (
        <Text as="div" variant="caption" className="px-lg py-sm bg-muted text-muted-foreground border-b">
          {bulkResult}
        </Text>
      )}

      {/* Content */}
      <Scroll axis="both" fill>
        {listError ? (
          <Placeholder tone="error">{listError}</Placeholder>
        ) : loading && (!sortedEntries || sortedEntries.length === 0) ? (
          <Loading />
        ) : sortedEntries?.length === 0 ? (
          <Placeholder>No worktrees found.</Placeholder>
        ) : (
          <table className="w-full text-body">
            <thead>
              <tr className="border-b text-caption text-muted-foreground">
                <th className="text-left font-medium px-lg py-sm">Task</th>
                <th className="text-left font-medium px-lg py-sm">Age</th>
                <th className="text-left font-medium px-lg py-sm">Dirty?</th>
                <th className="px-lg py-sm" />
              </tr>
            </thead>
            <tbody>
              {sortedEntries?.map((entry) => (
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
      </Scroll>
    </Stack>
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
        <td className="px-lg py-sm max-w-[220px]">
          <Stack gap="2xs">
            <Text as="span" variant="caption" className="truncate font-medium" title={entry.taskTitle}>
              {entry.taskTitle}
            </Text>
            <Stack direction="row" gap="xs" align="center">
              <StatusBadge status={entry.taskStatus} />
              <span className="text-3xs text-muted-foreground font-mono truncate">
                {branchName}
              </span>
            </Stack>
          </Stack>
        </td>
        <td className="px-lg py-sm text-caption text-muted-foreground whitespace-nowrap">
          {relativeAge(entry.createdAt)}
        </td>
        <td className="px-lg py-sm">
          <DirtyIndicator entry={entry} />
        </td>
        <td className="px-lg py-sm text-right whitespace-nowrap">
          {!entry.dirExists && !entry.dbExists ? (
            <Button variant="ghost" disabled className="h-7 text-caption opacity-40 cursor-default">
              {/* eslint-disable-next-line spacing/no-adhoc-spacing -- icon-to-label inset inside a Button; parent is a 3rd-party Button, no gap to own it */}
              <MdDelete className="size-3.5 mr-1" />
              Drop DB
            </Button>
          ) : (
            <Button
              variant={entry.isSafe || !entry.dirExists ? "outline" : "ghost"}
              onClick={onDelete}
              disabled={deletingStep != null}
              className="h-7 text-caption"
            >
              {deletingStep != null ? (
                <>
                  {/* eslint-disable-next-line spacing/no-adhoc-spacing -- icon-to-label inset inside a Button; parent is a 3rd-party Button, no gap to own it */}
                  <Spinner className="size-3.5 mr-1" />
                  {STEP_LABEL[deletingStep]}
                </>
              ) : (
                <>
                  {/* eslint-disable-next-line spacing/no-adhoc-spacing -- icon-to-label inset inside a Button; parent is a 3rd-party Button, no gap to own it */}
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
          <td colSpan={5} className="px-lg py-sm">
            <div className="flex items-center justify-between gap-lg">
              <Text as="span" variant="caption" className="text-warning">
                This worktree has unpushed commits or uncommitted changes. Delete anyway?
              </Text>
              <div className="flex items-center gap-sm shrink-0">
                <Button variant="outline" onClick={onCancelConfirm} className="h-7 text-caption">
                  Cancel
                </Button>
                <Button variant="destructive" onClick={onConfirm} className="h-7 text-caption">
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
          <td colSpan={5} className="px-lg py-xs">
            <Text as="span" variant="caption" className="text-destructive">{error}</Text>
          </td>
        </tr>
      )}
    </>
  );
}
