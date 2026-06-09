import { useEffect, useState } from "react";
import type { ShikiTransformer } from "shiki";
import { ContentScope } from "@plugins/primitives/plugins/select-scope/web";
import {
  getHighlighter,
  languageForPath,
  SHIKI_LANGS,
  themeForMode,
  useDarkMode,
} from "@plugins/primitives/plugins/syntax-highlight/web";

function parseCatN(content: string): { startLine: number; lines: string[] } {
  if (!content) return { startLine: 1, lines: [] };
  const raw = content.endsWith("\n") ? content.slice(0, -1) : content;
  const rows = raw.split("\n");
  const lines: string[] = [];
  let startLine = 1;
  let first = true;

  for (const row of rows) {
    const tab = row.indexOf("\t");
    if (tab < 0) {
      lines.push(row);
      continue;
    }
    const num = parseInt(row.slice(0, tab), 10);
    const text = row.slice(tab + 1);
    if (first && !isNaN(num)) {
      startLine = num;
      first = false;
    }
    lines.push(text);
  }

  return { startLine, lines };
}

function makeLineNumberTransformer(startLine: number): ShikiTransformer {
  return {
    line(node, lineIdx) {
      const displayNum = startLine + lineIdx - 1;
      node.children.unshift({
        type: "element",
        tagName: "span",
        properties: { class: "ln" },
        children: [{ type: "text", value: String(displayNum) }],
      });
    },
  };
}

export function CodeWithLineNumbers({
  content,
  filePath,
}: {
  content: string;
  filePath: string;
}) {
  const { startLine, lines } = parseCatN(content);
  const code = lines.join("\n");
  const dark = useDarkMode();
  const [html, setHtml] = useState<string | null>(null);

  const lang = languageForPath(filePath);
  const resolvedLang = SHIKI_LANGS.includes(lang) ? lang : "text";

  useEffect(() => {
    if (!code) {
      setHtml(null);
      return;
    }
    let cancelled = false;
    const theme = themeForMode(dark);

    getHighlighter(resolvedLang)
      .then((hl) => {
        if (cancelled) return;
        const out = hl.codeToHtml(code, {
          lang: resolvedLang,
          theme,
          transformers: [makeLineNumberTransformer(startLine)],
        });
        setHtml(out);
      })
      .catch(() => {
        if (!cancelled) setHtml(null);
      });

    return () => {
      cancelled = true;
    };
  }, [code, resolvedLang, dark, startLine]);

  if (!code) {
    return (
      <p className="py-1 text-xs italic text-muted-foreground">
        (empty result)
      </p>
    );
  }

  if (html === null) {
    return (
      <ContentScope>
        <pre className="max-h-[280px] overflow-auto rounded bg-muted p-3 font-mono text-xs leading-5">
          <code>{code}</code>
        </pre>
      </ContentScope>
    );
  }

  return (
    <ContentScope>
      <div
        className="max-h-[280px] overflow-auto [&>pre]:m-0 [&>pre]:overflow-auto [&>pre]:rounded [&>pre]:bg-muted [&>pre]:p-3 [&>pre]:font-mono [&>pre]:text-xs [&>pre]:leading-5 [&_.ln]:mr-4 [&_.ln]:inline-block [&_.ln]:w-7 [&_.ln]:select-none [&_.ln]:text-right [&_.ln]:text-muted-foreground/50 [&_.ln]:tabular-nums"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </ContentScope>
  );
}
