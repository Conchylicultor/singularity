import { useState } from "react";
import { MdChevronRight } from "react-icons/md";
import { DiffOrImageView } from "@plugins/conversations/plugins/conversation-view/plugins/code/plugins/file-pane/plugins/diff/web";
import type { EditedFile } from "@plugins/conversations/plugins/conversation-view/plugins/code/core";
import { Placeholder } from "@plugins/primitives/plugins/placeholder/web";
import { useCommitFiles } from "../use-commit-files";

export function CommitDiffView({
  worktree,
  sha,
}: {
  worktree: string;
  sha: string;
}) {
  const state = useCommitFiles(worktree, sha);

  if (state.kind === "loading") {
    return <Placeholder>Loading…</Placeholder>;
  }
  if (state.kind === "error") {
    return <Placeholder tone="error">{state.message}</Placeholder>;
  }

  const { files, baseSha, headSha } = state.data;
  return (
    <CommitFileList
      files={files}
      worktree={worktree}
      baseSha={baseSha}
      headSha={headSha}
    />
  );
}

function CommitFileList({
  files,
  worktree,
  baseSha,
  headSha,
}: {
  files: EditedFile[];
  worktree: string;
  baseSha: string;
  headSha: string;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(path: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  if (files.length === 0) {
    return <Placeholder>No changes in this commit.</Placeholder>;
  }

  const totals = files.reduce(
    (acc, f) => ({
      additions: acc.additions + f.additions,
      deletions: acc.deletions + f.deletions,
    }),
    { additions: 0, deletions: 0 },
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-3 border-b border-border bg-background/95 px-4 py-2 backdrop-blur">
        <span className="text-sm font-medium tabular-nums">
          {files.length} {files.length === 1 ? "file" : "files"}
        </span>
        <span className="text-xs tabular-nums text-emerald-600 dark:text-emerald-400">
          +{totals.additions}
        </span>
        <span className="text-xs tabular-nums text-red-600 dark:text-red-400">
          −{totals.deletions}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {files.map((file) => (
          <CommitFileRow
            key={file.path}
            file={file}
            worktree={worktree}
            baseSha={baseSha}
            headSha={headSha}
            expanded={expanded.has(file.path)}
            onToggle={() => toggle(file.path)}
          />
        ))}
      </div>
    </div>
  );
}

function CommitFileRow({
  file,
  worktree,
  baseSha,
  headSha,
  expanded,
  onToggle,
}: {
  file: EditedFile;
  worktree: string;
  baseSha: string;
  headSha: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const slash = file.path.lastIndexOf("/");
  const dir = slash >= 0 ? file.path.slice(0, slash + 1) : "";
  const basename = slash >= 0 ? file.path.slice(slash + 1) : file.path;
  const from = file.from && file.from !== file.path ? file.from : null;

  return (
    <div className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className="sticky top-0 z-[1] flex w-full items-center gap-2 bg-muted px-3 py-1.5 text-left text-sm hover:bg-muted/80"
        aria-expanded={expanded}
      >
        <MdChevronRight
          className={`size-4 shrink-0 text-muted-foreground transition-transform ${
            expanded ? "rotate-90" : ""
          }`}
        />
        <span className="min-w-0 flex-1 truncate">
          {from && (
            <>
              <span className="text-muted-foreground line-through">{from}</span>
              <span className="mx-1.5 text-muted-foreground">→</span>
            </>
          )}
          <span className="text-muted-foreground">{dir}</span>
          <span className="font-medium">{basename}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2 text-xs tabular-nums">
          <span className="text-emerald-600 dark:text-emerald-400">
            +{file.additions}
          </span>
          <span className="text-red-600 dark:text-red-400">
            −{file.deletions}
          </span>
        </span>
      </button>
      {expanded && (
        <div className="bg-background">
          <DiffOrImageView
            worktree={worktree}
            path={file.path}
            base={baseSha}
            head={headSha}
            from={file.from}
          />
        </div>
      )}
    </div>
  );
}
