import { Button, ButtonGroup, cn } from "@plugins/primitives/plugins/ui-kit/web";
import { useState, useMemo, useCallback } from "react";
import { MdLink } from "react-icons/md";
import type { ConversationRecord } from "@plugins/conversations/plugins/conversation-view/web";
import { useActiveConversations } from "@plugins/conversations/web";
import { useTask } from "@plugins/tasks/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { tasksResource, addTaskDependency, removeTaskDependency, type TaskListItem } from "@plugins/tasks/core";
import { fetchEndpoint, EndpointError } from "@plugins/infra/plugins/endpoints/web";
import { toast } from "@plugins/shell/plugins/notifications/web";
import { InlinePopover } from "@plugins/primitives/plugins/popover/web";
import { WithTooltip } from "@plugins/primitives/plugins/tooltip/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { DepPopoverContent } from "./dep-popover-content";

export function DependenciesButton({
  conversation,
}: {
  conversation: ConversationRecord;
}) {
  const tasksResult = useResource(tasksResource);
  if (tasksResult.pending) return null;
  return <DependenciesButtonInner conversation={conversation} allTasks={tasksResult.data} />;
}

function DependenciesButtonInner({
  conversation,
  allTasks,
}: {
  conversation: ConversationRecord;
  allTasks: TaskListItem[];
}) {
  const [blockedByOpen, setBlockedByOpen] = useState(false);
  const [blockingOpen, setBlockingOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const task = useTask(conversation.taskId);
  const active = useActiveConversations();

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
        await fetchEndpoint(addTaskDependency, { id: conversation.taskId }, { body: { dependsOnTaskId: depTaskId } });
      } catch (err) {
        toast({
          type: "conversation",
          title: "Failed to add dependency",
          description: err instanceof EndpointError ? (typeof err.body === "string" ? err.body : `Server responded ${err.status}`) : String(err),
          variant: "error",
        });
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
        await fetchEndpoint(removeTaskDependency, { id: conversation.taskId, depId: depTaskId });
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
        await fetchEndpoint(addTaskDependency, { id: blockedTaskId }, { body: { dependsOnTaskId: conversation.taskId } });
      } catch (err) {
        toast({
          type: "conversation",
          title: "Failed to add dependency",
          description: err instanceof EndpointError ? (typeof err.body === "string" ? err.body : `Server responded ${err.status}`) : String(err),
          variant: "error",
        });
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
        await fetchEndpoint(removeTaskDependency, { id: blockedTaskId, depId: conversation.taskId });
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
          <div className="text-3xs tracking-wider text-muted-foreground">
            Blocked by
          </div>
          {blockerConvs.map((c) => (
            <Text as="div" variant="caption" key={c.taskId}>
              {c.title}
            </Text>
          ))}
          {orphanDepIds.map((id) => {
            const t = allTasks.find((at) => at.id === id);
            return (
              <Text as="div" variant="caption" key={id} className="text-muted-foreground">
                {t?.title ?? id}
              </Text>
            );
          })}
        </div>
      )}
      {hasBlocking && (
        <div>
          <div className="text-3xs tracking-wider text-muted-foreground">
            Blocking
          </div>
          {blockedConvs.map((c) => (
            <Text as="div" variant="caption" key={c.taskId}>
              {c.title}
            </Text>
          ))}
          {orphanBlockedIds.map((id) => {
            const t = allTasks.find((at) => at.id === id);
            return (
              <Text as="div" variant="caption" key={id} className="text-muted-foreground">
                {t?.title ?? id}
              </Text>
            );
          })}
        </div>
      )}
      {!hasAny && (
        <Text as="div" variant="caption" className="text-muted-foreground">Click to add dependencies</Text>
      )}
    </div>
  );

  return (
    <WithTooltip content={peekContent} side="top" className="max-w-md">
      <ButtonGroup>
        <InlinePopover
          open={blockedByOpen}
          onOpenChange={setBlockedByOpen}
          align="end"
          contentClassName="w-96 p-2"
          trigger={
            <Button variant="ghost" size="xs" aria-label="Blocked by">
              {hasBlockedBy && (
                <span className="text-3xs tabular-nums">
                  {depTaskIds.size}
                </span>
              )}
              <span className={cn("text-3xs", hasBlockedBy ? "text-muted-foreground" : "text-muted-foreground/40")}>
                {"←"}
              </span>
            </Button>
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

        <div className="flex shrink-0 items-center px-1">
          <MdLink className="size-3 text-muted-foreground" />
        </div>

        <InlinePopover
          open={blockingOpen}
          onOpenChange={setBlockingOpen}
          align="end"
          contentClassName="w-96 p-2"
          trigger={
            <Button variant="ghost" size="xs" aria-label="Blocking">
              <span className={cn("text-3xs", hasBlocking ? "text-muted-foreground" : "text-muted-foreground/40")}>
                {"→"}
              </span>
              {hasBlocking && (
                <span className="text-3xs tabular-nums">
                  {blockedTaskIds.size}
                </span>
              )}
            </Button>
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
      </ButtonGroup>
    </WithTooltip>
  );
}
