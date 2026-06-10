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
import { useDarkMode } from "@plugins/primitives/plugins/syntax-highlight/web";
import { Placeholder } from "@plugins/primitives/plugins/placeholder/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { getFileContent } from "@plugins/code-explorer/core";
import { useFileDiff } from "../use-file-diff";
import { useDiffTokens } from "../use-diff-tokens";
import type { DiffTokens } from "../use-diff-tokens";
import "./diff-view.css";

type DiffSide = "old" | "new";

// 1-based :nth-child index of the code cell in 4-col split rows.
// Monotonous (pure-add / pure-delete) rows always put the code cell at :nth-child(2).
const CODE_NTH_SPLIT: Record<DiffSide, number> = { old: 2, new: 4 };
const CODE_NTH_MONO = 2;

// react-diff-view renders split rows with 4 cells (old-gutter, old-code,
// new-gutter, new-code) or, for pure-add/pure-delete hunks, monotonous 2-cell
// rows. In 4-col mode the side is unambiguous from the column index; 2-col
// rows are ambiguous from the DOM — the caller passes fixedSide for those.
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
      return null;
    }
    el = el.parentElement;
  }
  return null;
}

function getSideFromNode(node: Node | null): DiffSide | null {
  return getSide(node instanceof Element ? node : node?.parentElement ?? null);
}

export function DiffRenderer({
  files,
  hunks,
  tokens,
  totalLines,
  onExpandLines,
}: {
  files: FileData[];
  hunks: HunkData[] | null;
  tokens: DiffTokens | null;
  totalLines?: number | null;
  onExpandLines?: (start: number, end: number) => void;
}) {
  const fixedSide: DiffSide | null =
    files[0]?.type === "add" ? "new" : files[0]?.type === "delete" ? "old" : null;

  const containerRef = useRef<HTMLDivElement>(null);
  const lastClickedSide = useRef<DiffSide | null>(null);

  function handleMouseDown(e: MouseEvent<HTMLDivElement>) {
    if (fixedSide) {
      lastClickedSide.current = fixedSide;
      return;
    }

    const side = getSide(e.target as Element);
    lastClickedSide.current = side;
    if (!side || !containerRef.current) return;

    const container = containerRef.current;
    const activeSide = side;
    container.setAttribute("data-active-side", activeSide);

    function onSelectionChange() {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;

      const focusSide = getSideFromNode(sel.focusNode);
      if (!focusSide || focusSide === activeSide) return;

      const anchorNode = sel.anchorNode;
      const anchorOffset = sel.anchorOffset;
      const nth = CODE_NTH_SPLIT[activeSide];
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
      const sel = window.getSelection();
      if (!sel) return;

      const side = fixedSide ?? lastClickedSide.current ?? getSideFromNode(sel.anchorNode);
      if (!side) return;

      e.preventDefault();
      sel.removeAllRanges();
      if (!fixedSide) containerRef.current.setAttribute("data-active-side", side);
      const nth = fixedSide ? CODE_NTH_MONO : CODE_NTH_SPLIT[side];
      const cells = containerRef.current.querySelectorAll(`.diff-line > td:nth-child(${nth})`);
      const first = cells[0];
      const last = cells[cells.length - 1];
      if (first && last) {
        const range = document.createRange();
        range.setStartBefore(first);
        range.setEndAfter(last);
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
    const nth = fixedSide ? CODE_NTH_MONO : CODE_NTH_SPLIT[side];
    const lines: string[] = [];

    for (const row of containerRef.current.querySelectorAll<HTMLElement>(".diff-line")) {
      const cell = row.children[nth - 1] as Element | undefined;
      if (!cell || !range.intersectsNode(cell)) continue;
      const cellRange = document.createRange();
      cellRange.selectNodeContents(cell);
      if (range.compareBoundaryPoints(Range.START_TO_START, cellRange) > 0) {
        cellRange.setStart(range.startContainer, range.startOffset);
      }
      if (range.compareBoundaryPoints(Range.END_TO_END, cellRange) < 0) {
        cellRange.setEnd(range.endContainer, range.endOffset);
      }
      lines.push(cellRange.toString());
    }

    if (lines.length > 0) {
      e.clipboardData.setData("text/plain", lines.join("\n"));
      e.preventDefault();
    }
  }

  const effectiveHunks = hunks ?? files[0]?.hunks ?? [];

  return (
    <div
      ref={containerRef}
      // eslint-disable-next-line text/no-adhoc-typography -- leading-5 fixes mono diff line-height for gutter alignment, distinct from caption's tighter line-height
      className="diff-view overflow-auto font-mono text-caption leading-5"
      data-monotonous={fixedSide ? "" : undefined}
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
          hunks={i === 0 ? effectiveHunks : file.hunks}
          tokens={i === 0 ? tokens : null}
          renderToken={renderShikiToken}
        >
          {(fileHunks) =>
            fileHunks.flatMap((hunk, idx) => {
              const prevHunk = idx > 0 ? fileHunks[idx - 1] : null;
              const linesAbove = prevHunk
                ? getCollapsedLinesCountBetween(prevHunk, hunk)
                : hunk.oldStart - 1;
              const gapStart = prevHunk ? prevHunk.oldStart + prevHunk.oldLines : 1;
              const gapEnd = hunk.oldStart;
              const elements: JSX.Element[] = [];
              if (linesAbove > 0 && i === 0 && onExpandLines) {
                elements.push(
                  <Decoration key={`skip-${idx}-${hunk.newStart}`}>
                    <SkipSeparator
                      count={linesAbove}
                      onExpandTop={(n) => onExpandLines(gapStart, Math.min(gapStart + n, gapEnd))}
                      onExpandBottom={(n) => onExpandLines(Math.max(gapEnd - n, gapStart), gapEnd)}
                      onExpandAll={() => onExpandLines(gapStart, gapEnd)}
                    />
                  </Decoration>,
                );
              }
              elements.push(<Hunk key={hunk.content} hunk={hunk} />);
              if (idx === fileHunks.length - 1 && i === 0 && totalLines != null && onExpandLines) {
                const lastOldLine = hunk.oldStart + hunk.oldLines - 1;
                const linesBelow = totalLines - lastOldLine;
                if (linesBelow > 0) {
                  elements.push(
                    <Decoration key={`skip-end-${hunk.newStart}`}>
                      <SkipSeparator
                        count={linesBelow}
                        onExpandTop={(n) => onExpandLines(lastOldLine + 1, Math.min(lastOldLine + 1 + n, totalLines + 1))}
                        onExpandBottom={(n) => onExpandLines(Math.max(totalLines + 1 - n, lastOldLine + 1), totalLines + 1)}
                        onExpandAll={() => onExpandLines(lastOldLine + 1, totalLines + 1)}
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

export function DiffView({
  worktree,
  path,
  base,
  head,
  from,
}: {
  worktree: string;
  path: string;
  base?: string;
  head?: string;
  from?: string;
}) {
  const state = useFileDiff(worktree, path, base, head, from);
  const dark = useDarkMode();
  const basePath = from ?? path;

  const files = useMemo<FileData[]>(() => {
    if (state.kind !== "ok" || state.diff.length === 0) return [];
    try {
      return parseDiff(state.diff);
    } catch (err) {
      if (!(err instanceof Error)) throw err;
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
    // eslint-disable-next-line promise-safety/no-bare-catch -- background preload; 404/413 are expected for deleted/large files
    void fetchEndpoint(getFileContent, { worktree }, { query: { path: basePath, ref } })
      .then((body) => {
        fileContentRef.current = body.content;
        setTotalLines(body.content.split("\n").length);
      })
      .catch(() => {});
  }, [baseHunks, worktree, basePath, base]);

  const effectiveHunks = expandedHunks ?? baseHunks;
  const tokens = useDiffTokens(effectiveHunks, path, dark, worktree, base, head, from);

  const expandLines = useCallback(
    async (start: number, end: number) => {
      if (!fileContentRef.current) {
        const ref = base ?? "HEAD";
        try {
          const body = await fetchEndpoint(getFileContent, { worktree }, { query: { path: basePath, ref } });
          fileContentRef.current = body.content;
          setTotalLines(fileContentRef.current.split("\n").length);
        } catch (err) {
          // Expand is best-effort: network errors and 404/413 (deleted or large file) are expected
          if (!(err instanceof Error)) throw err;
          return;
        }
      }
      const content = fileContentRef.current;
      setExpandedHunks((prev) => {
        const current = prev ?? baseHunks ?? [];
        return expandFromRawCode(current, content, start, end);
      });
    },
    [worktree, basePath, base, baseHunks],
  );

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
    <DiffRenderer
      files={files}
      hunks={effectiveHunks}
      tokens={tokens}
      totalLines={totalLines}
      onExpandLines={expandLines}
    />
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
