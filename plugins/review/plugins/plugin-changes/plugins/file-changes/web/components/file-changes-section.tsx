import { useState } from "react";
import { CollapsibleChevron } from "@plugins/primitives/plugins/collapsible/web";
import { CopyButton } from "@plugins/primitives/plugins/copy-to-clipboard/web";
import { Badge } from "@plugins/primitives/plugins/badge/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { useConversationById } from "@plugins/conversations/web";
import { DiffOrImageView } from "@plugins/conversations/plugins/conversation-view/plugins/code/plugins/file-pane/plugins/diff/web";
import { gitStatusBadge } from "@plugins/conversations/plugins/conversation-view/plugins/code/web";
import type { PluginChangedFile, PluginChangeDiff, PluginReviewProps } from "@plugins/review/plugins/plugin-changes/core";

/** Strip border-* utilities from a gitStatusBadge string (keep only bg/text). */
function statusBadgeColor(status: string): string {
  return gitStatusBadge(status).split(" ").filter((c) => !c.startsWith("border-")).join(" ");
}

const STATUS_LABEL: Record<string, string> = {
  modified: "modified",
  added: "new",
  untracked: "new",
  deleted: "deleted",
  renamed: "moved",
  copied: "branched",
  clean: "clean",
};

function FileRow({
  file,
  worktree,
}: {
  file: PluginChangedFile;
  worktree: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const slash = file.path.lastIndexOf("/");
  const dir = slash >= 0 ? file.path.slice(0, slash + 1) : "";
  const basename = slash >= 0 ? file.path.slice(slash + 1) : file.path;
  const from = file.from && file.from !== file.path ? file.from : null;
  const label = STATUS_LABEL[file.status] ?? file.status;

  return (
    <div className="border-b border-border/40 last:border-b-0">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="text-body flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-muted/50"
        aria-expanded={expanded}
      >
        <CollapsibleChevron open={expanded} className="size-3.5 shrink-0 text-muted-foreground" />
        <Badge size="sm" colorClass={statusBadgeColor(file.status)} className="shrink-0">
          {label}
        </Badge>
        <Text as="span" variant="caption" className="group/path min-w-0 flex-1 truncate">
          {from && (
            <>
              <span className="text-muted-foreground line-through">{from}</span>
              <span className="mx-1.5 text-muted-foreground">&rarr;</span>
            </>
          )}
          <span className="text-muted-foreground">{dir}</span>
          <span className="font-medium">{basename}</span>
          <CopyButton
            text={file.path}
            title="Copy path"
            size="inline"
            className="ml-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/path:opacity-100"
            onClick={(e) => e.stopPropagation()}
          />
        </Text>
        <Text as="span" variant="caption" className="flex shrink-0 items-center gap-2 tabular-nums">
          <span className="text-success">+{file.additions}</span>
          <span className="text-destructive">&minus;{file.deletions}</span>
        </Text>
      </button>
      {expanded && (
        <div className="bg-background">
          <DiffOrImageView
            worktree={worktree}
            path={file.path}
            base="main"
            from={file.from}
          />
        </div>
      )}
    </div>
  );
}

export function FileChangesSection({ conversationId, plugin }: PluginReviewProps) {
  const conversation = useConversationById(conversationId);

  if (!conversation) {
    return <Text as="p" variant="caption" className="text-muted-foreground px-1">Loading&hellip;</Text>;
  }

  if (plugin.files.length === 0) return null;

  return (
    <div className="flex flex-col rounded-md border border-border/40 overflow-hidden">
      {plugin.files.map((file) => (
        <FileRow key={file.path} file={file} worktree={conversation.attemptId} />
      ))}
    </div>
  );
}

export function hasFiles(plugin: PluginChangeDiff): boolean {
  return plugin.files.length > 0;
}
