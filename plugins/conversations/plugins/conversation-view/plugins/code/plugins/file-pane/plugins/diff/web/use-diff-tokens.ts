import { useEffect, useState } from "react";
import type { HunkData } from "react-diff-view";
import type { BundledLanguage, ThemedToken } from "shiki";
import {
  getHighlighter,
  languageForPath,
  SHIKI_LANGS,
  themeForMode,
} from "@plugins/primitives/plugins/syntax-highlight/web";

export type ShikiTokenNode = {
  type: "shiki";
  value: string;
  color?: string;
  fontStyle?: number;
};

export type DiffTokens = {
  old: ShikiTokenNode[][];
  new: ShikiTokenNode[][];
};

function themedToTokens(lines: ThemedToken[][]): ShikiTokenNode[][] {
  return lines.map((line) =>
    line.map((tok) => ({
      type: "shiki" as const,
      value: tok.content,
      color: tok.color,
      fontStyle: tok.fontStyle,
    })),
  );
}

async function fetchFileContent(
  worktree: string,
  path: string,
  ref?: string,
): Promise<string | null> {
  const refQuery = ref ? `&ref=${encodeURIComponent(ref)}` : "";
  const url = `/api/code/${encodeURIComponent(worktree)}/file?path=${encodeURIComponent(path)}${refQuery}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const body = (await res.json()) as { content?: string };
    return body.content ?? null;
  } catch {
    return null;
  }
}

function buildSideTokenMap(
  hunks: HunkData[],
  side: "old" | "new",
  allLines: ShikiTokenNode[][],
): ShikiTokenNode[][] {
  const lineCount = allLines.length;
  const result: ShikiTokenNode[][] = [];

  let maxLine = 0;
  for (const hunk of hunks) {
    for (const change of hunk.changes) {
      let lineNumber: number | undefined;
      if (change.type === "normal") {
        lineNumber = side === "old" ? change.oldLineNumber : change.newLineNumber;
      } else if (change.type === "delete" && side === "old") {
        lineNumber = change.lineNumber;
      } else if (change.type === "insert" && side === "new") {
        lineNumber = change.lineNumber;
      }
      if (lineNumber !== undefined && lineNumber > maxLine) maxLine = lineNumber;
    }
  }

  const lineMap = new Map<number, ShikiTokenNode[]>();
  for (const hunk of hunks) {
    for (const change of hunk.changes) {
      let lineNumber: number | undefined;
      if (change.type === "normal") {
        lineNumber = side === "old" ? change.oldLineNumber : change.newLineNumber;
      } else if (change.type === "delete" && side === "old") {
        lineNumber = change.lineNumber;
      } else if (change.type === "insert" && side === "new") {
        lineNumber = change.lineNumber;
      }
      if (lineNumber !== undefined) {
        const idx = lineNumber - 1;
        lineMap.set(lineNumber, idx < lineCount ? (allLines[idx] ?? []) : []);
      }
    }
  }

  for (let i = 1; i <= maxLine; i++) {
    result.push(lineMap.get(i) ?? []);
  }
  return result;
}

export function useDiffTokens(
  hunks: HunkData[] | null,
  path: string,
  dark: boolean,
  worktree: string,
  base?: string,
  head?: string,
): DiffTokens | null {
  const [tokens, setTokens] = useState<DiffTokens | null>(null);

  useEffect(() => {
    if (!hunks || hunks.length === 0) {
      setTokens(null);
      return;
    }
    const rawLang = languageForPath(path);
    if (!SHIKI_LANGS.includes(rawLang)) {
      setTokens(null);
      return;
    }
    const lang = rawLang as BundledLanguage;
    let cancelled = false;
    const theme = themeForMode(dark);
    const oldRef = base ?? "HEAD";

    Promise.all([
      fetchFileContent(worktree, path, oldRef),
      fetchFileContent(worktree, path, head),
      getHighlighter(),
    ]).then(([oldContent, newContent, hl]) => {
      if (cancelled) return;

      const highlight = (content: string | null) => {
        if (!content) return [];
        return themedToTokens(hl.codeToTokensBase(content, { lang, theme }));
      };

      const oldAllLines = highlight(oldContent);
      const newAllLines = highlight(newContent);

      setTokens({
        old: buildSideTokenMap(hunks, "old", oldAllLines),
        new: buildSideTokenMap(hunks, "new", newAllLines),
      });
    }).catch(() => {
      if (!cancelled) setTokens(null);
    });

    return () => {
      cancelled = true;
    };
  }, [hunks, path, dark, worktree, base, head]);

  return tokens;
}
