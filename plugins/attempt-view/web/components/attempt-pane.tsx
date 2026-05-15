import { useMemo } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { CONV_STATUS_DOT } from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import { StatusDot } from "@plugins/primitives/plugins/status-dot/web";
import type { AttemptWithConversations } from "@plugins/tasks/core";
import { attemptsResource } from "@plugins/tasks/core";
import { cn } from "@/lib/utils";
import { attemptPane } from "../panes";

function AttemptSection({
  attempt,
  isCurrent,
  selectedConvId,
  onSelect,
}: {
  attempt: AttemptWithConversations;
  isCurrent: boolean;
  selectedConvId: string | undefined;
  onSelect: (convId: string) => void;
}) {
  const worktreeName = attempt.worktreePath.split("/").pop();
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1.5 px-2 py-1">
        <span
          className={cn(
            "truncate font-mono text-[11px]",
            isCurrent ? "font-medium text-foreground" : "text-muted-foreground",
          )}
        >
          {worktreeName}
        </span>
        <span className="shrink-0 rounded-full bg-muted px-1.5 text-[10px] tabular-nums text-muted-foreground">
          {attempt.conversations.length}
        </span>
      </div>
      {attempt.conversations.length === 0 ? (
        <p className="text-muted-foreground px-2 py-0.5 text-xs italic">
          No conversations
        </p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {attempt.conversations.map((c) => {
            const isActive = c.id === selectedConvId;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onSelect(c.id)}
                  className={cn(
                    "hover:bg-accent flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm",
                    isActive && "bg-accent",
                  )}
                >
                  <StatusDot colorClass={CONV_STATUS_DOT[c.status]} />
                  <span className="flex-1 truncate">
                    {c.title ?? "Starting…"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function AttemptPane() {
  const { attemptId } = attemptPane.useParams();
  const { data } = useResource(attemptsResource);
  const openPane = useOpenPane();

  const attempt = useMemo(
    () => data.find((a) => a.id === attemptId) ?? null,
    [data, attemptId],
  );

  const taskAttempts = useMemo(() => {
    if (!attempt) return [];
    return data.filter((a) => a.taskId === attempt.taskId);
  }, [data, attempt]);

  const selectedConvId = conversationPane.useChainEntry()?.params.convId;

  const handleSelect = (convId: string) =>
    openPane(conversationPane, { convId }, { mode: "push" });

  const totalConversations = taskAttempts.reduce(
    (sum, a) => sum + a.conversations.length,
    0,
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium">Attempts</span>
          {totalConversations > 0 && (
            <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
              {totalConversations}
            </span>
          )}
        </div>
        {attempt ? (
          <div className="text-muted-foreground truncate font-mono text-xs">
            {attempt.worktreePath.split("/").pop()}
          </div>
        ) : (
          <div className="text-muted-foreground text-xs">Loading…</div>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {taskAttempts.length === 0 ? (
          <p className="text-muted-foreground px-2 py-1 text-sm">
            No attempts.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {taskAttempts.map((a) => (
              <AttemptSection
                key={a.id}
                attempt={a}
                isCurrent={a.id === attemptId}
                selectedConvId={selectedConvId}
                onSelect={handleSelect}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
