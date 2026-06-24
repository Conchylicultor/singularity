import { useMemo } from "react";
import type { ShikiTransformer } from "shiki";
import { ContentScope } from "@plugins/primitives/plugins/select-scope/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import {
  languageForPath,
  SHIKI_LANGS,
  useDarkMode,
  useHighlightedHtml,
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

  const lang = languageForPath(filePath);
  const resolvedLang = SHIKI_LANGS.includes(lang) ? lang : "text";

  // Stable across renders for a given startLine so the shared highlight effect
  // doesn't re-run on unrelated parent re-renders.
  const transformers = useMemo<ShikiTransformer[]>(
    () => [makeLineNumberTransformer(startLine)],
    [startLine],
  );
  const { html } = useHighlightedHtml(code, resolvedLang, { dark, transformers });

  if (!code) {
    return (
      <Text as="p" variant="caption" className="py-xs italic text-muted-foreground">
        (empty result)
      </Text>
    );
  }

  if (html === null) {
    return (
      <ContentScope>
        <Scroll as="pre" axis="both" className="max-h-[280px] rounded-md bg-muted p-md font-mono text-caption">
          <code>{code}</code>
        </Scroll>
      </ContentScope>
    );
  }

  return (
    <ContentScope>
      <Scroll
        axis="both"
        // eslint-disable-next-line spacing/no-adhoc-spacing, layout/no-adhoc-layout -- `[&_.ln]:mr-4` is a Shiki-injected line-number gutter margin and `[&>pre]:overflow-auto` a child-pre clip, both targeted via arbitrary variant on dangerouslySetInnerHTML output; not expressible through Stack/Inset/Scroll on the child
        className="max-h-[280px] [&>pre]:m-0 [&>pre]:overflow-auto [&>pre]:rounded-md [&>pre]:bg-muted [&>pre]:p-md [&>pre]:font-mono [&>pre]:text-caption [&_.ln]:mr-4 [&_.ln]:inline-block [&_.ln]:w-7 [&_.ln]:select-none [&_.ln]:text-right [&_.ln]:text-muted-foreground/50 [&_.ln]:tabular-nums"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </ContentScope>
  );
}
