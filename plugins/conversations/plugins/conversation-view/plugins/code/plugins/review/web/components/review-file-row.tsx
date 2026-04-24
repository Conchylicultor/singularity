import { useState, useCallback } from "react";
import { MdChevronRight, MdWarning, MdContentCopy, MdCheck } from "react-icons/md";
import type { EditedFile, EditedFileStatus } from "@plugins/conversations/plugins/conversation-view/plugins/code/shared";
import { useConfigValues } from "@plugins/config/web";
import { DiffView } from "../../../file-pane/plugins/diff/web/components/diff-view";
import { getFileWarningLevel } from "../core-files";
import { reviewConfig } from "../../shared/config";

const STATUS_LABEL: Record<EditedFileStatus, string> = {
  modified: "modified",
  added: "new",
  untracked: "new",
  deleted: "deleted",
  clean: "clean",
};

const STATUS_BADGE: Record<EditedFileStatus, string> = {
  modified: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
  added: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  untracked: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  deleted: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30",
  clean: "bg-muted text-muted-foreground border-border",
};

const LEVEL_BG = {
  safe: "bg-muted",
  careful: "bg-amber-500/10 dark:bg-amber-500/10",
  critical: "bg-red-500/10 dark:bg-red-500/10",
};

const LEVEL_ICON_CLASS = {
  careful: "size-3.5 text-amber-500 dark:text-amber-400",
  critical: "size-3.5 text-red-500 dark:text-red-400",
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
}: {
  worktree: string;
  file: EditedFile;
  expanded: boolean;
  onToggle: () => void;
}) {
  const slash = file.path.lastIndexOf("/");
  const dir = slash >= 0 ? file.path.slice(0, slash + 1) : "";
  const basename = slash >= 0 ? file.path.slice(slash + 1) : file.path;
  const { safePaths, carefulPaths } = useConfigValues(reviewConfig, "conversation-code-review");
  const level = getFileWarningLevel(file.path, safePaths, carefulPaths);
  const [copied, setCopied] = useState(false);
  const copyPath = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    void navigator.clipboard.writeText(file.path).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [file.path]);

  return (
    <div className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className={`sticky top-0 z-[1] flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted/80 ${LEVEL_BG[level]}`}
        aria-expanded={expanded}
        title={level !== "safe" ? LEVEL_TOOLTIP[level] : undefined}
      >
        <MdChevronRight
          className={`size-4 shrink-0 text-muted-foreground transition-transform ${
            expanded ? "rotate-90" : ""
          }`}
        />
        <span
          className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${STATUS_BADGE[file.status]}`}
        >
          {STATUS_LABEL[file.status]}
        </span>
        <span className="group/path min-w-0 flex-1 truncate">
          <span className="text-muted-foreground">{dir}</span>
          <span className="font-medium">{basename}</span>
          <button
            type="button"
            onClick={copyPath}
            title="Copy path"
            aria-label="Copy path"
            className="ml-1 inline-flex translate-y-px items-center rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/path:opacity-100"
          >
            {copied ? <MdCheck className="size-3" /> : <MdContentCopy className="size-3" />}
          </button>
        </span>
        <span className="flex shrink-0 items-center gap-2 text-xs tabular-nums">
          <span className="text-emerald-600 dark:text-emerald-400">+{file.additions}</span>
          <span className="text-red-600 dark:text-red-400">−{file.deletions}</span>
          {level !== "safe" && (
            <MdWarning
              className={LEVEL_ICON_CLASS[level]}
              aria-label={LEVEL_TOOLTIP[level]}
            />
          )}
        </span>
      </button>
      {expanded && (
        <div className="bg-background">
          <DiffView worktree={worktree} path={file.path} base="main" />
        </div>
      )}
    </div>
  );
}
