import { useState, useMemo } from "react";
import { Link2, X } from "lucide-react";
import { SectionLabel } from "@plugins/primitives/plugins/section-label/web";
import type { ConversationRecord } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversations } from "@plugins/conversations/web";
import { ConversationItem } from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import { useTask } from "@plugins/tasks/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { SearchInput, useTextFilter } from "@plugins/primitives/plugins/search/web";
import { tasksResource } from "@plugins/tasks/core";
import { ShellCommands as Shell } from "@plugins/shell/web";
import { buttonVariants } from "@/components/ui/button";
import { InlinePopover } from "@plugins/primitives/plugins/popover/web";

export function BlockedByButton({
  conversation,
}: {
  conversation: ConversationRecord;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const task = useTask(conversation.taskId);
  const { active } = useConversations();
  const { data: allTasks } = useResource(tasksResource);

  const depTaskIds = useMemo(
    () => new Set(task?.dependencies ?? []),
    [task?.dependencies],
  );

  const convByTaskId = useMemo(() => {
    const map = new Map<string, (typeof active)[number]>();
    for (const c of active) {
      if (c.taskId === conversation.taskId) continue;
      if (!c.taskId) continue;
      if (!map.has(c.taskId)) map.set(c.taskId, c);
    }
    return map;
  }, [active, conversation.taskId]);

  const blockerConvs = useMemo(
    () => [...convByTaskId.values()].filter((c) => depTaskIds.has(c.taskId!)),
    [convByTaskId, depTaskIds],
  );

  const orphanDepIds = useMemo(
    () => [...depTaskIds].filter((id) => !convByTaskId.has(id)),
    [depTaskIds, convByTaskId],
  );

  const candidates = useMemo(
    () => [...convByTaskId.values()].filter((c) => !depTaskIds.has(c.taskId!)),
    [convByTaskId, depTaskIds],
  );
  const {
    query: search,
    setQuery: setSearch,
    filtered: availableConvs,
  } = useTextFilter({
    items: candidates,
    accessor: (c) => c.title ?? "",
  });

  if (!conversation.taskId || !task) return null;

  async function addBlocker(selectedConv: (typeof active)[number]) {
    const depTaskId = selectedConv.taskId!;
    setBusy(depTaskId);
    try {
      const res = await fetch(
        `/api/tasks/${encodeURIComponent(conversation.taskId)}/dependencies`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dependsOnTaskId: depTaskId }),
        },
      );
      if (!res.ok && res.status !== 204) {
        Shell.Toast({
          description: (await res.text()) || "Failed to add dependency",
          variant: "error",
        });
      }
    } finally {
      setBusy(null);
    }
  }

  async function removeBlocker(depTaskId: string) {
    setBusy(depTaskId);
    try {
      await fetch(
        `/api/tasks/${encodeURIComponent(conversation.taskId)}/dependencies/${encodeURIComponent(depTaskId)}`,
        { method: "DELETE" },
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <InlinePopover
      open={open}
      onOpenChange={setOpen}
      trigger={
        <button
          className={buttonVariants({
            variant: "outline",
            size: depTaskIds.size > 0 ? "xs" : "icon-sm",
          })}
          title="Blocked by…"
          aria-label="Blocked by"
        >
          <Link2 className="size-3" />
          {depTaskIds.size > 0 && (
            <span className="text-[10px] tabular-nums">{depTaskIds.size}</span>
          )}
        </button>
      }
      align="end"
      contentClassName="w-96 p-2"
    >
        <SectionLabel className="mb-1.5 text-[10px]">
          Blocked by
        </SectionLabel>

        {(blockerConvs.length > 0 || orphanDepIds.length > 0) && (
          <ul className="mb-2 space-y-px">
            {blockerConvs.map((c) => (
              <li key={c.taskId} className="flex items-center gap-1">
                <div className="flex-1 overflow-hidden">
                  <ConversationItem conv={c} layout="inline" />
                </div>
                <button
                  type="button"
                  onClick={() => removeBlocker(c.taskId!)}
                  disabled={busy === c.taskId}
                  className="hover:bg-destructive/10 hover:text-destructive shrink-0 rounded p-0.5"
                  aria-label="Remove"
                >
                  <X className="size-3" />
                </button>
              </li>
            ))}
            {orphanDepIds.map((id) => {
              const depTask = allTasks.find((t) => t.id === id);
              const isTerminal =
                depTask?.status === "done" || depTask?.status === "dropped";
              return (
                <li key={id} className="flex items-center gap-1">
                  <span
                    className={`flex-1 truncate text-xs ${isTerminal ? "text-muted-foreground line-through" : ""}`}
                  >
                    {depTask?.title ?? id}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeBlocker(id)}
                    disabled={busy === id}
                    className="hover:bg-destructive/10 hover:text-destructive shrink-0 rounded p-0.5"
                    aria-label="Remove"
                  >
                    <X className="size-3" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <SearchInput
          placeholder="Search conversations…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          wrapperClassName="mb-1.5"
        />
        {availableConvs.length === 0 ? (
          <div className="py-2 text-center text-xs text-muted-foreground">
            No conversations found
          </div>
        ) : (
          <ul className="max-h-64 space-y-px overflow-y-auto">
            {availableConvs.map((c) => (
              <li key={c.taskId}>
                <button
                  type="button"
                  className="w-full rounded px-2 py-1 text-left hover:bg-accent disabled:opacity-50"
                  onClick={() => void addBlocker(c)}
                  disabled={busy !== null}
                >
                  <ConversationItem conv={c} layout="inline" />
                </button>
              </li>
            ))}
          </ul>
        )}
    </InlinePopover>
  );
}
