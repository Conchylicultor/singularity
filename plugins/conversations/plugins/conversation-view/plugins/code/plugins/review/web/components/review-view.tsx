import { useMemo, useState } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { Placeholder } from "@plugins/primitives/plugins/placeholder/web";
import { Collapsible, CollapsibleTrigger, CollapsibleContent, CollapsibleChevron } from "@plugins/primitives/plugins/collapsible/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { pushesResource, type Push } from "@plugins/tasks/core";
import type { EditedFile } from "@plugins/conversations/plugins/conversation-view/plugins/code/core";
import { Button } from "@/components/ui/button";
import { useEditedFiles } from "@plugins/conversations/plugins/conversation-view/plugins/code/web";
import { reviewSectionsResource } from "../../shared/resources";
import { groupBySection, type FileSection } from "../core-files";
import { usePushFiles } from "../use-push-files";
import { ReviewFileRow } from "./review-file-row";

type Source =
  | { kind: "working" }
  | { kind: "push"; pushId: string };

interface PushGroup {
  pushId: string;
  message: string;
  count: number;
  createdAt: Date;
}

function groupPushes(rows: Push[]): PushGroup[] {
  const byId = new Map<string, PushGroup>();
  for (const row of rows) {
    const existing = byId.get(row.pushId);
    const createdAt = new Date(row.createdAt);
    if (existing) {
      existing.count += 1;
      // Show the most-recent commit's subject; rows arrive sorted desc by
      // pushesResource so the first-seen row already wins.
      if (createdAt > existing.createdAt) {
        existing.createdAt = createdAt;
        existing.message = row.message;
      }
    } else {
      byId.set(row.pushId, {
        pushId: row.pushId,
        message: row.message,
        count: 1,
        createdAt,
      });
    }
  }
  return [...byId.values()].sort((a, b) => +b.createdAt - +a.createdAt);
}

function formatDate(value: Date): string {
  return value.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ReviewView() {
  const { conversation } = conversationPane.useData();
  const [source, setSource] = useState<Source>({ kind: "working" });

  const pushesQ = useResource(pushesResource);
  const pushGroups = useMemo(() => {
    const rows = pushesQ.data.filter(
      (p) => p.attemptId === conversation.attemptId,
    );
    return groupPushes(rows);
  }, [pushesQ.data, conversation.attemptId]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-muted/20">
      <SourceTabs
        source={source}
        onChange={setSource}
        pushGroups={pushGroups}
      />
      {source.kind === "working" ? (
        <WorkingTreeBody conversationId={conversation.id} worktree={conversation.attemptId} />
      ) : (
        <PushBody pushId={source.pushId} />
      )}
    </div>
  );
}

function SourceTabs({
  source,
  onChange,
  pushGroups,
}: {
  source: Source;
  onChange: (next: Source) => void;
  pushGroups: PushGroup[];
}) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b border-border bg-background/95 px-2 py-1.5 backdrop-blur">
      <SourceTab
        active={source.kind === "working"}
        onClick={() => onChange({ kind: "working" })}
        title="Uncommitted changes vs. main"
      >
        Working tree
      </SourceTab>
      {pushGroups.map((g) => (
        <SourceTab
          key={g.pushId}
          active={source.kind === "push" && source.pushId === g.pushId}
          onClick={() => onChange({ kind: "push", pushId: g.pushId })}
          title={`${g.message} · ${formatDate(g.createdAt)}`}
        >
          <span className="max-w-[24ch] truncate">{g.message}</span>
          {g.count > 1 && (
            <span className="ml-1 text-muted-foreground tabular-nums">
              ×{g.count}
            </span>
          )}
        </SourceTab>
      ))}
    </div>
  );
}

function SourceTab({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={
        "flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors " +
        (active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground")
      }
    >
      {children}
    </button>
  );
}

function WorkingTreeBody({
  conversationId,
  worktree,
}: {
  conversationId: string;
  worktree: string;
}) {
  const { files } = useEditedFiles(conversationId);
  return (
    <FileList files={files} worktree={worktree} base="main" emptyLabel="No edited files." />
  );
}

function PushBody({ pushId }: { pushId: string }) {
  const state = usePushFiles(pushId);
  if (state.kind === "loading") {
    return <Body><Placeholder>Loading…</Placeholder></Body>;
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
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const { data: reviewSections } = useResource(reviewSectionsResource);

  const sorted = useMemo(() => {
    if (!files) return null;
    return [...files].sort((a, b) => a.path.localeCompare(b.path));
  }, [files]);

  const sections = useMemo((): FileSection[] | null => {
    if (!sorted) return null;
    return groupBySection(sorted, reviewSections);
  }, [sorted, reviewSections]);

  const totals = useMemo(
    () => (sorted ? sumStats(sorted) : { count: 0, additions: 0, deletions: 0 }),
    [sorted],
  );

  const allExpanded =
    sorted != null && sorted.length > 0 && expanded.size === sorted.length;

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
          <Placeholder>Loading…</Placeholder>
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
  expanded: Set<string>;
  onToggle: (path: string) => void;
}) {
  const label = section.name ?? "Changes";
  const totals = sumStats(section.files);

  return (
    <Collapsible defaultOpen>
      <CollapsibleTrigger className="sticky top-0 z-[2] gap-2 border-b border-border bg-muted/60 px-3 py-2 text-xs font-medium text-muted-foreground backdrop-blur hover:bg-muted">
        <CollapsibleChevron className="size-3.5" />
        <span>{label}</span>
        <span>·</span>
        <span className="tabular-nums">{totals.count} files</span>
        <span className="tabular-nums text-emerald-600 dark:text-emerald-400">+{totals.additions}</span>
        <span className="tabular-nums text-red-600 dark:text-red-400">−{totals.deletions}</span>
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
    <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-2 backdrop-blur">
      <div className="flex items-center gap-2 text-sm font-medium">
        <span>Review</span>
        <span className="text-muted-foreground">·</span>
        <span className="tabular-nums">{count} files</span>
        <span className="text-emerald-600 tabular-nums dark:text-emerald-400">
          +{additions}
        </span>
        <span className="text-red-600 tabular-nums dark:text-red-400">
          −{deletions}
        </span>
      </div>
      <div className="flex flex-1 items-center justify-end gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleAll}
          disabled={!canToggle}
        >
          {allExpanded ? "Collapse all" : "Expand all"}
        </Button>
      </div>
    </div>
  );
}

function Body({ children }: { children: React.ReactNode }) {
  return <div className="min-h-0 flex-1 overflow-auto">{children}</div>;
}
