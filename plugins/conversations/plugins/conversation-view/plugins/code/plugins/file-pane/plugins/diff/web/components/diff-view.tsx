import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import { useMemo, useRef } from "react";
import { Diff, Hunk, parseDiff } from "react-diff-view";
import type { FileData, TokenNode } from "react-diff-view";
import "react-diff-view/style/index.css";
import { useDarkMode } from "../../../../web/use-dark-mode";
import { useFileDiff } from "../use-file-diff";
import { useDiffTokens } from "../use-diff-tokens";
import "./diff-view.css";

export function DiffView({
  conversationId,
  path,
  base,
}: {
  conversationId: string;
  path: string;
  base?: string;
}) {
  const state = useFileDiff(conversationId, path, base);
  const dark = useDarkMode();

  const files = useMemo<FileData[]>(() => {
    if (state.kind !== "ok" || state.diff.length === 0) return [];
    try {
      return parseDiff(state.diff);
    } catch {
      return [];
    }
  }, [state]);

  const hunks = files[0]?.hunks ?? null;
  const tokens = useDiffTokens(hunks, path, dark, conversationId, base);
  const containerRef = useRef<HTMLDivElement>(null);

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if ((e.ctrlKey || e.metaKey) && e.key === "a" && containerRef.current) {
      e.preventDefault();
      const sel = window.getSelection();
      if (!sel) return;
      const range = document.createRange();
      range.selectNodeContents(containerRef.current);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }

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
    return <Placeholder>No changes vs {base ?? "HEAD"}.</Placeholder>;
  }

  return (
    <div
      ref={containerRef}
      className="diff-view overflow-auto font-mono text-xs leading-5"
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      {files.map((file, i) => (
        <Diff
          key={`${file.oldRevision}-${file.newRevision}`}
          viewType="split"
          diffType={file.type}
          hunks={file.hunks}
          tokens={i === 0 ? tokens : null}
          renderToken={renderShikiToken}
        >
          {(hunks) =>
            hunks.map((hunk) => <Hunk key={hunk.content} hunk={hunk} />)
          }
        </Diff>
      ))}
    </div>
  );
}

function renderShikiToken(
  node: TokenNode,
  defaultRender: (node: TokenNode, i: number) => ReactNode,
  i: number,
): ReactNode {
  if (node.type !== "shiki") return defaultRender(node, i);
  const style: CSSProperties = {};
  if (typeof node.color === "string") style.color = node.color;
  const fontStyle = typeof node.fontStyle === "number" ? node.fontStyle : 0;
  if (fontStyle > 0) {
    if (fontStyle & 1) style.fontStyle = "italic";
    if (fontStyle & 2) style.fontWeight = "bold";
    if (fontStyle & 4) style.textDecoration = "underline";
  }
  return (
    <span key={i} style={style}>
      {typeof node.value === "string" ? node.value : null}
    </span>
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
