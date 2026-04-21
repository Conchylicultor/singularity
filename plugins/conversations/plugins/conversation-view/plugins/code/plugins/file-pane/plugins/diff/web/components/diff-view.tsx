import type { ClipboardEvent, CSSProperties, JSX, KeyboardEvent, MouseEvent, ReactNode } from "react";
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

// Split view rows have 4 cells: old-gutter(0), old-code(1), new-gutter(2), new-code(3).
// Without hideGutter: 2 cells — old-code(0), new-code(1).
// react-diff-view uses type-based class names (insert/delete/normal), not side-based,
// so we rely on column index instead of class names.
function getSide(el: Element | null): DiffSide | null {
  while (el) {
    if (el.tagName === "TD") {
      const tr = el.parentElement;
      if (!tr?.classList.contains("diff-line")) return null;
      let idx = 0;
      let prev = el.previousElementSibling;
      while (prev) { idx++; prev = prev.previousElementSibling; }
      const count = tr.children.length;
      if (count === 4) return idx <= 1 ? "old" : "new";
      if (count === 2) return idx === 0 ? "old" : "new";
      return null;
    }
    el = el.parentElement;
  }
  return null;
}

function getSideFromNode(node: Node | null): DiffSide | null {
  return getSide(node instanceof Element ? node : node?.parentElement ?? null);
}

// 1-based :nth-child index of the code cell for each side (4-column layout with gutters)
const CODE_NTH: Record<DiffSide, number> = { old: 2, new: 4 };

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
  const [totalLines, setTotalLines] = useState<number | null>(null);
  const fileContentRef = useRef<string | null>(null);

  useEffect(() => {
    setExpandedHunks(null);
    setTotalLines(null);
    fileContentRef.current = null;
  }, [state]);

  useEffect(() => {
    if (!baseHunks) return;
    const ref = base ?? "HEAD";
    fetch(`/api/conversations/${conversationId}/file?path=${encodeURIComponent(path)}&ref=${encodeURIComponent(ref)}`)
      .then((res) => res.ok ? res.json() : null)
      .then((body: { content?: string } | null) => {
        if (!body?.content) return;
        fileContentRef.current = body.content;
        setTotalLines(body.content.split("\n").length);
      })
      .catch(() => {});
  }, [baseHunks, conversationId, path, base]);

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
        setTotalLines(fileContentRef.current.split("\n").length);
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

    const container = containerRef.current;
    const activeSide = side; // typed as DiffSide (non-null) for closure capture
    container.setAttribute("data-active-side", activeSide);

    function onSelectionChange() {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;

      const focusSide = getSideFromNode(sel.focusNode);
      if (!focusSide || focusSide === activeSide) return;

      // Selection crossed to the opposite side — trim it back
      const anchorNode = sel.anchorNode;
      const anchorOffset = sel.anchorOffset;
      const nth = CODE_NTH[activeSide];
      const cells = Array.from(container.querySelectorAll<Element>(`.diff-line > td:nth-child(${nth})`));
      const firstCell = cells[0];
      const lastCell = cells[cells.length - 1];
      if (!firstCell || !lastCell) return;

      const range = document.createRange();
      if (activeSide === "old") {
        if (anchorNode) range.setStart(anchorNode, anchorOffset);
        else range.setStartBefore(firstCell);
        range.setEndAfter(lastCell);
      } else {
        range.setStartBefore(firstCell);
        if (anchorNode) range.setEnd(anchorNode, anchorOffset);
        else range.setEndAfter(lastCell);
      }
      sel.removeAllRanges();
      sel.addRange(range);
    }

    document.addEventListener("selectionchange", onSelectionChange);

    const cleanup = () => {
      document.removeEventListener("mouseup", cleanup);
      document.removeEventListener("selectionchange", onSelectionChange);
    };
    document.addEventListener("mouseup", cleanup);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if ((e.ctrlKey || e.metaKey) && e.key === "a" && containerRef.current) {
      e.preventDefault();
      const sel = window.getSelection();
      if (!sel) return;

      const side = lastClickedSide.current ?? getSideFromNode(sel.anchorNode);

      sel.removeAllRanges();
      if (side) {
        containerRef.current.setAttribute("data-active-side", side);
        const nth = CODE_NTH[side];
        const cells = containerRef.current.querySelectorAll(`.diff-line > td:nth-child(${nth})`);
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

  function handleCopy(e: ClipboardEvent<HTMLDivElement>) {
    const side = lastClickedSide.current;
    if (!side || !containerRef.current) return;

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);
    const nth = CODE_NTH[side];
    const lines: string[] = [];

    for (const row of containerRef.current.querySelectorAll<HTMLElement>(".diff-line")) {
      const cell = row.children[nth - 1] as Element | undefined;
      if (cell && range.intersectsNode(cell)) {
        lines.push(cell.textContent ?? "");
      }
    }

    if (lines.length > 0) {
      e.clipboardData.setData("text/plain", lines.join("\n"));
      e.preventDefault();
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
      onCopy={handleCopy}
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
              const linesAbove = prevHunk
                ? getCollapsedLinesCountBetween(prevHunk, hunk)
                : hunk.oldStart - 1;
              const gapStart = prevHunk ? prevHunk.oldStart + prevHunk.oldLines : 1;
              const gapEnd = hunk.oldStart;
              const elements: JSX.Element[] = [];
              if (linesAbove > 0 && i === 0) {
                elements.push(
                  <Decoration key={`skip-${idx}-${hunk.newStart}`}>
                    <SkipSeparator
                      count={linesAbove}
                      onExpandTop={(n) => expandLines(gapStart, Math.min(gapStart + n, gapEnd))}
                      onExpandBottom={(n) => expandLines(Math.max(gapEnd - n, gapStart), gapEnd)}
                      onExpandAll={() => expandLines(gapStart, gapEnd)}
                    />
                  </Decoration>,
                );
              }
              elements.push(<Hunk key={hunk.content} hunk={hunk} />);
              if (idx === hunks.length - 1 && i === 0 && totalLines !== null) {
                const lastOldLine = hunk.oldStart + hunk.oldLines - 1;
                const linesBelow = totalLines - lastOldLine;
                if (linesBelow > 0) {
                  elements.push(
                    <Decoration key={`skip-end-${hunk.newStart}`}>
                      <SkipSeparator
                        count={linesBelow}
                        onExpandTop={(n) => expandLines(lastOldLine + 1, Math.min(lastOldLine + 1 + n, totalLines + 1))}
                        onExpandBottom={(n) => expandLines(Math.max(totalLines + 1 - n, lastOldLine + 1), totalLines + 1)}
                        onExpandAll={() => expandLines(lastOldLine + 1, totalLines + 1)}
                      />
                    </Decoration>,
                  );
                }
              }
              return elements;
            })
          }
        </Diff>
      ))}
    </div>
  );
}

function SkipSeparator({
  count,
  onExpandTop,
  onExpandBottom,
  onExpandAll,
}: {
  count: number;
  onExpandTop: (n: number) => void;
  onExpandBottom: (n: number) => void;
  onExpandAll: () => void;
}) {
  const steps = [5, 10, 50].filter((n) => n < count);
  return (
    <div className="diff-skip-separator">
      <span className="diff-skip-actions">
        {[...steps].reverse().map((n) => (
          <button key={n} type="button" onClick={() => onExpandTop(n)}>
            ↓{n}
          </button>
        ))}
      </span>
      <button type="button" className="diff-skip-label" onClick={onExpandAll}>
        {count} {count === 1 ? "line" : "lines"}
      </button>
      <span className="diff-skip-actions">
        {steps.map((n) => (
          <button key={n} type="button" onClick={() => onExpandBottom(n)}>
            {n}↑
          </button>
        ))}
      </span>
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
