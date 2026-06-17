import { useMemo } from "react";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { ResourceView } from "@plugins/primitives/plugins/live-state/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Collapsible, CollapsibleTrigger, CollapsibleContent, CollapsibleChevron, useExpandAll, ExpandAllButton } from "@plugins/primitives/plugins/collapsible/web";
import { useConfig } from "@plugins/config_v2/web";
import type { Source } from "@plugins/review/web";
import type { EditedFile } from "@plugins/conversations/plugins/conversation-view/plugins/code/core";
import { useEditedFiles } from "@plugins/conversations/plugins/conversation-view/plugins/code/web";
import { useConversationById } from "@plugins/conversations/web";
import { reviewConfig } from "../../shared/config";
import { groupBySection, type FileSection } from "../core-files";
import { usePushFiles } from "../use-push-files";
import { ReviewFileRow } from "./review-file-row";

export function CodeReviewSection({
  conversationId,
  source,
}: {
  conversationId: string;
  source: Source;
}) {
  const conversation = useConversationById(conversationId);

  if (!conversation) {
    return <Loading />;
  }

  return (
    <div className="flex min-h-0 flex-col">
      {source.kind === "working" ? (
        <WorkingTreeBody conversationId={conversation.id} worktree={conversation.attemptId} />
      ) : (
        <PushBody pushId={source.pushId} />
      )}
    </div>
  );
}

function WorkingTreeBody({
  conversationId,
  worktree,
}: {
  conversationId: string;
  worktree: string;
}) {
  const filesResult = useEditedFiles(conversationId);
  return (
    <ResourceView
      resource={filesResult}
      fallback={<FileList files={null} worktree={worktree} base="main" emptyLabel="No edited files." />}
    >
      {(files) => <FileList files={files} worktree={worktree} base="main" emptyLabel="No edited files." />}
    </ResourceView>
  );
}

function PushBody({ pushId }: { pushId: string }) {
  const state = usePushFiles(pushId);
  if (state.kind === "loading") {
    return <Body><Loading /></Body>;
  }
  if (state.kind === "error") {
    return (
      <Body>
        <Placeholder tone="error">{state.message || "Failed to load push."}</Placeholder>
      </Body>
    );
  }
  return (
    <FileList
      files={state.data.files}
      worktree="main"
      base={state.data.baseSha}
      head={state.data.headSha}
      emptyLabel="No files in this push."
    />
  );
}

function sumStats(files: EditedFile[]) {
  return files.reduce(
    (acc, f) => ({
      count: acc.count + 1,
      additions: acc.additions + f.additions,
      deletions: acc.deletions + f.deletions,
    }),
    { count: 0, additions: 0, deletions: 0 },
  );
}

function FileList({
  files,
  worktree,
  base,
  head,
  emptyLabel,
}: {
  files: EditedFile[] | null;
  worktree: string;
  base: string;
  head?: string;
  emptyLabel: string;
}) {
  const config = useConfig(reviewConfig);
  const reviewSections = useMemo(
    () =>
      config.sections.map((s) => ({
        id: s.id,
        name: s.name,
        patterns: s.patterns.map((p) => p.pattern),
      })),
    [config.sections],
  );

  const sorted = useMemo(() => {
    if (!files) return null;
    return [...files].sort((a, b) => a.path.localeCompare(b.path));
  }, [files]);

  const sortedPaths = useMemo(
    () => sorted?.map((f) => f.path) ?? [],
    [sorted],
  );

  const { expanded, allExpanded, toggleAll, toggle: toggleOne } = useExpandAll(sortedPaths);

  const sections = useMemo((): FileSection[] | null => {
    if (!sorted) return null;
    return groupBySection(sorted, reviewSections);
  }, [sorted, reviewSections]);

  const totals = useMemo(
    () => (sorted ? sumStats(sorted) : { count: 0, additions: 0, deletions: 0 }),
    [sorted],
  );

  return (
    <>
      <ToolbarRow
        count={totals.count}
        additions={totals.additions}
        deletions={totals.deletions}
        canToggle={sorted != null && sorted.length > 0}
        allExpanded={allExpanded}
        onToggleAll={toggleAll}
      />
      <Body>
        {sections == null ? (
          <Loading />
        ) : sorted!.length === 0 ? (
          <Placeholder>{emptyLabel}</Placeholder>
        ) : (
          <div className="flex flex-col">
            {sections.map((section) => (
              <FileSectionBlock
                key={section.id ?? "__default__"}
                section={section}
                worktree={worktree}
                base={base}
                head={head}
                expanded={expanded}
                onToggle={toggleOne}
              />
            ))}
          </div>
        )}
      </Body>
    </>
  );
}

function FileSectionBlock({
  section,
  worktree,
  base,
  head,
  expanded,
  onToggle,
}: {
  section: FileSection;
  worktree: string;
  base: string;
  head?: string;
  expanded: ReadonlySet<string>;
  onToggle: (path: string) => void;
}) {
  const label = section.name ?? "Changes";
  const totals = sumStats(section.files);

  return (
    <Collapsible defaultOpen>
      <CollapsibleTrigger className="sticky top-0 z-raised gap-sm border-b border-border bg-muted/60 px-md py-sm text-caption font-medium text-muted-foreground backdrop-blur hover:bg-muted">
        <CollapsibleChevron className="size-3.5" />
        <span>{label}</span>
        <span>·</span>
        <span className="tabular-nums">{totals.count} files</span>
        <span className="tabular-nums text-success">+{totals.additions}</span>
        <span className="tabular-nums text-destructive">−{totals.deletions}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        {section.files.map((file) => (
          <ReviewFileRow
            key={file.path}
            worktree={worktree}
            file={file}
            expanded={expanded.has(file.path)}
            onToggle={() => onToggle(file.path)}
            base={base}
            head={head}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

function ToolbarRow({
  count,
  additions,
  deletions,
  canToggle,
  allExpanded,
  onToggleAll,
}: {
  count: number;
  additions: number;
  deletions: number;
  canToggle: boolean;
  allExpanded: boolean;
  onToggleAll: () => void;
}) {
  return (
    <div className="sticky top-0 z-raised flex items-center gap-md border-b border-border bg-background/95 px-lg py-sm backdrop-blur">
      <Text as="div" variant="label" className="flex items-center gap-sm">
        <span className="tabular-nums">{count} files</span>
        <span className="text-success tabular-nums">
          +{additions}
        </span>
        <span className="text-destructive tabular-nums">
          −{deletions}
        </span>
      </Text>
      <div className="flex flex-1 items-center justify-end gap-xs">
        <ExpandAllButton
          variant="full"
          allExpanded={allExpanded}
          onToggle={onToggleAll}
          disabled={!canToggle}
        />
      </div>
    </div>
  );
}

function Body({ children }: { children: React.ReactNode }) {
  return <div className="min-h-0 flex-1 overflow-auto isolate">{children}</div>;
}
