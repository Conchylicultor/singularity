import { useMemo } from "react";
import type { ComponentType } from "react";
import { ActiveData } from "../slots";
import type { ActiveDataBlockContribution } from "../slots";

export type ActiveDataSegment =
  | { type: "markdown"; text: string }
  | {
      type: "block";
      component: ComponentType<{ content: string; attrs: Record<string, string> }>;
      content: string;
      attrs: Record<string, string>;
    };

function parseAttrs(attrStr: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /(\w[\w-]*)(?:=(?:"([^"]*)"|'([^']*)'|(\S+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrStr)) !== null) {
    attrs[m[1]!] = m[2] ?? m[3] ?? m[4] ?? "";
  }
  return attrs;
}

function buildSegments(
  rawText: string,
  blockContribs: ActiveDataBlockContribution[],
): ActiveDataSegment[] {
  if (blockContribs.length === 0) {
    return rawText ? [{ type: "markdown", text: rawText }] : [];
  }

  const escaped = blockContribs
    .map((c) => c.tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const re = new RegExp(`<(${escaped})(\\s[^>]*)?>([\\s\\S]*?)<\\/\\1>`, "g");

  const segments: ActiveDataSegment[] = [];
  let cursor = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(rawText)) !== null) {
    if (m.index > cursor) {
      const text = rawText.slice(cursor, m.index);
      if (text.trim()) segments.push({ type: "markdown", text });
    }

    const tag = m[1]!;
    const attrStr = (m[2] ?? "").trim();
    const content = m[3]!.trim();
    const attrs = attrStr ? parseAttrs(attrStr) : {};
    const contrib = blockContribs.find((c) => c.tag === tag)!;

    segments.push({ type: "block", component: contrib.component, content, attrs });
    cursor = m.index + m[0].length;
  }

  if (cursor < rawText.length) {
    const text = rawText.slice(cursor);
    if (text.trim()) segments.push({ type: "markdown", text });
  }

  return segments;
}

export function useActiveDataSegments(rawText: string): ActiveDataSegment[] {
  const contributions = ActiveData.Tag.useContributions();
  const blockContribs = useMemo(
    () => contributions.filter((c): c is ActiveDataBlockContribution => c.display === "block"),
    [contributions],
  );
  return useMemo(() => buildSegments(rawText, blockContribs), [rawText, blockContribs]);
}
