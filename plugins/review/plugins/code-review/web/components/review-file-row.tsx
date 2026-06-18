import { MdWarning } from "react-icons/md";
import { CollapsibleChevron } from "@plugins/primitives/plugins/collapsible/web";
import { CopyButton } from "@plugins/primitives/plugins/copy-to-clipboard/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import type { EditedFile, EditedFileStatus } from "@plugins/conversations/plugins/conversation-view/plugins/code/core";
import { gitStatusBadge } from "@plugins/conversations/plugins/conversation-view/plugins/code/web";
import { useConfig } from "@plugins/config_v2/web";
import { DiffOrImageView } from "@plugins/primitives/plugins/diff-view/web";
import { getFileWarningLevel } from "../core-files";
import { reviewConfig } from "../../shared/config";

/** Strip border-* utilities from a gitStatusBadge string (keep only bg/text). */
function statusBadgeColor(status: EditedFileStatus): string {
  return gitStatusBadge(status).split(" ").filter((c) => !c.startsWith("border-")).join(" ");
}

const STATUS_LABEL: Record<EditedFileStatus, string> = {
  modified: "modified",
  added: "new",
  untracked: "new",
  deleted: "deleted",
  renamed: "moved",
  copied: "branched",
  clean: "clean",
};

const LEVEL_BG = {
  safe: "bg-muted",
  careful: "bg-warning/10",
  critical: "bg-destructive/10",
};

const LEVEL_ICON_CLASS = {
  careful: "size-3.5 text-warning",
  critical: "size-3.5 text-destructive",
};

const LEVEL_TOOLTIP = {
  careful: "Careful — review this file with extra care",
  critical: "Critical — core infrastructure file, review with maximum care",
};

export function ReviewFileRow({
  worktree,
  file,
  expanded,
  onToggle,
  base,
  head,
}: {
  worktree: string;
  file: EditedFile;
  expanded: boolean;
  onToggle: () => void;
  base?: string;
  head?: string;
}) {
  const slash = file.path.lastIndexOf("/");
  const dir = slash >= 0 ? file.path.slice(0, slash + 1) : "";
  const basename = slash >= 0 ? file.path.slice(slash + 1) : file.path;
  const from = file.from && file.from !== file.path ? file.from : null;
  const config = useConfig(reviewConfig);
  const level = getFileWarningLevel(
    file.path,
    config.safePaths.map((p) => p.path),
    config.carefulPaths.map((p) => p.path),
  );
  return (
    <div className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className={`text-body sticky top-0 flex w-full items-center gap-sm px-md py-xs text-left hover:bg-muted/80 ${LEVEL_BG[level]}`}
        aria-expanded={expanded}
        title={level !== "safe" ? LEVEL_TOOLTIP[level] : undefined}
      >
        <CollapsibleChevron open={expanded} className="size-4 shrink-0 text-muted-foreground" />
        <Badge size="sm" colorClass={statusBadgeColor(file.status)} className="shrink-0">
          {STATUS_LABEL[file.status]}
        </Badge>
        <span className="group/path min-w-0 flex-1 truncate">
          {from && (
            <>
              <span className="text-muted-foreground line-through">{from}</span>
              {/* eslint-disable-next-line spacing/no-adhoc-spacing -- inline arrow separator offset between from/to paths */}
              <span className="mx-1.5 text-muted-foreground">→</span>
            </>
          )}
          <span className="text-muted-foreground">{dir}</span>
          <span className="font-medium">{basename}</span>
          <CopyButton
            text={file.path}
            title="Copy path"
            size="inline"
            // eslint-disable-next-line spacing/no-adhoc-spacing -- inline gap after path text before copy button
            className="ml-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/path:opacity-100"
            onClick={(e) => e.stopPropagation()}
          />
        </span>
        <Text as="span" variant="caption" className="flex shrink-0 items-center gap-sm tabular-nums">
          <span className="text-success">+{file.additions}</span>
          <span className="text-destructive">−{file.deletions}</span>
          {level !== "safe" && (
            <MdWarning
              className={LEVEL_ICON_CLASS[level]}
              aria-label={LEVEL_TOOLTIP[level]}
            />
          )}
        </Text>
      </button>
      {expanded && (
        <div className="bg-background">
          <DiffOrImageView
            worktree={worktree}
            path={file.path}
            base={base ?? "main"}
            head={head}
            from={file.from}
          />
        </div>
      )}
    </div>
  );
}
