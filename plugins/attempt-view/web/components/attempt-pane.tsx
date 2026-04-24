import { useMemo } from "react";
import { useResource } from "@core";
import { Outlet, usePaneMatch } from "@plugins/pane/web";
import { CONV_STATUS_DOT } from "@plugins/conversations/web";
import { attemptsResource } from "@plugins/tasks/shared";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { cn } from "@/lib/utils";
import { attemptPane, attemptConversationPane } from "../panes";

export function AttemptPane() {
  const { attemptId } = attemptPane.useParams();
  const { data } = useResource(attemptsResource);
  const match = usePaneMatch();

  const attempt = useMemo(
    () => data?.find((a) => a.id === attemptId) ?? null,
    [data, attemptId],
  );

  const selectedConvId = match?.chain.find(
    (e) => e.pane === attemptConversationPane._internal,
  )?.params.convId;
  const hasConvSelected = selectedConvId != null;

  const list = (
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
                      attemptConversationPane.open({
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

  return (
    <div className="h-[calc(100svh-3rem)] min-h-0 overflow-hidden">
      <ResizablePanelGroup orientation="horizontal" className="h-full">
        <ResizablePanel defaultSize={25} minSize={15}>
          {list}
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={75} minSize={25}>
          {hasConvSelected ? (
            <Outlet />
          ) : (
            <div className="text-muted-foreground flex h-full items-center justify-center p-6 text-sm">
              Select a conversation
            </div>
          )}
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
