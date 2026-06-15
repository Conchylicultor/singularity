import type { BlockHandle, SerializedBlock } from "../core";

/**
 * Markdown ⇄ blocks, driven entirely by block-type metadata from the
 * `Editor.Block` registry (`markdownPrefixes`, `marker`, `toggle`) — never by
 * naming a specific block type. Adding a new block type with a `markdownPrefix`
 * extends paste/copy automatically.
 *
 * Used for clipboard interop: pasting external markdown (bullets, task lists,
 * fenced code, indentation→nesting) becomes a `SerializedBlock[]`; copying
 * blocks emits markdown as the `text/plain` representation.
 */

type Handle = BlockHandle<unknown>;

function asRecord(data: unknown): Record<string, unknown> {
  return data && typeof data === "object" ? (data as Record<string, unknown>) : {};
}

function fenceHandle(handles: Handle[]): Handle | undefined {
  return handles.find((h) =>
    (h.markdownPrefixes ?? []).some((p) => p.startsWith("```")),
  );
}

function toggleHandle(handles: Handle[]): Handle | undefined {
  return handles.find((h) => h.toggle);
}

function orderedHandle(handles: Handle[]): Handle | undefined {
  return handles.find((h) => h.ordinalMarker);
}

function defaultTextHandle(handles: Handle[]): Handle | undefined {
  // The plain-text type: editable text, no markdown prefix, marker, toggle, or
  // forced chevron. Falls back to the first labelled type.
  return (
    handles.find(
      (h) =>
        !h.markdownPrefixes?.length &&
        !h.toggle &&
        !h.collapsible &&
        !h.marker &&
        !h.ordinalMarker &&
        h.label !== undefined,
    ) ?? handles.find((h) => h.label !== undefined)
  );
}

/** Generic leading-prefix rules (bullets, toggle `> `, …) — excludes fences and
 *  bracket prefixes, which are handled by the fence/checkbox passes. */
function prefixRules(
  handles: Handle[],
): { prefix: string; handle: Handle }[] {
  const out: { prefix: string; handle: Handle }[] = [];
  for (const h of handles) {
    // The ordinal handle's `1. ` prefix is a live-shortcut-only marker; markdown
    // paste of ordered lists is covered by the dedicated ORDERED pass, so skip it
    // here to avoid a duplicate paste rule.
    if (h.ordinalMarker) continue;
    for (const prefix of h.markdownPrefixes ?? []) {
      if (prefix.startsWith("```") || prefix.startsWith("[")) continue;
      out.push({ prefix, handle: h });
    }
  }
  return out.sort((a, b) => b.prefix.length - a.prefix.length);
}

type FlatToken = { indent: number; type: string; data: unknown };

const CHECKBOX = /^[-*+]?\s*\[([ xX])\]\s+(.*)$/;
const ORDERED = /^\d+[.)]\s+(.*)$/;

export function markdownToForest(
  text: string,
  handles: Handle[],
): SerializedBlock[] {
  const fence = fenceHandle(handles);
  const toggle = toggleHandle(handles);
  const ordered = orderedHandle(handles);
  const fallback = defaultTextHandle(handles);
  const rules = prefixRules(handles);

  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const tokens: FlatToken[] = [];

  let i = 0;
  while (i < lines.length) {
    const raw = lines[i]!;
    if (raw.trim() === "") {
      i++;
      continue;
    }
    const ws = /^(\s*)/.exec(raw)![1]!;
    const indent = ws.replace(/\t/g, "  ").length;
    const content = raw.slice(ws.length);

    // Fenced code block: capture language from the info string, accumulate until
    // the closing fence.
    if (fence && content.startsWith("```")) {
      const lang = content.slice(3).trim();
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.trim().startsWith("```")) {
        code.push(lines[i]!);
        i++;
      }
      if (i < lines.length) i++; // consume closing fence
      tokens.push({
        indent,
        type: fence.type,
        data: {
          ...(fence.empty?.() ?? {}),
          code: code.join("\n"),
          ...(lang ? { language: lang } : {}),
        },
      });
      continue;
    }

    // Task-list checkbox (`- [ ] `, `[x] `, …) → the toggle-capable type.
    const checkbox = toggle ? CHECKBOX.exec(content) : null;
    if (toggle && checkbox) {
      const checked = checkbox[1]!.toLowerCase() === "x";
      const field = toggle.toggle!.field;
      tokens.push({
        indent,
        type: toggle.type,
        data: { ...(toggle.empty?.() ?? {}), text: checkbox[2]!, [field]: checked },
      });
      i++;
      continue;
    }

    // Ordered-list line (`1.`, `2)`, `10.`, …) → the ordinal-marker type. The
    // literal number is discarded; numbering is positional, derived at render.
    const orderedMatch = ordered ? ORDERED.exec(content) : null;
    if (ordered && orderedMatch) {
      tokens.push({
        indent,
        type: ordered.type,
        data: { ...(ordered.empty?.() ?? {}), text: orderedMatch[1]! },
      });
      i++;
      continue;
    }

    // Generic leading-prefix rule (bullets, toggle, …).
    const rule = rules.find((r) => content.startsWith(r.prefix));
    if (rule) {
      tokens.push({
        indent,
        type: rule.handle.type,
        data: {
          ...(rule.handle.empty?.() ?? {}),
          text: content.slice(rule.prefix.length),
        },
      });
      i++;
      continue;
    }

    // Plain paragraph → default text type.
    if (fallback) {
      tokens.push({
        indent,
        type: fallback.type,
        data: { ...(fallback.empty?.() ?? {}), text: content },
      });
    }
    i++;
  }

  return tokensToTree(tokens);
}

function tokensToTree(tokens: FlatToken[]): SerializedBlock[] {
  const roots: SerializedBlock[] = [];
  const stack: { indent: number; node: SerializedBlock }[] = [];
  for (const tok of tokens) {
    const node: SerializedBlock = {
      type: tok.type,
      data: tok.data,
      expanded: true,
      children: [],
    };
    while (stack.length && stack[stack.length - 1]!.indent >= tok.indent) {
      stack.pop();
    }
    if (stack.length) stack[stack.length - 1]!.node.children.push(node);
    else roots.push(node);
    stack.push({ indent: tok.indent, node });
  }
  return roots;
}

export function blocksToMarkdown(
  forest: SerializedBlock[],
  handles: Handle[],
): string {
  const byType = new Map(handles.map((h) => [h.type, h] as const));

  const lineFor = (node: SerializedBlock, ordinal: number): string => {
    const h = byType.get(node.type);
    const d = asRecord(node.data);
    if (h && (h.markdownPrefixes ?? []).some((p) => p.startsWith("```"))) {
      const lang = typeof d.language === "string" ? d.language : "";
      const code = typeof d.code === "string" ? d.code : "";
      return "```" + lang + "\n" + code + "\n```";
    }
    const text =
      typeof d.text === "string"
        ? d.text
        : typeof d.code === "string"
          ? d.code
          : "";
    if (h?.toggle) {
      const checked = Boolean(d[h.toggle.field]);
      return `- [${checked ? "x" : " "}] ${text}`;
    }
    // Ordered list: emit the real sequential number for this item's position in
    // its consecutive same-type run (computed in `walk`).
    if (h?.ordinalMarker) return `${h.ordinalMarker(ordinal)} ${text}`;
    const prefix = h?.markdownPrefixes?.[0];
    if (prefix && !prefix.startsWith("[")) return prefix + text;
    return text;
  };

  const out: string[] = [];
  const walk = (nodes: SerializedBlock[], depth: number): void => {
    // Per-sibling-list ordinal: 1-based position within the consecutive run of
    // same-type siblings, reset on type change. Each recursive child list starts
    // its own fresh counter (matches flattenTree's render-time numbering).
    let ordinal = 0;
    let prevType: string | null = null;
    for (const n of nodes) {
      ordinal = n.type === prevType ? ordinal + 1 : 1;
      prevType = n.type;
      const indent = "  ".repeat(depth);
      out.push(
        lineFor(n, ordinal)
          .split("\n")
          .map((l) => indent + l)
          .join("\n"),
      );
      walk(n.children, depth + 1);
    }
  };
  walk(forest, 0);
  return out.join("\n");
}
