import type { CSSProperties, JSX, KeyboardEvent, MouseEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Decoration,
  Diff,
  Hunk,
  expandFromRawCode,
  getCollapsedLinesCountBetween,
  parseDiff,
} from "react-diff-view";
import type { FileData, HunkData, TokenNode } from "react-diff-view";
import "react-diff-view/style/index.css";
import { useDarkMode } from "../../../../web/use-dark-mode";
import { useFileDiff } from "../use-file-diff";
import { useDiffTokens } from "../use-diff-tokens";
import "./diff-view.css";

type DiffSide = "old" | "new";

function getSide(el: Element | null): DiffSide | null {
  while (el) {
    if (el.classList.contains("diff-code-old") || el.classList.contains("diff-gutter-old")) return "old";
    if (el.classList.contains("diff-code-new") || el.classList.contains("diff-gutter-new")) return "new";
    el = el.parentElement;
  }
  return null;
}

function getSideFromNode(node: Node | null): DiffSide | null {
  return getSide(node instanceof Element ? node : node?.parentElement ?? null);
}

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

  const baseHunks = files[0]?.hunks ?? null;
  const [expandedHunks, setExpandedHunks] = useState<HunkData[] | null>(null);
  const fileContentRef = useRef<string | null>(null);

  useEffect(() => {
    setExpandedHunks(null);
    fileContentRef.current = null;
  }, [state]);

  const effectiveHunks = expandedHunks ?? baseHunks;
  const tokens = useDiffTokens(effectiveHunks, path, dark, conversationId, base);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastClickedSide = useRef<DiffSide | null>(null);

  const expandLines = useCallback(
    async (start: number, end: number) => {
      if (!fileContentRef.current) {
        const ref = base ?? "HEAD";
        const res = await fetch(
          `/api/conversations/${conversationId}/file?path=${encodeURIComponent(path)}&ref=${encodeURIComponent(ref)}`,
        );
        if (!res.ok) return;
        const body = (await res.json()) as { content?: string };
        fileContentRef.current = body.content ?? "";
      }
      const content = fileContentRef.current;
      setExpandedHunks((prev) => {
        const current = prev ?? baseHunks ?? [];
        return expandFromRawCode(current, content, start, end);
      });
    },
    [conversationId, path, base, baseHunks],
  );

  function handleMouseDown(e: MouseEvent<HTMLDivElement>) {
    const side = getSide(e.target as Element);
    lastClickedSide.current = side;
    if (!side || !containerRef.current) return;
    containerRef.current.setAttribute("data-selecting", side);
    const cleanup = () => {
      containerRef.current?.removeAttribute("data-selecting");
      document.removeEventListener("mouseup", cleanup);
    };
    document.addEventListener("mouseup", cleanup);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if ((e.ctrlKey || e.metaKey) && e.key === "a" && containerRef.current) {
      e.preventDefault();
      const sel = window.getSelection();
      if (!sel) return;

      const side =
        lastClickedSide.current ??
        getSideFromNode(sel.anchorNode);

      sel.removeAllRanges();
      if (side) {
        const cells = containerRef.current.querySelectorAll(`.diff-code-${side}`);
        const first = cells[0];
        const last = cells[cells.length - 1];
        if (first && last) {
          const range = document.createRange();
          range.setStartBefore(first);
          range.setEndAfter(last);
          sel.addRange(range);
        }
      } else {
        const range = document.createRange();
        range.selectNodeContents(containerRef.current);
        sel.addRange(range);
      }
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
      onMouseDown={handleMouseDown}
      tabIndex={-1}
    >
      {files.map((file, i) => (
        <Diff
          key={`${file.oldRevision}-${file.newRevision}`}
          viewType="split"
          diffType={file.type}
          hunks={i === 0 ? (effectiveHunks ?? file.hunks) : file.hunks}
          tokens={i === 0 ? tokens : null}
          renderToken={renderShikiToken}
        >
          {(hunks) =>
            hunks.flatMap((hunk, idx) => {
              const prevHunk = idx > 0 ? hunks[idx - 1] : null;
              const skipped = getCollapsedLinesCountBetween(prevHunk ?? null, hunk);
              const gapStart = prevHunk
                ? prevHunk.oldStart + prevHunk.oldLines
                : 1;
              const gapEnd = hunk.oldStart;
              const elements: JSX.Element[] = [];
              if (skipped > 0 && i === 0) {
                elements.push(
                  <Decoration key={`skip-${idx}-${hunk.newStart}`}>
                    <button
                      type="button"
                      className="diff-skip-separator"
                      onClick={() => expandLines(gapStart, gapEnd)}
                    >
                      {skipped} {skipped === 1 ? "line" : "lines"} skipped — click to expand
                    </button>
                  </Decoration>,
                );
              }
              elements.push(<Hunk key={hunk.content} hunk={hunk} />);
              return elements;
            })
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
