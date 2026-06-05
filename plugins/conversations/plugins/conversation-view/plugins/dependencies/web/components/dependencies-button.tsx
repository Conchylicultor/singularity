import { useState, useMemo, useCallback } from "react";
import { MdLink } from "react-icons/md";
import type { ConversationRecord } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversations } from "@plugins/conversations/web";
import { useTask } from "@plugins/tasks/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { tasksResource } from "@plugins/tasks/core";
import { toast } from "@plugins/notifications/web";
import { buttonVariants } from "@/components/ui/button";
import { InlinePopover } from "@plugins/primitives/plugins/popover/web";
import { WithTooltip } from "@plugins/primitives/plugins/tooltip/web";
import { cn } from "@/lib/utils";
import { DepPopoverContent } from "./dep-popover-content";

export function DependenciesButton({
  conversation,
}: {
  conversation: ConversationRecord;
}) {
  const [blockedByOpen, setBlockedByOpen] = useState(false);
  const [blockingOpen, setBlockingOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const task = useTask(conversation.taskId);
  const conv = useConversations();
  const active = useMemo(() => (conv.pending ? [] : conv.active), [conv]);
  const tasksResult = useResource(tasksResource);
  const allTasks = useMemo(() => (tasksResult.pending ? [] : tasksResult.data), [tasksResult]);

  const depTaskIds = useMemo(
    () => new Set(task?.dependencies ?? []),
    [task?.dependencies],
  );

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

  // Blocked-by direction
  const blockerConvs = useMemo(
    () => [...convByTaskId.values()].filter((c) => depTaskIds.has(c.taskId!)),
    [convByTaskId, depTaskIds],
  );
  const orphanDepIds = useMemo(
    () => [...depTaskIds].filter((id) => !convByTaskId.has(id)),
    [depTaskIds, convByTaskId],
  );
  const blockedByCandidates = useMemo(
    () => [...convByTaskId.values()].filter((c) => !depTaskIds.has(c.taskId!)),
    [convByTaskId, depTaskIds],
  );

  // Blocking direction
  const blockedConvs = useMemo(
    () =>
      [...convByTaskId.values()].filter((c) => blockedTaskIds.has(c.taskId!)),
    [convByTaskId, blockedTaskIds],
  );
  const orphanBlockedIds = useMemo(
    () => [...blockedTaskIds].filter((id) => !convByTaskId.has(id)),
    [blockedTaskIds, convByTaskId],
  );
  const blockingCandidates = useMemo(
    () =>
      [...convByTaskId.values()].filter((c) => !blockedTaskIds.has(c.taskId!)),
    [convByTaskId, blockedTaskIds],
  );

  const addBlocker = useCallback(
    async (selectedConv: (typeof active)[number]) => {
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
          toast({
            type: "conversation",
            description: (await res.text()) || "Failed to add dependency",
            variant: "error",
          });
        }
      } finally {
        setBusy(null);
      }
    },
    [conversation.taskId],
  );

  const removeBlocker = useCallback(
    async (depTaskId: string) => {
      setBusy(depTaskId);
      try {
        await fetch(
          `/api/tasks/${encodeURIComponent(conversation.taskId)}/dependencies/${encodeURIComponent(depTaskId)}`,
          { method: "DELETE" },
        );
      } finally {
        setBusy(null);
      }
    },
    [conversation.taskId],
  );

  const addBlocked = useCallback(
    async (selectedConv: (typeof active)[number]) => {
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
          toast({
            type: "conversation",
            description: (await res.text()) || "Failed to add dependency",
            variant: "error",
          });
        }
      } finally {
        setBusy(null);
      }
    },
    [conversation.taskId],
  );

  const removeBlocked = useCallback(
    async (blockedTaskId: string) => {
      setBusy(blockedTaskId);
      try {
        await fetch(
          `/api/tasks/${encodeURIComponent(blockedTaskId)}/dependencies/${encodeURIComponent(conversation.taskId)}`,
          { method: "DELETE" },
        );
      } finally {
        setBusy(null);
      }
    },
    [conversation.taskId],
  );

  if (!conversation.taskId || !task) return null;

  const hasBlockedBy = depTaskIds.size > 0;
  const hasBlocking = blockedTaskIds.size > 0;
  const hasAny = hasBlockedBy || hasBlocking;

  const peekContent = (
    <div className="space-y-1.5">
      {hasBlockedBy && (
        <div>
          <div className="text-[10px] tracking-wider text-muted-foreground">
            Blocked by
          </div>
          {blockerConvs.map((c) => (
            <div key={c.taskId} className="truncate text-xs">
              {c.title}
            </div>
          ))}
          {orphanDepIds.map((id) => {
            const t = allTasks.find((at) => at.id === id);
            return (
              <div key={id} className="truncate text-xs text-muted-foreground">
                {t?.title ?? id}
              </div>
            );
          })}
        </div>
      )}
      {hasBlocking && (
        <div>
          <div className="text-[10px] tracking-wider text-muted-foreground">
            Blocking
          </div>
          {blockedConvs.map((c) => (
            <div key={c.taskId} className="truncate text-xs">
              {c.title}
            </div>
          ))}
          {orphanBlockedIds.map((id) => {
            const t = allTasks.find((at) => at.id === id);
            return (
              <div key={id} className="truncate text-xs text-muted-foreground">
                {t?.title ?? id}
              </div>
            );
          })}
        </div>
      )}
      {!hasAny && (
        <div className="text-xs text-muted-foreground">Click to add dependencies</div>
      )}
    </div>
  );

  return (
    <WithTooltip content={peekContent} side="top">
      <div
        className={cn(
          buttonVariants({
            variant: "outline",
            size: "xs",
          }),
          "gap-0 overflow-hidden p-0 hover:bg-transparent dark:hover:bg-transparent",
        )}
      >
        <InlinePopover
          open={blockedByOpen}
          onOpenChange={setBlockedByOpen}
          align="end"
          contentClassName="w-96 p-2"
          trigger={
            <button
              type="button"
              className="flex h-full items-center gap-0.5 rounded-l px-1.5 transition-colors hover:bg-accent"
              aria-label="Blocked by"
            >
              {hasBlockedBy && (
                <span className="text-[10px] tabular-nums">
                  {depTaskIds.size}
                </span>
              )}
              <span className={cn("text-[10px]", hasBlockedBy ? "text-muted-foreground" : "text-muted-foreground/40")}>
                {"←"}
              </span>
            </button>
          }
        >
          <DepPopoverContent
            label="Blocked by"
            currentConvs={blockerConvs}
            orphanIds={orphanDepIds}
            allTasks={allTasks}
            candidates={blockedByCandidates}
            busy={busy}
            onAdd={(c) => void addBlocker(c)}
            onRemove={(id) => void removeBlocker(id)}
          />
        </InlinePopover>

        <div className="flex shrink-0 items-center border-x border-border/50 px-1">
          <MdLink className="size-3 text-muted-foreground" />
        </div>

        <InlinePopover
          open={blockingOpen}
          onOpenChange={setBlockingOpen}
          align="end"
          contentClassName="w-96 p-2"
          trigger={
            <button
              type="button"
              className="flex h-full items-center gap-0.5 rounded-r px-1.5 transition-colors hover:bg-accent"
              aria-label="Blocking"
            >
              <span className={cn("text-[10px]", hasBlocking ? "text-muted-foreground" : "text-muted-foreground/40")}>
                {"→"}
              </span>
              {hasBlocking && (
                <span className="text-[10px] tabular-nums">
                  {blockedTaskIds.size}
                </span>
              )}
            </button>
          }
        >
          <DepPopoverContent
            label="Blocking"
            currentConvs={blockedConvs}
            orphanIds={orphanBlockedIds}
            allTasks={allTasks}
            candidates={blockingCandidates}
            busy={busy}
            onAdd={(c) => void addBlocked(c)}
            onRemove={(id) => void removeBlocked(id)}
          />
        </InlinePopover>
      </div>
    </WithTooltip>
  );
}
