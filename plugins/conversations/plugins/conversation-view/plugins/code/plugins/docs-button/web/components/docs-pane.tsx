import { useEffect, useMemo, useState } from "react";
import { PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useEditedFiles } from "@plugins/conversations/plugins/conversation-view/plugins/code/web";
import type { EditedFile } from "@plugins/conversations/plugins/conversation-view/plugins/code/core";
import { FilePaneView } from "@plugins/conversations/plugins/conversation-view/plugins/code/plugins/file-pane/web";
import { convDocsPane, isDocFile } from "../panes";
import { usePushedDocFiles } from "../use-pushed-doc-files";
import { DocRow } from "./doc-row";

type DocFile = EditedFile & { worktree: string };

export function DocsPane() {
  const { conversation } = conversationPane.useData();
  const { files } = useEditedFiles(conversation.id);
  const pushedDocs = usePushedDocFiles(conversation.attemptId);

  const docs = useMemo<DocFile[]>(() => {
    const byPath = new Map<string, DocFile>();
    // Pushed docs first (lower priority)
    for (const f of pushedDocs ?? []) {
      byPath.set(f.path, { ...f, worktree: "main" });
    }
    // Working tree docs override pushed (current state takes precedence)
    for (const f of files) {
      if (isDocFile(f.path)) {
        byPath.set(f.path, { ...f, worktree: conversation.attemptId });
      }
    }
    return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
  }, [files, pushedDocs, conversation.attemptId]);

  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  useEffect(() => {
    const first = docs[0];
    if (!first) return;
    if (selectedPath && docs.some((f) => f.path === selectedPath)) return;
    setSelectedPath(first.path);
  }, [docs, selectedPath]);

  const selected = docs.find((f) => f.path === selectedPath) ?? null;

  const title = (
    <span className="flex items-center gap-2">
      <span>Docs</span>
      <span className="tabular-nums text-xs text-muted-foreground">
        {docs.length}
      </span>
    </span>
  );

  return (
    <PaneChrome pane={convDocsPane} title={title}>
      <div className="flex h-full min-h-0 flex-col">
        {docs.length !== 1 && (
          <div className="max-h-[40%] min-h-0 shrink-0 overflow-auto border-b py-1">
            {docs.length === 0 ? (
              <div className="px-2 py-1 text-xs text-muted-foreground">
                No design docs in the diff.
              </div>
            ) : (
              docs.map((f) => (
                <DocRow
                  key={f.path}
                  path={f.path}
                  status={f.status}
                  selected={f.path === selectedPath}
                  onSelect={() => setSelectedPath(f.path)}
                />
              ))
            )}
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-hidden">
          {selected ? (
              <FilePaneView
                worktree={selected.worktree}
                path={selected.path}
                status={selected.status}
              />
          ) : (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              Select a document above.
            </div>
          )}
        </div>
      </div>
    </PaneChrome>
  );
}
