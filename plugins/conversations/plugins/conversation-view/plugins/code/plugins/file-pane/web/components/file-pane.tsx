import { useMemo, useState } from "react";
import { MdArrowBack } from "react-icons/md";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ConversationState } from "@plugins/conversations/plugins/conversation-view/web/slots";
import { Conversation } from "@plugins/conversations/plugins/conversation-view/web/commands";
import type { EditedFileStatus } from "../../../../shared/protocol";
import { editedFileListPane } from "../../../file-list/web/views";
import { FilePane, resolveRenderers } from "../slots";

export function FilePaneView({
  conversation,
  path,
  status,
}: {
  conversation: ConversationState;
  path: string;
  status: EditedFileStatus;
}) {
  const contributions = FilePane.Renderer.useContributions();
  const resolved = useMemo(
    () => resolveRenderers(contributions, { path, status }),
    [contributions, path, status],
  );

  const defaultId = resolved[0]?.contribution.id ?? null;
  const [activeId, setActiveId] = useState<string | null>(defaultId);
  const active =
    resolved.find((r) => r.contribution.id === activeId) ?? resolved[0] ?? null;

  const slash = path.lastIndexOf("/");
  const dir = slash >= 0 ? path.slice(0, slash + 1) : "";
  const basename = slash >= 0 ? path.slice(slash + 1) : path;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b px-2 py-1.5">
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          title="Back to file list"
          aria-label="Back to file list"
          onClick={() => Conversation.OpenMiddlePane(editedFileListPane())}
        >
          <MdArrowBack className="size-4" />
        </Button>
        <div className="flex min-w-0 flex-1 items-baseline text-sm">
          <span className="truncate text-muted-foreground">{dir}</span>
          <span className="truncate font-medium">{basename}</span>
        </div>
        <div role="tablist" className="flex items-center gap-1">
          {resolved.map(({ contribution: c }) => {
            const isActive = active?.contribution.id === c.id;
            return (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveId(c.id)}
                className={cn(
                  "rounded px-2 py-0.5 text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                  isActive
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {active ? (
          <active.contribution.component
            conversationId={conversation.id}
            path={path}
          />
        ) : (
          <div className="px-3 py-2 text-sm text-muted-foreground">
            No renderer available for this file.
          </div>
        )}
      </div>
    </div>
  );
}
