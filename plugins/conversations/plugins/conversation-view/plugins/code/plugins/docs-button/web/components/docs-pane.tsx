import { useMemo, useState } from "react";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Column } from "@plugins/primitives/plugins/css/plugins/column/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
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

  // Keep state only for the user's explicit pick; derive the effective selection
  // during render so it stays consistent with the current `docs` list (defaulting
  // to the first doc) without an effect-driven double-render.
  const [explicitPath, setExplicitPath] = useState<string | null>(null);
  const selectedPath =
    explicitPath && docs.some((f) => f.path === explicitPath)
      ? explicitPath
      : (docs[0]?.path ?? null);

  const selected = docs.find((f) => f.path === selectedPath) ?? null;

  const title = (
    <Stack direction="row" gap="sm" align="center">
      <span>Docs</span>
      <Text variant="caption" className="tabular-nums text-muted-foreground">
        {docs.length}
      </Text>
    </Stack>
  );

  return (
    <PaneChrome pane={convDocsPane} title={title}>
      <Column
        fill
        className="h-full"
        header={
          docs.length !== 1 ? (
            <Scroll className="max-h-[40%] border-b py-xs">
              {docs.length === 0 ? (
                <Text
                  as="div"
                  variant="caption"
                  className="px-sm py-xs text-muted-foreground"
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
                    onSelect={() => setExplicitPath(f.path)}
                  />
                ))
              )}
            </Scroll>
          ) : undefined
        }
        body={
          selected ? (
            <FilePaneView
              worktree={selected.worktree}
              path={selected.path}
              status={selected.status}
            />
          ) : (
            <Text
              as="div"
              variant="body"
              className="px-md py-sm text-muted-foreground"
            >
              Select a document above.
            </Text>
          )
        }
        scrollBody={false}
      />
    </PaneChrome>
  );
}
