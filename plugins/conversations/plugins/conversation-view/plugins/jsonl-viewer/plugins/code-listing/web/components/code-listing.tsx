import { CodeListing } from "@plugins/primitives/plugins/syntax-highlight/web";

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

/**
 * Renders `cat -n`-formatted tool output (`<number>\t<text>` per line) with
 * syntax highlighting and a line-number gutter. The only place that parses the
 * `cat -n` format — actual code goes straight to syntax-highlight's
 * `CodeListing`.
 */
export function CatNListing({
  content,
  filePath,
}: {
  content: string;
  filePath: string;
}) {
  const { startLine, lines } = parseCatN(content);
  return (
    <CodeListing
      code={lines.join("\n")}
      startLine={startLine}
      path={filePath}
      emptyText="(empty result)"
    />
  );
}
