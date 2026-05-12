import { useMemo } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { usePaneMatch, useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { CONV_STATUS_DOT } from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import { attemptsResource } from "@plugins/tasks/core";
import { cn } from "@/lib/utils";
import { attemptPane, attemptConversationPane } from "../panes";

export function AttemptPane() {
  const { attemptId } = attemptPane.useParams();
  const { data } = useResource(attemptsResource);
  const match = usePaneMatch();
  const openPane = useOpenPane();

  const attempt = useMemo(
    () => data.find((a) => a.id === attemptId) ?? null,
    [data, attemptId],
  );

  const selectedConvId = match?.chain.find(
    (e) => e.pane === attemptConversationPane._internal,
  )?.params.convId;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b px-3 py-2">
        <div className="text-sm font-medium">Attempt</div>
        {attempt ? (
          <div className="text-muted-foreground truncate font-mono text-xs">
            {attempt.worktreePath.split("/").pop()}
          </div>
        ) : (
          <div className="text-muted-foreground text-xs">Loading…</div>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {attempt && attempt.conversations.length === 0 ? (
          <p className="text-muted-foreground px-2 py-1 text-sm">
            No conversations.
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {attempt?.conversations.map((c) => {
              const isActive = c.id === selectedConvId;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() =>
                      openPane(attemptConversationPane, {
                        attemptId,
                        convId: c.id,
                      })
                    }
                    className={cn(
                      "hover:bg-accent flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm",
                      isActive && "bg-accent",
                    )}
                  >
                    <span
                      className={cn(
                        "size-1.5 shrink-0 rounded-full",
                        CONV_STATUS_DOT[c.status],
                      )}
                    />
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
    </div>
  );
}
