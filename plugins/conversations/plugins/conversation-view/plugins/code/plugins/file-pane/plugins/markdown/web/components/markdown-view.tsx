import { useCallback } from "react";
import { FileOpenContext } from "@plugins/primitives/plugins/file-links/web";
import { MarkdownContent } from "@plugins/primitives/plugins/markdown/web";
import { useFileContent, filePeekPane } from "@plugins/conversations/plugins/conversation-view/plugins/code/plugins/file-pane/web";

export function MarkdownView({
  worktree,
  path,
}: {
  worktree: string;
  path: string;
}) {
  const state = useFileContent(worktree, path);
  const onFileOpen = useCallback(
    (fp: string, ln?: number) =>
      filePeekPane.open({ worktree, filePath: ln != null ? `${fp}:${ln}` : fp }),
    [worktree],
  );

  if (state.kind === "loading") {
    return <Placeholder>Loading…</Placeholder>;
  }
  if (state.kind === "error") {
    const message =
      state.status === 413
        ? "File is too large to preview."
        : state.status === 415
          ? "Binary file — no preview available."
          : state.status === 404
            ? "File not found."
            : state.message || "Failed to load file.";
    return <Placeholder tone="error">{message}</Placeholder>;
  }

  return (
    <FileOpenContext.Provider value={onFileOpen}>
      <MarkdownContent text={state.content} className="px-4 py-3 text-sm leading-6" />
    </FileOpenContext.Provider>
  );
}

function Placeholder({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "muted" | "error";
}) {
  return (
    <div
      className={`px-3 py-2 text-sm ${tone === "error" ? "text-destructive" : "text-muted-foreground"}`}
    >
      {children}
    </div>
  );
}
