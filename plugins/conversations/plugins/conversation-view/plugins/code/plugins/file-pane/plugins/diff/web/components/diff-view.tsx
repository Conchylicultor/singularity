import { useMemo } from "react";
import { Diff, Hunk, parseDiff } from "react-diff-view";
import type { FileData } from "react-diff-view";
import "react-diff-view/style/index.css";
import { useFileDiff } from "../use-file-diff";

export function DiffView({
  conversationId,
  path,
}: {
  conversationId: string;
  path: string;
}) {
  const state = useFileDiff(conversationId, path);

  const files = useMemo<FileData[]>(() => {
    if (state.kind !== "ok" || state.diff.length === 0) return [];
    try {
      return parseDiff(state.diff);
    } catch {
      return [];
    }
  }, [state]);

  if (state.kind === "loading") {
    return <Placeholder>Loading…</Placeholder>;
  }
  if (state.kind === "error") {
    const message =
      state.status === 404
        ? "File not found."
        : state.status === 413
          ? "Diff is too large to preview."
          : state.message || "Failed to load diff.";
    return <Placeholder tone="error">{message}</Placeholder>;
  }

  if (state.diff.length === 0 || files.length === 0) {
    return <Placeholder>No changes vs HEAD.</Placeholder>;
  }

  return (
    <div className="overflow-auto p-3 font-mono text-xs leading-5">
      {files.map((file) => (
        <Diff
          key={`${file.oldRevision}-${file.newRevision}`}
          viewType="split"
          diffType={file.type}
          hunks={file.hunks}
        >
          {(hunks) =>
            hunks.map((hunk) => <Hunk key={hunk.content} hunk={hunk} />)
          }
        </Diff>
      ))}
    </div>
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
