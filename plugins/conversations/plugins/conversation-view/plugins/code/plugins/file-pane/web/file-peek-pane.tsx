import { useMemo } from "react";
import {
  Pane,
  PaneChrome,
  useOpenPane,
  defineRoute,
} from "@plugins/primitives/plugins/pane/web";
import { agentManagerApp } from "@plugins/apps/plugins/agent-manager/plugins/shell/core";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useEditedFiles } from "@plugins/conversations/plugins/conversation-view/plugins/code/web";
import { foldResource } from "@plugins/primitives/plugins/live-state/web";
import {
  useResolvedFile,
  FileDisambiguation,
} from "@plugins/code-explorer/plugins/file-resolve/web";
import {
  FileContent,
  useFileRenderers,
} from "@plugins/primitives/plugins/file-viewer/web";
import type { FileRef } from "@plugins/primitives/plugins/file-viewer/core";
import {
  FilePeekHeaderProvider,
  FilePeekTitle,
} from "./components/file-peek-header";

/** The file's basename, minus any trailing `:line` suffix. */
function fileTitle(filePath: string): string {
  const path = filePath.replace(/:\d+$/, "");
  return path.slice(path.lastIndexOf("/") + 1);
}

export const filePeekPane = Pane.define({
  route: defineRoute({
    id: "file-peek",
    segment: "file/:worktree/:filePath*",
  }),
  app: agentManagerApp,
  component: FilePeekPaneBody,
  // Tab/document title: the file name from the URL param, so a deep link
  // shows the file instead of the bare app name. The header paints the path as
  // a breadcrumb (FilePeekTitle); the renderer tabs beside it are a header item.
  title: {
    useText: ({ filePath }) => fileTitle(filePath),
    component: FilePeekTitle,
  },
  chrome: { history: false },
  width: 600,
  useResolve: false,
});

function FilePeekPaneBody() {
  const openPane = useOpenPane();
  const convId = conversationPane.useRouteEntry()?.params.convId;

  const { worktree, filePath: rawFilePath } = filePeekPane.useParams();

  const lineMatch = rawFilePath.match(/:(\d+)$/);
  const line = lineMatch ? parseInt(lineMatch[1]!, 10) : undefined;
  const filePath = lineMatch
    ? rawFilePath.slice(0, -lineMatch[0]!.length)
    : rawFilePath;

  const resolved = useResolvedFile(worktree, filePath);

  // Use the resolved path directly instead of swapping the pane — a swap
  // re-mounts the component (new URL → new params → new fetches), which
  // destroys in-progress text selection.
  const effectivePath =
    resolved.status === "resolved" || resolved.status === "exact"
      ? resolved.path
      : filePath;

  const filesResult = useEditedFiles(convId ?? null);
  // `status` is a derived renderer hint, so an unknown file set (loading, a
  // failed read, or an unresolved worktree) safely defaults to "clean" — no
  // display surface here; the file content itself is a separate read.
  const status = foldResource(filesResult, {
    loading: () => "clean" as const,
    error: () => "clean" as const,
    ready: (files) =>
      files.resolved
        ? (files.value.find((f) => f.path === effectivePath)?.status ?? "clean")
        : "clean",
  });
  const file: FileRef = { source: "git", worktree, path: effectivePath };
  const renderers = useFileRenderers({ file, gitStatus: status });

  // The header's title and renderer tabs read this (see file-peek-header): the
  // requested path and no tabs until the path resolves to one file.
  const settled =
    resolved.status !== "loading" && resolved.status !== "ambiguous";
  const header = useMemo(
    () =>
      settled
        ? { path: effectivePath, renderers }
        : { path: filePath, renderers: null },
    [settled, effectivePath, filePath, renderers],
  );

  if (resolved.status === "loading") {
    return (
      <FilePeekHeaderProvider value={header}>
        <PaneChrome pane={filePeekPane}>
          <Text
            as="div"
            variant="body"
            className="px-md py-sm text-muted-foreground"
          >
            Resolving…
          </Text>
        </PaneChrome>
      </FilePeekHeaderProvider>
    );
  }

  if (resolved.status === "ambiguous") {
    return (
      <FilePeekHeaderProvider value={header}>
        <PaneChrome pane={filePeekPane}>
          <FileDisambiguation
            query={filePath}
            matches={resolved.matches}
            onSelect={(fp) =>
              openPane(
                filePeekPane,
                {
                  worktree,
                  filePath: line != null ? `${fp}:${line}` : fp,
                },
                { mode: "swap" },
              )
            }
          />
        </PaneChrome>
      </FilePeekHeaderProvider>
    );
  }

  return (
    <FilePeekHeaderProvider value={header}>
      <PaneChrome pane={filePeekPane}>
        <FileContent file={file} line={line} active={renderers.active} />
      </PaneChrome>
    </FilePeekHeaderProvider>
  );
}
