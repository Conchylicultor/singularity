import { useEffect, useMemo, useState } from "react";
import { Text } from "@plugins/primitives/plugins/text/web";
import { PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversationById } from "@plugins/conversations/web";
import { useEditedFiles } from "@plugins/conversations/plugins/conversation-view/plugins/code/web";
import type { EditedFile } from "@plugins/conversations/plugins/conversation-view/plugins/code/core";
import { FilePaneView } from "@plugins/conversations/plugins/conversation-view/plugins/code/plugins/file-pane/web";
import { convDocsPane, isDocFile } from "../panes";
import { usePushedDocFiles } from "../use-pushed-doc-files";
import { DocRow } from "./doc-row";

type DocFile = EditedFile & { worktree: string };

export function DocsPane() {
  const { convId: inputConvId } = convDocsPane.useInput();
  const routeEntry = conversationPane.useRouteEntry();
  const convId = inputConvId ?? routeEntry?.params.convId;
  const conversation = useConversationById(convId ?? null);
  if (!conversation) return null;
  return <DocsPaneInner convId={conversation.id} attemptId={conversation.attemptId} />;
}

function DocsPaneInner({
  convId,
  attemptId,
}: {
  convId: string;
  attemptId: string;
}) {
  const filesResult = useEditedFiles(convId);
  const pushedDocs = usePushedDocFiles(attemptId);

  // Gate edited files inside the pane chrome. The settled-data body owns the
  // useMemo/useState/useEffect, so all hooks run unconditionally before this
  // early return — and we never collapse pending into an empty file list.
  if (filesResult.pending) {
    return (
      <PaneChrome pane={convDocsPane} title="Docs">
        <Loading />
      </PaneChrome>
    );
  }

  return <DocsPaneBody files={filesResult.data} pushedDocs={pushedDocs} attemptId={attemptId} />;
}

function DocsPaneBody({
  files,
  pushedDocs,
  attemptId,
}: {
  files: EditedFile[];
  pushedDocs: EditedFile[] | null;
  attemptId: string;
}) {
  const docs = useMemo<DocFile[]>(() => {
    const byPath = new Map<string, DocFile>();
    // Pushed docs first (lower priority)
    for (const f of pushedDocs ?? []) {
      byPath.set(f.path, { ...f, worktree: "main" });
    }
    // Working tree docs override pushed (current state takes precedence)
    for (const f of files) {
      if (isDocFile(f.path)) {
        byPath.set(f.path, { ...f, worktree: attemptId });
      }
    }
    return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
  }, [files, pushedDocs, attemptId]);

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
      <Text variant="caption" className="tabular-nums text-muted-foreground">
        {docs.length}
      </Text>
    </span>
  );

  return (
    <PaneChrome pane={convDocsPane} title={title}>
      <div className="flex h-full min-h-0 flex-col">
        {docs.length !== 1 && (
          <div className="max-h-[40%] min-h-0 shrink-0 overflow-auto border-b py-1">
            {docs.length === 0 ? (
              <Text
                as="div"
                variant="caption"
                className="px-2 py-1 text-muted-foreground"
              >
                No design docs in the diff.
              </Text>
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
            <Text
              as="div"
              variant="body"
              className="px-3 py-2 text-muted-foreground"
            >
              Select a document above.
            </Text>
          )}
        </div>
      </div>
    </PaneChrome>
  );
}
