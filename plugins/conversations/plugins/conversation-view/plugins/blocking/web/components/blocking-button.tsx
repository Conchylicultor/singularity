import { useState, useMemo } from "react";
import { Link, X } from "lucide-react";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export function BlockingButton({
  conversation,
}: {
  conversation: ConversationRecord;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const task = useTask(conversation.taskId);
  const { active } = useConversations();
  const { data: allTasks } = useResource(tasksResource);

  // Tasks that are blocked by the current task (they depend on us)
  const blockedTaskIds = useMemo(() => {
    const myId = conversation.taskId;
    if (!myId) return new Set<string>();
    return new Set(
      allTasks.filter((t) => t.dependencies.includes(myId)).map((t) => t.id),
    );
  }, [allTasks, conversation.taskId]);

  const convByTaskId = useMemo(() => {
    const map = new Map<string, (typeof active)[number]>();
    for (const c of active) {
      if (c.taskId === conversation.taskId) continue;
      if (!c.taskId) continue;
      if (!map.has(c.taskId)) map.set(c.taskId, c);
    }
    return map;
  }, [active, conversation.taskId]);

  const blockedConvs = useMemo(
    () => [...convByTaskId.values()].filter((c) => blockedTaskIds.has(c.taskId!)),
    [convByTaskId, blockedTaskIds],
  );

  const orphanBlockedIds = useMemo(
    () => [...blockedTaskIds].filter((id) => !convByTaskId.has(id)),
    [blockedTaskIds, convByTaskId],
  );

  const candidates = useMemo(
    () =>
      [...convByTaskId.values()].filter((c) => !blockedTaskIds.has(c.taskId!)),
    [convByTaskId, blockedTaskIds],
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

  async function addBlocked(selectedConv: (typeof active)[number]) {
    const blockedTaskId = selectedConv.taskId!;
    setBusy(blockedTaskId);
    try {
      const res = await fetch(
        `/api/tasks/${encodeURIComponent(blockedTaskId)}/dependencies`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dependsOnTaskId: conversation.taskId }),
        },
      );
      if (!res.ok && res.status !== 204) {
        Shell.Toast({
          description: (await res.text()) || "Failed to add dependency",
          variant: "error",
        });
        return;
      }
      await fetch("/api/conversations-queue/rerank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: selectedConv.id }),
      });
    } finally {
      setBusy(null);
    }
  }

  async function removeBlocked(blockedTaskId: string, blockedConvId?: string) {
    setBusy(blockedTaskId);
    try {
      await fetch(
        `/api/tasks/${encodeURIComponent(blockedTaskId)}/dependencies/${encodeURIComponent(conversation.taskId)}`,
        { method: "DELETE" },
      );
      if (blockedConvId) {
        await fetch("/api/conversations-queue/rerank", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId: blockedConvId }),
        });
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={buttonVariants({
          variant: "outline",
          size: blockedTaskIds.size > 0 ? "xs" : "icon-sm",
        })}
        title="Blocking…"
        aria-label="Blocking"
      >
        <Link className="size-3" />
        {blockedTaskIds.size > 0 && (
          <span className="text-[10px] tabular-nums">{blockedTaskIds.size}</span>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-96 p-2" align="end">
        <SectionLabel className="mb-1.5 text-[10px]">
          Blocking
        </SectionLabel>

        {(blockedConvs.length > 0 || orphanBlockedIds.length > 0) && (
          <ul className="mb-2 space-y-px">
            {blockedConvs.map((c) => (
              <li key={c.taskId} className="flex items-center gap-1">
                <div className="flex-1 overflow-hidden">
                  <ConversationItem conv={c} layout="inline" />
                </div>
                <button
                  type="button"
                  onClick={() => removeBlocked(c.taskId!, c.id)}
                  disabled={busy === c.taskId}
                  className="hover:bg-destructive/10 hover:text-destructive shrink-0 rounded p-0.5"
                  aria-label="Remove"
                >
                  <X className="size-3" />
                </button>
              </li>
            ))}
            {orphanBlockedIds.map((id) => {
              const blockedTask = allTasks.find((t) => t.id === id);
              const isTerminal =
                blockedTask?.status === "done" || blockedTask?.status === "dropped";
              return (
                <li key={id} className="flex items-center gap-1">
                  <span
                    className={`flex-1 truncate text-xs ${isTerminal ? "text-muted-foreground line-through" : ""}`}
                  >
                    {blockedTask?.title ?? id}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeBlocked(id)}
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
                  onClick={() => void addBlocked(c)}
                  disabled={busy !== null}
                >
                  <ConversationItem conv={c} layout="inline" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
