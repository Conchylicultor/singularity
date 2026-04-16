import { useEffect, useState } from "react";
import type { HunkData } from "react-diff-view";
import type { BundledLanguage, ThemedToken } from "shiki";
import { getHighlighter, themeForMode } from "../../../web/highlighter";
import { languageForPath, SHIKI_LANGS } from "../../../web/lang";

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

function buildSideText(
  hunks: HunkData[],
  side: "old" | "new",
): string {
  const lines = new Map<number, string>();
  let maxLine = 0;
  for (const hunk of hunks) {
    for (const change of hunk.changes) {
      let lineNumber: number | undefined;
      if (change.type === "normal") {
        lineNumber =
          side === "old" ? change.oldLineNumber : change.newLineNumber;
      } else if (change.type === "delete" && side === "old") {
        lineNumber = change.lineNumber;
      } else if (change.type === "insert" && side === "new") {
        lineNumber = change.lineNumber;
      }
      if (lineNumber !== undefined) {
        lines.set(lineNumber, change.content);
        if (lineNumber > maxLine) maxLine = lineNumber;
      }
    }
  }
  const out: string[] = [];
  for (let i = 1; i <= maxLine; i++) {
    out.push(lines.get(i) ?? "");
  }
  return out.join("\n");
}

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

export function useDiffTokens(
  hunks: HunkData[] | null,
  path: string,
  dark: boolean,
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
    const oldText = buildSideText(hunks, "old");
    const newText = buildSideText(hunks, "new");

    getHighlighter()
      .then((hl) => {
        if (cancelled) return;
        const oldLines = hl.codeToTokensBase(oldText, { lang, theme });
        const newLines = hl.codeToTokensBase(newText, { lang, theme });
        setTokens({
          old: themedToTokens(oldLines),
          new: themedToTokens(newLines),
        });
      })
      .catch(() => {
        if (!cancelled) setTokens(null);
      });

    return () => {
      cancelled = true;
    };
  }, [hunks, path, dark]);

  return tokens;
}
