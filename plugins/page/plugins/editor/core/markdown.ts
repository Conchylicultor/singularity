// Markdown ⇄ block-forest, orchestrated generically from per-block-type metadata.
//
// This is the PURE central orchestrator: it never names a specific block type.
// Each block type owns how it maps to/from markdown, either explicitly (a
// `markdown` declaration on its `defineBlock` handle) or by derivation from its
// text lens + `markdownPrefixes`. Adding a block type extends clipboard markdown
// automatically. Parameterized on `handles: BlockHandle[]` (not a slot import) so
// it stays a leaf both runtimes can call — the web `Editor.Block` contributions
// and any future server-side markdown import/export.
//
// Used for clipboard interop: pasting external markdown (bullets, task lists,
// fenced code, indentation→nesting) becomes a `SerializedBlock[]`; copying blocks
// emits markdown as the `text/plain` representation.
//
// Pure module (no React, no DB): unit-tested directly in `markdown.test.ts`.

import { plainOf, runsOf, type RichText } from "./rich-text";
import type { BlockHandle } from "./define-block";
import type { SerializedBlock } from "./serialized-block";

// ---------------------------------------------------------------------------
// Per-type markdown contract (typed against each block's own inferred data)
// ---------------------------------------------------------------------------

export interface MdSerializeCtx {
  /**
   * Flatten runs (or a legacy string) to plain text. Marks are dropped today; a
   * future `ctx.md(runs)` adds `**`/`_`/`` ` ``/`[]()` rendering WITHOUT changing
   * per-type signatures.
   */
  plain(text: RichText | string): string;
  /** 1-based position within this block's consecutive same-type sibling run. */
  ordinal: number;
}

export interface MdParseCtx {
  /** Wrap plain inline text as runs (future: parse inline marks → runs). */
  runs(text: string): RichText;
}

export interface BlockMarkdown<T> {
  /**
   * Emit this block as markdown line(s), with NO indentation — the central walk
   * indents (including splitting multi-line output). Default for text-bearing
   * types: `outputPrefix + ctx.plain(text)`.
   */
  serialize?(data: T, ctx: MdSerializeCtx): string;
  /**
   * Claim one line → this type's data payload, or `null` to decline. Default for
   * text-bearing types: a `markdownPrefixes` match → `{ ...empty(), text: runs }`.
   */
  parseLine?(line: string, ctx: MdParseCtx): T | null;
  /** Fenced multi-line: the walk accumulates open→close, then calls `parseFenced`. */
  fence?: {
    open: string;
    close: string;
    parseFenced(info: string, body: string, ctx: MdParseCtx): T;
  };
  /**
   * `parseLine` dispatch order (desc) — only to disambiguate overlapping prefixes
   * (e.g. to-do beats bulleted-list for `- [ ] x`). Default 0; ties keep
   * registration order.
   */
  precedence?: number;
}

type Handle = BlockHandle<unknown>;

const PARSE_CTX: MdParseCtx = { runs: runsOf };

// ---------------------------------------------------------------------------
// Default-text handle
// ---------------------------------------------------------------------------

/**
 * THE plain-paragraph block type, selected by its own `defaultText` declaration
 * — never inferred from the absence of other traits. Undefined only when the
 * composition ships no such block type at all; every caller treats that as
 * "nothing to create" rather than substituting an arbitrary type.
 */
export function defaultTextHandle(handles: Handle[]): Handle | undefined {
  return handles.find((h) => h.defaultText);
}

// ---------------------------------------------------------------------------
// Generic resolution (derives serialize/parse from the lens + prefixes)
// ---------------------------------------------------------------------------

/** First `markdownPrefixes` entry not starting with a backtick or `[`, else "". */
function outputPrefix(h: Handle): string {
  return (
    (h.markdownPrefixes ?? []).find(
      (p) => !p.startsWith("`") && !p.startsWith("["),
    ) ?? ""
  );
}

/** Derived parse prefixes for a text-bearing handle: fences and `[`-prefixes are
 *  excluded (owned by fence / explicit-parseLine passes), sorted longest-first. */
function derivedParsePrefixes(h: Handle): string[] {
  return (h.markdownPrefixes ?? [])
    .filter((p) => !p.startsWith("`") && !p.startsWith("["))
    .sort((a, b) => b.length - a.length);
}

function serializerFor(h: Handle): (data: unknown, ctx: MdSerializeCtx) => string {
  if (h.markdown?.serialize) return h.markdown.serialize;
  const lens = h.text;
  if (lens) {
    const prefix = outputPrefix(h);
    return (data, ctx) => prefix + ctx.plain(lens(data));
  }
  // Void type: no text and no explicit serializer — a blank line (the current
  // lossy-external behavior, preserved).
  return () => "";
}

function parserFor(h: Handle): (line: string, ctx: MdParseCtx) => unknown | null {
  if (h.markdown?.parseLine) return h.markdown.parseLine;
  const lens = h.text;
  if (lens) {
    const prefixes = derivedParsePrefixes(h);
    if (prefixes.length === 0) return () => null;
    const empty = h.empty;
    return (line, ctx) => {
      const prefix = prefixes.find((p) => line.startsWith(p));
      if (prefix === undefined) return null;
      return { ...(empty?.() ?? {}), text: ctx.runs(line.slice(prefix.length)) };
    };
  }
  return () => null;
}

// ---------------------------------------------------------------------------
// Parse: markdown text → forest
// ---------------------------------------------------------------------------

type FlatToken = { indent: number; type: string; data: unknown };

export function parseMarkdownToForest(
  text: string,
  handles: Handle[],
): SerializedBlock[] {
  const fallback = defaultTextHandle(handles);
  // Non-default handles paired with their resolved parser, ordered by precedence
  // desc — stable sort keeps registration order for ties. The default-text
  // handle is the fallback, never a claiming parser.
  const claimers = handles
    .filter((h) => !h.defaultText)
    .map((h) => ({ handle: h, precedence: h.markdown?.precedence ?? 0, parse: parserFor(h) }))
    .sort((a, b) => b.precedence - a.precedence);
  const fenceHandles = handles.filter((h) => h.markdown?.fence);

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

    // Fenced multi-line (code): capture the info string, accumulate until the
    // closing fence, then hand the body to the type's `parseFenced`.
    const fenceH = fenceHandles.find((h) => content.startsWith(h.markdown!.fence!.open));
    if (fenceH) {
      const fence = fenceH.markdown!.fence!;
      const info = content.slice(fence.open.length).trim();
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.trim().startsWith(fence.close)) {
        body.push(lines[i]!);
        i++;
      }
      if (i < lines.length) i++; // consume closing fence
      tokens.push({
        indent,
        type: fenceH.type,
        data: fence.parseFenced(info, body.join("\n"), PARSE_CTX),
      });
      continue;
    }

    // Non-default claiming handles, precedence desc, first non-null wins.
    let claimed = false;
    for (const c of claimers) {
      const data = c.parse(content, PARSE_CTX);
      if (data !== null) {
        tokens.push({ indent, type: c.handle.type, data });
        claimed = true;
        break;
      }
    }
    if (claimed) {
      i++;
      continue;
    }

    // Plain paragraph → default text type.
    if (fallback) {
      tokens.push({
        indent,
        type: fallback.type,
        data: { ...(fallback.empty?.() ?? {}), text: PARSE_CTX.runs(content) },
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

// ---------------------------------------------------------------------------
// Serialize: forest → markdown text
// ---------------------------------------------------------------------------

export function serializeForestToMarkdown(
  forest: SerializedBlock[],
  handles: Handle[],
): string {
  const byType = new Map(handles.map((h) => [h.type, h] as const));
  const out: string[] = [];
  const walk = (nodes: SerializedBlock[], depth: number): void => {
    // Per-sibling-list ordinal: 1-based position within the consecutive run of
    // same-type siblings, reset on type change. Each recursive child list starts
    // its own fresh counter (matches render-time numbering).
    let ordinal = 0;
    let prevType: string | null = null;
    for (const n of nodes) {
      ordinal = n.type === prevType ? ordinal + 1 : 1;
      prevType = n.type;
      const h = byType.get(n.type);
      const line = h ? serializerFor(h)(n.data, { plain: plainOf, ordinal }) : "";
      const indent = "  ".repeat(depth);
      out.push(
        line
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
