import { useMemo, useState } from "react";
import { MdClose } from "react-icons/md";
import type { ConversationState } from "@plugins/conversations/plugins/conversation-view/web/slots";
import { Conversation } from "@plugins/conversations/plugins/conversation-view/web/commands";
import { Button } from "@/components/ui/button";
import { useEditedFiles } from "../../../../web/use-edited-files";
import { ReviewFileRow } from "./review-file-row";

export function ReviewView({ conversation }: { conversation: ConversationState }) {
  const { files } = useEditedFiles(conversation.id);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const sorted = useMemo(() => {
    if (!files) return null;
    return [...files].sort((a, b) => a.path.localeCompare(b.path));
  }, [files]);

  const totals = useMemo(() => {
    if (!sorted) return { count: 0, additions: 0, deletions: 0 };
    return sorted.reduce(
      (acc, f) => ({
        count: acc.count + 1,
        additions: acc.additions + f.additions,
        deletions: acc.deletions + f.deletions,
      }),
      { count: 0, additions: 0, deletions: 0 },
    );
  }, [sorted]);

  const allExpanded = sorted != null && sorted.length > 0 && expanded.size === sorted.length;

  function toggleAll() {
    if (!sorted) return;
    if (allExpanded) {
      setExpanded(new Set());
    } else {
      setExpanded(new Set(sorted.map((f) => f.path)));
    }
  }

  function toggleOne(path: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-muted/20">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-2 backdrop-blur">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span>Review</span>
          <span className="text-muted-foreground">·</span>
          <span className="tabular-nums">{totals.count} files</span>
          <span className="text-emerald-600 tabular-nums dark:text-emerald-400">
            +{totals.additions}
          </span>
          <span className="text-red-600 tabular-nums dark:text-red-400">
            −{totals.deletions}
          </span>
        </div>
        <div className="flex flex-1 items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleAll}
            disabled={!sorted || sorted.length === 0}
          >
            {allExpanded ? "Collapse all" : "Expand all"}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="Close review"
            aria-label="Close review"
            onClick={() => Conversation.OpenMainView(null)}
          >
            <MdClose className="size-4" />
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {sorted == null ? (
          <div className="px-4 py-3 text-sm text-muted-foreground">Loading…</div>
        ) : sorted.length === 0 ? (
          <div className="px-4 py-3 text-sm text-muted-foreground">No edited files.</div>
        ) : (
          <div className="flex flex-col">
            {sorted.map((file) => (
              <ReviewFileRow
                key={file.path}
                conversationId={conversation.id}
                file={file}
                expanded={expanded.has(file.path)}
                onToggle={() => toggleOne(file.path)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
