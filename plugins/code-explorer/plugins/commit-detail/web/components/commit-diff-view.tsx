import { useState } from "react";
import { CollapsibleChevron } from "@plugins/primitives/plugins/collapsible/web";
import { DiffOrImageView } from "@plugins/primitives/plugins/diff-view/web";
import type { EditedFile } from "@plugins/conversations/plugins/conversation-view/plugins/code/core";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Column } from "@plugins/primitives/plugins/css/plugins/column/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Sticky } from "@plugins/primitives/plugins/css/plugins/sticky/web";
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
    return <Loading />;
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
    <Column
      fill
      className="h-full"
      header={
        <Stack
          direction="row"
          gap="md"
          align="center"
          className="border-b border-border bg-background/95 px-lg py-sm backdrop-blur"
        >
          <Text as="span" variant="label" className="tabular-nums">
            {files.length} {files.length === 1 ? "file" : "files"}
          </Text>
          <Text as="span" variant="caption" className="tabular-nums text-success">
            +{totals.additions}
          </Text>
          <Text as="span" variant="caption" className="tabular-nums text-destructive">
            −{totals.deletions}
          </Text>
        </Stack>
      }
      body={files.map((file) => (
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
    />
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
      <Sticky>
        <button
          type="button"
          onClick={onToggle}
          className="text-body w-full bg-muted px-md py-xs text-left hover:bg-muted/80"
          aria-expanded={expanded}
        >
          <div className="flex w-full items-center gap-sm">
            <CollapsibleChevron open={expanded} className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">
              {from && (
                <>
                  <span className="text-muted-foreground line-through">{from}</span>
                  {/* eslint-disable-next-line spacing/no-adhoc-spacing -- inline horizontal offset around the rename arrow between two file paths */}
                  <span className="mx-1.5 text-muted-foreground">→</span>
                </>
              )}
              <span className="text-muted-foreground">{dir}</span>
              <span className="font-medium">{basename}</span>
            </span>
            <Text as="span" variant="caption" className="flex shrink-0 items-center gap-sm tabular-nums">
              <span className="text-success">+{file.additions}</span>
              <span className="text-destructive">−{file.deletions}</span>
            </Text>
          </div>
        </button>
      </Sticky>
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
