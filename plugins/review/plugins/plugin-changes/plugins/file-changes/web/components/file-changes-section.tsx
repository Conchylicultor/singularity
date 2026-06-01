import { useState } from "react";
import { CollapsibleChevron } from "@plugins/primitives/plugins/collapsible/web";
import { CopyButton } from "@plugins/primitives/plugins/copy-to-clipboard/web";
import { useConversationById } from "@plugins/conversations/web";
import { DiffOrImageView } from "@plugins/conversations/plugins/conversation-view/plugins/code/plugins/file-pane/plugins/diff/web";
import type { PluginChangedFile, PluginChangeDiff, PluginReviewProps } from "@plugins/review/plugins/plugin-changes/core";

const STATUS_LABEL: Record<string, string> = {
  modified: "modified",
  added: "new",
  untracked: "new",
  deleted: "deleted",
  renamed: "moved",
  copied: "branched",
  clean: "clean",
};

const STATUS_BADGE: Record<string, string> = {
  modified: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
  added: "bg-success/15 text-success border-success/30",
  untracked: "bg-success/15 text-success border-success/30",
  deleted: "bg-destructive/15 text-destructive border-destructive/30",
  renamed: "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30",
  copied: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  clean: "bg-muted text-muted-foreground border-border",
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
  const badge = STATUS_BADGE[file.status] ?? STATUS_BADGE.modified;
  const label = STATUS_LABEL[file.status] ?? file.status;

  return (
    <div className="border-b border-border/40 last:border-b-0">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-muted/50"
        aria-expanded={expanded}
      >
        <CollapsibleChevron open={expanded} className="size-3.5 shrink-0 text-muted-foreground" />
        <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${badge}`}>
          {label}
        </span>
        <span className="group/path min-w-0 flex-1 truncate text-xs">
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
            className="ml-1 translate-y-px size-4 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/path:opacity-100"
            iconClassName="size-3"
            onClick={(e) => e.stopPropagation()}
          />
        </span>
        <span className="flex shrink-0 items-center gap-2 text-xs tabular-nums">
          <span className="text-success">+{file.additions}</span>
          <span className="text-destructive">&minus;{file.deletions}</span>
        </span>
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
    return <p className="text-xs text-muted-foreground px-1">Loading&hellip;</p>;
  }

  if (plugin.files.length === 0) return null;

  return (
    <div className="flex flex-col rounded border border-border/40 overflow-hidden">
      {plugin.files.map((file) => (
        <FileRow key={file.path} file={file} worktree={conversation.attemptId} />
      ))}
    </div>
  );
}

export function hasFiles(plugin: PluginChangeDiff): boolean {
  return plugin.files.length > 0;
}
