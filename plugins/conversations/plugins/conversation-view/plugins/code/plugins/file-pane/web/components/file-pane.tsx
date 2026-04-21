import { useMemo, useState, useCallback } from "react";
import { MdClose, MdContentCopy, MdCheck } from "react-icons/md";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ConversationRecord } from "@plugins/conversations/plugins/conversation-view/web";
import { ConversationCommands as Conversation } from "@plugins/conversations/plugins/conversation-view/web";
import type { EditedFileStatus } from "../../../../shared/protocol";
import { FilePane, resolveRenderers } from "../slots";

export function FilePaneView({
  conversation,
  path,
  status,
  embedded = false,
}: {
  conversation: ConversationRecord;
  path: string;
  status: EditedFileStatus;
  embedded?: boolean;
}) {
  const contributions = FilePane.Renderer.useContributions();
  const resolved = useMemo(
    () => resolveRenderers(contributions, { path, status }),
    [contributions, path, status],
  );

  const defaultId = resolved[0]?.contribution.id ?? null;
  const [activeId, setActiveId] = useState<string | null>(defaultId);
  const [copied, setCopied] = useState(false);
  const copyPath = useCallback(() => {
    void navigator.clipboard.writeText(path).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [path]);
  const active =
    resolved.find((r) => r.contribution.id === activeId) ?? resolved[0] ?? null;

  const slash = path.lastIndexOf("/");
  const dir = slash >= 0 ? path.slice(0, slash + 1) : "";
  const basename = slash >= 0 ? path.slice(slash + 1) : path;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b px-2 py-1.5">
        {!embedded && (
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            title="Close file"
            aria-label="Close file"
            onClick={() => Conversation.OpenRightPane(null)}
          >
            <MdClose className="size-4" />
          </Button>
        )}
        <div className="flex min-w-0 flex-1 items-baseline gap-1 text-sm">
          <span className="truncate text-muted-foreground">{dir}</span>
          <span className="truncate font-medium">{basename}</span>
          <Button
            variant="ghost"
            size="icon"
            className="size-5 shrink-0 text-muted-foreground hover:text-foreground"
            title="Copy path"
            aria-label="Copy path"
            onClick={copyPath}
          >
            {copied ? (
              <MdCheck className="size-3" />
            ) : (
              <MdContentCopy className="size-3" />
            )}
          </Button>
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
