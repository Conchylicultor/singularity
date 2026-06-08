import { MdVerticalSplit } from "react-icons/md";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import {
  PaneChrome,
  PaneInstanceContext,
  useOpenPane,
} from "@plugins/primitives/plugins/pane/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { CONV_STATUS_DOT } from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import { StatusDot } from "@plugins/primitives/plugins/status-dot/web";
import { Badge } from "@plugins/primitives/plugins/badge/web";
import { LaunchControl } from "@plugins/primitives/plugins/launch/web";
import type { AttemptWithConversations } from "@plugins/tasks/core";
import { attemptsResource } from "@plugins/tasks/core";
import { Placeholder } from "@plugins/primitives/plugins/placeholder/web";
import { cn } from "@/lib/utils";
import { attemptPane } from "../panes";

function SideBySideButton({ convId }: { convId: string }) {
  const openPane = useOpenPane();
  return (
    <button
      type="button"
      title="Open alongside"
      onClick={(e) => {
        e.stopPropagation();
        openPane(conversationPane, { convId }, { mode: "push" });
      }}
      className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
    >
      <MdVerticalSplit size={14} />
    </button>
  );
}

function AttemptSection({
  attempt,
  isCurrent,
  selectedConvId,
  convInstanceId,
  onSelect,
}: {
  attempt: AttemptWithConversations;
  isCurrent: boolean;
  selectedConvId: string | undefined;
  convInstanceId: number | undefined;
  onSelect: (convId: string) => void;
}) {
  const worktreeName = attempt.worktreePath.split("/").pop();
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1.5 px-2 py-1">
        <span
          className={cn(
            "min-w-0 flex-1 truncate font-mono text-[11px]",
            isCurrent ? "font-medium text-foreground" : "text-muted-foreground",
          )}
        >
          {worktreeName}
        </span>
        <Badge size="sm" className="shrink-0">
          {attempt.conversations.length}
        </Badge>
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
              <li
                key={c.id}
                className={cn(
                  "group flex items-center rounded",
                  isActive ? "bg-accent" : "hover:bg-accent",
                )}
              >
                <button
                  type="button"
                  onClick={() => onSelect(c.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-sm"
                >
                  <StatusDot colorClass={CONV_STATUS_DOT[c.status]} />
                  <span className="min-w-0 flex-1 truncate">
                    {c.title ?? "Starting…"}
                  </span>
                </button>
                {convInstanceId !== undefined && !isActive && (
                  <div className="flex shrink-0 items-center pr-1 opacity-0 group-hover:opacity-100">
                    <PaneInstanceContext.Provider value={convInstanceId}>
                      <SideBySideButton convId={c.id} />
                    </PaneInstanceContext.Provider>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <LaunchControl
        size="sm"
        variant="outline"
        className="px-2 pt-1"
        getRequest={() => ({ attemptId: attempt.id })}
      />
    </div>
  );
}

export function AttemptPane() {
  const { attemptId } = attemptPane.useParams();
  const result = useResource(attemptsResource);
  const openPane = useOpenPane();
  const selectedConvId = conversationPane.useRouteEntry()?.params.convId;
  const convEntries = conversationPane.useRouteEntries();
  const convInstanceId = convEntries[convEntries.length - 1]?.instanceId;

  if (result.pending) return <Placeholder>Loading…</Placeholder>;

  const attempt = result.data.find((a) => a.id === attemptId) ?? null;

  const taskAttempts = attempt
    ? result.data.filter((a) => a.taskId === attempt.taskId)
    : [];

  const handleSelect = (convId: string) =>
    openPane(conversationPane, { convId }, { mode: "push" });

  const totalConversations = taskAttempts.reduce(
    (sum, a) => sum + a.conversations.length,
    0,
  );

  const title = (
    <span className="flex items-center gap-1.5">
      Attempts
      {totalConversations > 0 && (
        <Badge size="sm" className="shrink-0">
          {totalConversations}
        </Badge>
      )}
    </span>
  );

  return (
    <PaneChrome pane={attemptPane} title={title}>
      <div className="p-2">
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
                convInstanceId={convInstanceId}
                onSelect={handleSelect}
              />
            ))}
          </div>
        )}
      </div>
    </PaneChrome>
  );
}
