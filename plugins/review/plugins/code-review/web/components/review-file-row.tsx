import { MdWarning } from "react-icons/md";
import { CollapsibleChevron } from "@plugins/primitives/plugins/collapsible/web";
import { CopyButton } from "@plugins/primitives/plugins/copy-to-clipboard/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Frame } from "@plugins/primitives/plugins/css/plugins/frame/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Sticky } from "@plugins/primitives/plugins/css/plugins/sticky/web";
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
      <Sticky edge="top">
        <button
          type="button"
          onClick={onToggle}
          className={`text-body w-full px-md py-xs text-left hover:bg-muted/80 ${LEVEL_BG[level]}`}
          aria-expanded={expanded}
          title={level !== "safe" ? LEVEL_TOOLTIP[level] : undefined}
        >
          <Frame
            leading={
              <>
                <CollapsibleChevron open={expanded} className="size-4 text-muted-foreground" />
                <Badge size="sm" colorClass={statusBadgeColor(file.status)}>
                  {STATUS_LABEL[file.status]}
                </Badge>
              </>
            }
            content={
              <span className="group/path block truncate">
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
                  className="ml-1 text-muted-foreground opacity-0 pointer-events-none transition-opacity hover:text-foreground group-hover/path:opacity-100 group-hover/path:pointer-events-auto"
                  onClick={(e) => e.stopPropagation()}
                />
              </span>
            }
            trailing={
              <Stack as="span" direction="row" gap="sm" align="center">
                <Text as="span" variant="caption" className="text-success tabular-nums">+{file.additions}</Text>
                <Text as="span" variant="caption" className="text-destructive tabular-nums">−{file.deletions}</Text>
                {level !== "safe" && (
                  <MdWarning
                    className={LEVEL_ICON_CLASS[level]}
                    aria-label={LEVEL_TOOLTIP[level]}
                  />
                )}
              </Stack>
            }
          />
        </button>
      </Sticky>
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
