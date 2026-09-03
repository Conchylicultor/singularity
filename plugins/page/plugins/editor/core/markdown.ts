// Markdown ⇄ block-forest, orchestrated generically from per-block-type metadata.
//
// This is the PURE central orchestrator: it never names a specific block type.
// Each block type owns how it maps to/from markdown, either explicitly (a
// `markdown` declaration on its `defineBlock` handle) or by derivation from its
// text lens + `markdownPrefixes`. Adding a block type extends clipboard markdown
// automatically. Parameterized on a `MarkdownContext` (not a slot import) so it
// stays a leaf both runtimes can call — the web `Editor.Block` contributions and
// any future server-side markdown import/export.
//
// Used for clipboard interop: pasting external markdown (bullets, task lists,
// fenced code, indentation→nesting) becomes a `SerializedBlock[]`; copying blocks
// emits markdown as the `text/plain` representation.
//
// Pure module (no React, no DB): unit-tested directly in `markdown.test.ts`.

import { plainOf, runsOf, type RichText } from "./rich-text";
import {
  parseInlineMarkdown,
  serializeInlineMarkdown,
} from "./inline-markdown";
import type { BlockHandle } from "./define-block";
import type { SerializedBlock } from "./serialized-block";

// ---------------------------------------------------------------------------
// The conversion context
// ---------------------------------------------------------------------------

/**
 * Everything the conversion needs that is NOT a block's own business.
 *
 * `protectedSpans` is REQUIRED, not optional, and that is the whole point: the
 * inline decorator tokens (`[[page:…]]`, `[[date:…]]`, `\(latex\)`) live as
 * plain substrings inside `TextRun.text`, so a marks-aware scan that does not
 * know about them corrupts inline LaTeX — which is full of `_` and `*`. An
 * optional parameter is one a caller can silently forget; a required one makes
 * "I have no tokens" an explicit `[]`.
 *
 * `blankLines` is required for the same shape of reason, over a different
 * asymmetry: a blank line means an empty paragraph in the markdown this codebase
 * EMITS and a paragraph separator in the markdown a user PASTES, and nothing
 * about the text tells the two apart — only the caller knows which document it
 * is holding. A default would silently pick one, and both wrong answers are
 * documents nobody wrote: an empty paragraph sprayed between every two
 * paragraphs of a pasted README, or every spacer dropped out of our own round
 * trip.
 */
export interface MarkdownContext {
  handles: BlockHandle<unknown>[];
  /** Spans that must survive verbatim: no delimiter may open or close inside one. */
  protectedSpans: RegExp[];
  /**
   * `"empty-block"` — a blank line is an empty block of the default-text type,
   * landing as the previous sibling of the block that follows it.
   * `"separator"` — blank lines are skipped, which is correct CommonMark and
   * the lenient half of the paste contract.
   *
   * Read on PARSE only: there is one emitted form for everybody, so the
   * serializer never asks.
   */
  blankLines: "empty-block" | "separator";
  /**
   * How an empty block is EMITTED when a blank line cannot state its position.
   *
   * `"blank-line"` — always a blank line. Honest for a HUMAN reading the text
   * (a paste into another app must never grow a tag), and lossy in exactly the
   * three places the parser's own blank-line rules cannot reach: a blank line
   * carries no indentation of its own, so it lands at the depth of the block
   * that follows it and a leading or trailing blank run is dropped outright.
   * `"pinned"` — those three positions (a node with children, the first of its
   * sibling list, the last of it) emit the handle's TAG form instead, so the
   * round trip is exact. A handle whose type maps to no tag keeps the blank
   * line and keeps the loss: the pin never invents a spelling.
   *
   * Required for the same reason `blankLines` is, over the other direction of
   * the same asymmetry: only the caller knows whether the document it is about
   * to produce will be read back by this codebase (where exactness is the whole
   * contract) or by a person in another app (where a tag is noise).
   */
  emptyBlocks: "pinned" | "blank-line";
}

/**
 * The node shape the SERIALIZE walk reads. Deliberately wider than
 * `SerializedBlock`: a `<page id="…"/>` tag cannot be produced from an id-less
 * node, because a sub-page's identity IS its row id. `IdentifiedBlock` satisfies
 * this exactly; `SerializedBlock` satisfies it with `id: undefined`, and a type
 * whose tag needs the id fails LOUDLY rather than emitting an id-less tag.
 */
export interface MarkdownNode {
  type: string;
  data?: unknown;
  expanded: boolean;
  /** Row id, when the caller has one. Reaches a type's `tag.attrs` as `ctx.id`. */
  id?: string;
  /**
   * Values for this node's tag's {@link BlockTag.annotated} attributes — facts
   * about the row that live OUTSIDE its `data`, supplied by whoever ran the walk
   * (see there).
   *
   * Same optionality story as {@link MarkdownNode.id}: a forest carrying none is
   * the CLIPBOARD, and it must still serialize. A name the tag never declared is
   * a loud failure at serialize, never a silent drop.
   */
  annotations?: Readonly<Record<string, string>>;
  children: MarkdownNode[];
}

// ---------------------------------------------------------------------------
// Per-type markdown contract (typed against each block's own inferred data)
// ---------------------------------------------------------------------------

export interface MdSerializeCtx {
  /**
   * Render runs (or a legacy string) as inline markdown: marks as delimiters,
   * links, colors, underline, with literal delimiter characters escaped. THE
   * default renderer for a block's text — `serializeInlineMarkdown` under the
   * hood, bound to the context's `protectedSpans`.
   */
  md(text: RichText | string): string;
  /**
   * Flatten runs (or a legacy string) to plain text, dropping marks and escaping
   * nothing. The raw escape hatch, for a block type whose syntax is not inline
   * markdown at all (a fenced body, a LaTeX expression).
   */
  plain(text: RichText | string): string;
  /** 1-based position within this block's consecutive same-type sibling run. */
  ordinal: number;
  /**
   * The node's row id, when the walk's input carried one (`MarkdownNode.id`).
   * Undefined for an id-less `SerializedBlock` forest, and the two tag kinds
   * that read it answer that differently ON PURPOSE: a tag that NEEDS the id
   * (`page`) throws rather than emitting an identity-less pointer, while an
   * {@link BlockTag.identified} tag simply omits the attribute — see there.
   */
  id?: string;
  /**
   * The node's externally-owned attribute values, when the walk's input carried
   * them ({@link MarkdownNode.annotations}). Only names the tag declared in
   * {@link BlockTag.annotated} may appear here — one it did not is a loud
   * failure, because an attribute the tag does not reserve comes back on parse
   * as a `data` key.
   */
  annotations?: Readonly<Record<string, string>>;
}

export interface MdParseCtx {
  /** Parse inline markdown (marks, links, colors) into canonical runs. */
  runs(text: string): RichText;
}

/**
 * What lives between a tag's `<open>` and `</close>`.
 *
 * - `"children"` — the block's children, indented one level (containers). The
 *   walk must NOT re-emit them afterwards.
 * - `"children-when-expanded"` — children only when `node.expanded`; collapsed
 *   emits the self-closing form. Declared, never derived from
 *   `handle.collapsible === "always"`: that flag's set includes `toggle`, which
 *   must keep emitting its children folded (markdown ignores the fold — see the
 *   editor's CLAUDE.md). Every OTHER body mode ignores `expanded` entirely.
 * - `"text"` — the block's own text, from its text lens, inside the tag. For a
 *   text-bearing type whose canonical prefix is taken (`quote`, whose `> ` the
 *   `toggle` owns) or which has none at all (`prompt`), so it cannot round-trip
 *   as a bare paragraph. Children still nest by indentation, as for any text
 *   block.
 * - `"none"` — always self-closing. A body on PARSE is a loud rejection, never a
 *   silent drop.
 */
export type BlockTagBody =
  "children" | "children-when-expanded" | "text" | "none";

/**
 * A tag-delimited markdown region for one block type: `<name attrs>…</name>`.
 *
 * This is what makes markdown coverage TOTAL. `parseLine` is single-line and a
 * `fence` body is an opaque string, so neither can produce CHILDREN; and a type
 * with neither a text lens nor an explicit `serialize` used to emit a BLANK LINE
 * — nine types (callout, page, page-link, image, video, audio, file, embed,
 * bookmark) silently deleted on every round trip. The tag is now that fallback,
 * and every field below has a DEFAULT derived from the schema, so a block type
 * is covered the day it is defined rather than the day someone remembers
 * markdown.
 */
export interface BlockTag<T> {
  /** Tag name. Defaults to the handle's `type`. */
  name?: string;
  /**
   * Attributes for the open tag. Defaults to the derived projection: every
   * STRING field of `data` becomes a plain attribute and everything else
   * (numbers, booleans, `null`, objects, arrays) is JSON-encoded into a single
   * `data` attribute.
   *
   * Only strings are plain attributes because an attribute value is a string
   * both ways: emitting `width="640"` would read back as the string `"640"`,
   * indistinguishable from a genuinely-string field, so the projection would be
   * lossy exactly where it claims not to be. Declare `attrs` (with a matching
   * `parseAttrs`) to get a prettier form for a specific type.
   */
  attrs?(
    data: T,
    ctx: MdSerializeCtx,
  ): Record<string, string | number | boolean | null | undefined>;
  /**
   * Rebuild this type's data from the parsed attributes. Defaults to the inverse
   * of the derived projection, finished with the handle's own `schema.parse`, so
   * malformed attributes are a LOUD zod error rather than a row the write
   * boundary 400s on later. For `body: "text"` the text comes from the BODY and
   * overwrites whatever this returns for `text`.
   */
  parseAttrs?(attrs: Record<string, string>, ctx: MdParseCtx): T;
  /** Defaults to `"children"` — which is also what the derived void fallback uses. */
  body?: BlockTagBody;
  /**
   * This tag carries its row id as the reserved `id` attribute, in BOTH
   * directions: serialize emits `ctx.id` as the FIRST attribute, and parse lifts
   * it back OFF the attribute record onto `SerializedBlock.ref` — never into
   * `data`. That is what "reserved" means, and why `resolveTag` refuses a handle
   * that declares this alongside an `id` field of its own: the derived
   * projection would emit `data.id` under the same name and the two meanings
   * would fight.
   *
   * What it buys is an ADDRESSABLE region. A reader of the emitted markdown
   * (a human, or an agent through `read_page`) gets an anchor it can hand back
   * in an edit, and the applier resolves that anchor to the row it names
   * instead of inferring identity from content similarity.
   *
   * **An id-less forest omits the attribute and is not an error.** That is the
   * deliberate difference from `page`, whose own `attrs` throws without an id: a
   * sub-page's identity IS its row, so an id-less `<page/>` would point at
   * nothing, whereas an id-less `<agent-note>` is the ordinary clipboard case
   * (copying a card out of a page must stay portable markdown) and also what a
   * document says when it wants a card MINTED.
   */
  identified?: true;
  /**
   * Attribute names this tag carries whose values are supplied from OUTSIDE the
   * block's `data`, reserved in BOTH directions. It is the generalization of
   * {@link identified}, whose reserved `id` is the one such name the walk itself
   * can produce.
   *
   * The fact it exists for: some things a reader of a block needs to know are
   * not the block's to store. A TODO card's linked task, and that task's status,
   * live in another table keyed by the block id — so neither the derived
   * attribute projection (which reads `data`) nor a declared `attrs(data, ctx)`
   * can produce them, and putting them in `data` would make the block's own row
   * a second, drifting copy of somebody else's record. They are handed to the
   * SERIALIZE walk instead ({@link MarkdownNode.annotations} →
   * {@link MdSerializeCtx.annotations}) and emitted here, after the reserved
   * `id` and before the type's own attrs.
   *
   * **These attributes are READ-ONLY, and parse DISCARDS them.** The parser is
   * pure: it can neither tell a value an agent edited from the one it emitted a
   * minute ago, nor write the table that owns it. So an agent that edits
   * `status="done"` in a document has that edit ignored — stated by the tool
   * that hands out the document, never silently absorbed. What parse must still
   * do is take the names OFF the attribute record before the handle's schema
   * sees them; see `claimTag`.
   *
   * **An absent value omits the attribute** rather than emitting an empty one —
   * the same rule {@link identified} follows for an id-less forest, and for the
   * same reason: a TODO nobody has dispatched simply has no task, and a forest
   * on the clipboard has no annotations at all.
   */
  annotated?: readonly string[];
  /**
   * This tag is emitted but never CLAIMED on parse: another handle owns the name
   * on the parse side. The one case is `page` — minting a sub-page means minting
   * a `page_id` partition and restamping a subtree, which only the server's
   * turn-into-page op does, so `<page id="x"/>` parses as a `page-link`.
   * Two handles claiming one name where neither declares this is a loud error.
   */
  serializeOnly?: true;
}

export interface BlockMarkdown<T> {
  /**
   * Emit this block as markdown line(s), with NO indentation — the central walk
   * indents (including splitting multi-line output). Default for text-bearing
   * types: `outputPrefix + ctx.md(text)`.
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
  /**
   * Tag-delimited region — the ONLY mapping that can carry children, and the
   * default for a type with neither a text lens nor a `serialize`. Declaring it
   * beside a `serialize` makes it PARSE-only for that type: `serialize` wins on
   * the way out, which is how `page/text` emits a BLANK LINE for an empty
   * paragraph while `<text/>` keeps parsing back into one — the spelling every
   * document written before the blank-line dialect uses, and the way to write an
   * empty block whose position that dialect cannot express.
   */
  tag?: BlockTag<T>;
}

type Handle = BlockHandle<unknown>;

/**
 * The parse context for one conversion. Built PER CALL rather than as a module
 * constant, because `runs` now closes over the context's `protectedSpans`.
 */
function parseCtxFor(ctx: MarkdownContext): MdParseCtx {
  return { runs: (text) => parseInlineMarkdown(text, ctx.protectedSpans) };
}

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

/**
 * The CANONICAL markdown prefix this type emits: the first `markdownPrefixes`
 * entry (the rest are parse-only aliases), else "".
 *
 * It reads the field whole. It used to skip entries starting with a backtick or
 * `[` — a substring sniff standing in for "that one isn't really markdown
 * syntax", which was true (a code fence, a to-do's `[] ` typing trigger) but
 * unstated: those prefixes now live on `typingPrefixes`, which this side never
 * sees, so the sniff has nothing left to catch.
 */
function outputPrefix(h: Handle): string {
  return h.markdownPrefixes?.[0] ?? "";
}

/**
 * Derived parse prefixes for a text-bearing handle, sorted longest-first so a
 * more specific marker wins. Every `markdownPrefixes` entry is claimable by
 * construction — the field means markdown line syntax and nothing else.
 */
function derivedParsePrefixes(h: Handle): string[] {
  return [...(h.markdownPrefixes ?? [])].sort((a, b) => b.length - a.length);
}

// ---------------------------------------------------------------------------
// Tags: resolution, attribute encoding
// ---------------------------------------------------------------------------

/** A `BlockTag` with every default filled in, bound to its handle. */
interface ResolvedTag {
  handle: Handle;
  name: string;
  body: BlockTagBody;
  attrsOf(data: unknown, ctx: MdSerializeCtx): Record<string, string>;
  /** `inner` is the tag's body text — only ever supplied for `body: "text"`. */
  dataOf(
    attrs: Record<string, string>,
    inner: string | null,
    ctx: MdParseCtx,
  ): unknown;
  serializeOnly: boolean;
  /** The reserved `id` attribute is this tag's row ref — see {@link BlockTag.identified}. */
  identified: boolean;
  /**
   * Attribute names supplied from outside `data`, reserved both ways — see
   * {@link BlockTag.annotated}. Empty for a tag that declares none, so both the
   * emit and the strip are unconditional loops rather than a branch.
   */
  annotated: readonly string[];
}

/** Attribute names that survive as PLAIN attributes; anything else is JSON'd. */
const ATTR_NAME = /^[A-Za-z_][A-Za-z0-9_-]*$/;

/**
 * The derived attribute projection — see `BlockTag.attrs`. Non-string values and
 * keys that are not legal attribute names go into one JSON `data` attribute, so
 * the projection is lossless for ANY schema without the type declaring anything.
 */
function derivedAttrs(
  data: unknown,
  body: BlockTagBody,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (data === undefined || data === null) return out;
  if (typeof data !== "object" || Array.isArray(data)) {
    out.data = JSON.stringify(data);
    return out;
  }
  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    // A `"text"` body carries the text between the tags; keeping it here too
    // would emit it twice and make the two copies drift.
    if (body === "text" && key === "text") continue;
    if (typeof value === "string" && ATTR_NAME.test(key) && key !== "data")
      out[key] = value;
    else rest[key] = value;
  }
  if (Object.keys(rest).length > 0) out.data = JSON.stringify(rest);
  return out;
}

/** The exact inverse of {@link derivedAttrs}, finished with the handle's schema. */
function derivedTagData(
  h: Handle,
  attrs: Record<string, string>,
  inner: string | null,
  ctx: MdParseCtx,
  body: BlockTagBody,
): unknown {
  const raw: Record<string, unknown> = {};
  const blob = attrs.data;
  if (blob !== undefined) {
    const decoded: unknown = JSON.parse(blob);
    if (
      decoded !== null &&
      typeof decoded === "object" &&
      !Array.isArray(decoded)
    ) {
      Object.assign(raw, decoded);
    } else {
      // A non-object payload was the WHOLE `data` — there is nothing to merge it
      // with (`derivedAttrs` emits no other attribute in that case).
      return h.parse(decoded);
    }
  }
  for (const [key, value] of Object.entries(attrs)) {
    if (key !== "data") raw[key] = value;
  }
  if (body === "text") raw.text = ctx.runs(inner ?? "");
  return h.parse(raw);
}

function resolveTag(h: Handle, spec: BlockTag<unknown>): ResolvedTag {
  const body = spec.body ?? "children";
  if (body === "text" && !h.text) {
    throw new Error(
      `defineBlock("${h.type}"): markdown.tag.body = "text" needs a text lens — ` +
        "this block type's schema declares no `text`, so there is no body to emit.",
    );
  }
  if (spec.identified === true && "id" in h.schema.shape) {
    throw new Error(
      `defineBlock("${h.type}"): markdown.tag.identified reserves the \`id\` attribute for the ` +
        "block's ROW id, but this type's schema declares an `id` field of its own. The derived " +
        "attribute projection would emit `data.id` under that same name, so the two meanings " +
        "would fight — a parse would either lift a payload id into the row ref or overwrite the " +
        "row ref with the payload's. Rename the schema field; the attribute name is reserved.",
    );
  }
  const annotated = spec.annotated ?? [];
  for (const name of annotated) {
    // Each of the three is a name that ALREADY has a meaning on this tag, so
    // emitting an annotation under it would produce one attribute standing for
    // two things and parse would have to guess which. Caught at resolution —
    // the first time anything serializes or parses this type — rather than on
    // the one document where both values happen to be present.
    const clash =
      name in h.schema.shape
        ? "this type's schema declares a field of its own under that name, which the derived " +
          "attribute projection emits"
        : name === "data"
          ? "`data` is the attribute the derived projection JSON-encodes everything non-string into"
          : spec.identified === true && name === "id"
            ? "`id` is already reserved by `markdown.tag.identified` for the block's ROW id"
            : null;
    if (clash !== null) {
      throw new Error(
        `defineBlock("${h.type}"): markdown.tag.annotated reserves the \`${name}\` attribute for a ` +
          `value supplied from OUTSIDE this block's data, but ${clash}. The two meanings would ` +
          "fight over one attribute — rename one of them; the annotated name is reserved.",
      );
    }
  }
  const attrs = spec.attrs;
  const parseAttrs = spec.parseAttrs;
  return {
    handle: h,
    name: spec.name ?? h.type,
    body,
    attrsOf: attrs
      ? (data, ctx) => encodeAttrs(attrs(data, ctx))
      : (data) => derivedAttrs(data, body),
    dataOf: parseAttrs
      ? (a, inner, ctx) => {
          const data = parseAttrs(a, ctx);
          if (body !== "text") return data;
          return {
            ...(data as Record<string, unknown>),
            text: ctx.runs(inner ?? ""),
          };
        }
      : (a, inner, ctx) => derivedTagData(h, a, inner, ctx, body),
    serializeOnly: spec.serializeOnly === true,
    identified: spec.identified === true,
    annotated,
  };
}

/** Drop absent attributes and stringify the rest (a declared `attrs`' output). */
function encodeAttrs(
  attrs: Record<string, string | number | boolean | null | undefined>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null) continue;
    out[key] = typeof value === "string" ? value : String(value);
  }
  return out;
}

/**
 * The tag this handle maps to, or `null` when it maps to LINES instead.
 *
 * Order matters and is the whole coverage rule: an explicitly declared `tag`
 * always wins (even beside a `serialize`, which then owns only the way out); a
 * text-bearing type keeps its derived `prefix + text` line; and a type with
 * NEITHER falls back to the derived tag — the branch that used to emit `""`.
 */
function tagFor(h: Handle): ResolvedTag | null {
  const spec = h.markdown?.tag;
  if (spec) return resolveTag(h, spec as BlockTag<unknown>);
  if (h.markdown?.serialize || h.text) return null;
  return resolveTag(h, {});
}

/**
 * The tag name this handle CLAIMS on parse, or `null` when it claims none.
 *
 * Exported for the `page.editor:markdown-tag-names-unique` check, so the check
 * and the runtime read ONE resolution: two handles claiming a name is otherwise
 * only discovered when a user pastes (`tagParsersOf` throws), and the `page`
 * type — registered by two different handles — makes that a live hazard.
 */
export function markdownParseTagName(h: BlockHandle<unknown>): string | null {
  const tag = tagFor(h);
  return tag && !tag.serializeOnly ? tag.name : null;
}

/**
 * Whether this handle's markdown tag carries its row id — see
 * {@link BlockTag.identified}.
 *
 * Exported so a consumer can derive the identified TYPE SET from the handle
 * registry it already holds. The one consumer is the markdown-apply planner,
 * which honours a node's `ref` as a pin only for a type that really round-trips
 * an id; naming the type there instead would be the collection-consumer leak
 * this codebase bans, and would silently stop pinning the day the type is
 * renamed. Same resolution the serializer and parser run, for the same reason
 * `markdownParseTagName` is shared with the uniqueness check.
 */
export function markdownTagIsIdentified(h: BlockHandle<unknown>): boolean {
  return tagFor(h)?.identified === true;
}

/** How one block type turns into markdown: flat line(s), or a tag region. */
type ResolvedSerializer =
  | { kind: "lines"; serialize(data: unknown, ctx: MdSerializeCtx): string }
  | { kind: "tag"; tag: ResolvedTag };

function serializerFor(h: Handle): ResolvedSerializer {
  const explicit = h.markdown?.serialize;
  if (explicit) return { kind: "lines", serialize: explicit };
  const tag = tagFor(h);
  if (tag) return { kind: "tag", tag };
  // `tagFor` returns null here only for a text-bearing handle (a type with
  // neither takes the derived-tag branch above), so the lens is present.
  const lens = h.text!;
  const prefix = outputPrefix(h);
  return {
    kind: "lines",
    serialize: (data, ctx) => prefix + ctx.md(lens(data)),
  };
}

function parserFor(
  h: Handle,
): (line: string, ctx: MdParseCtx) => unknown | null {
  if (h.markdown?.parseLine) return h.markdown.parseLine;
  const lens = h.text;
  if (lens) {
    const prefixes = derivedParsePrefixes(h);
    if (prefixes.length === 0) return () => null;
    const empty = h.empty;
    return (line, ctx) => {
      const prefix = prefixes.find((p) => line.startsWith(p));
      if (prefix === undefined) return null;
      return {
        ...(empty?.() ?? {}),
        text: ctx.runs(line.slice(prefix.length)),
      };
    };
  }
  return () => null;
}

// ---------------------------------------------------------------------------
// Tag lexing (one line of an open tag)
// ---------------------------------------------------------------------------
//
// Attribute values are DOUBLE-quoted, with `\` `"` and the two line terminators
// backslash-escaped — so a value can never end the quote or the line, which is
// what keeps an open tag exactly one line and therefore claimable line-wise.

function quoteAttr(value: string): string {
  let out = '"';
  for (const c of value) {
    if (c === "\\" || c === '"') out += "\\" + c;
    else if (c === "\n") out += "\\n";
    else if (c === "\r") out += "\\r";
    else out += c;
  }
  return out + '"';
}

/** `<name a="1" b="2"` — the open tag's prefix, without its `>` / `/>`. */
function openTagPrefix(name: string, attrs: Record<string, string>): string {
  let out = `<${name}`;
  for (const [key, value] of Object.entries(attrs))
    out += ` ${key}=${quoteAttr(value)}`;
  return out;
}

const TAG_NAME_AT_START = /^<([A-Za-z][A-Za-z0-9_-]*)/;
const ATTR_AT = /^([A-Za-z_][A-Za-z0-9_-]*)="((?:[^"\\]|\\.)*)"/;

interface OpenTag {
  name: string;
  attrs: Record<string, string>;
  selfClosing: boolean;
  /** Index in `line` just past the `>` / `/>`. */
  end: number;
}

/** Undo {@link quoteAttr}. An unknown escape yields the character alone. */
function unquoteAttr(raw: string): string {
  let out = "";
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] !== "\\" || i + 1 >= raw.length) {
      out += raw[i]!;
      continue;
    }
    const next = raw[i + 1]!;
    out += next === "n" ? "\n" : next === "r" ? "\r" : next;
    i += 1;
  }
  return out;
}

/**
 * The open tag `line` starts with, or `null` when it does not start with a
 * well-formed one. `null` is not an absorbed failure: "this line is not a tag"
 * is the dominant answer (every prose line reaches here), and the caller's
 * response is to keep parsing the line as prose — the lenient half of the
 * contract.
 */
function matchOpenTag(line: string): OpenTag | null {
  const nameMatch = TAG_NAME_AT_START.exec(line);
  if (!nameMatch) return null;
  const attrs: Record<string, string> = {};
  let i = 1 + nameMatch[1]!.length;
  for (;;) {
    if (line.startsWith("/>", i)) {
      return { name: nameMatch[1]!, attrs, selfClosing: true, end: i + 2 };
    }
    if (line[i] === ">") {
      return { name: nameMatch[1]!, attrs, selfClosing: false, end: i + 1 };
    }
    // Attributes must be whitespace-separated; anything else is not a tag.
    if (line[i] !== " ") return null;
    while (line[i] === " ") i += 1;
    if (line.startsWith("/>", i) || line[i] === ">") continue;
    const attr = ATTR_AT.exec(line.slice(i));
    if (!attr) return null;
    attrs[attr[1]!] = unquoteAttr(attr[2]!);
    i += attr[0].length;
  }
}

// ---------------------------------------------------------------------------
// Parse: markdown text → forest
// ---------------------------------------------------------------------------

/**
 * `children` is present only for a tag token: a tag's body is parsed
 * RECURSIVELY, so those children come from the body rather than from the
 * indentation stack `tokensToTree` walks.
 *
 * `ref` likewise only ever comes from a tag — the reserved `id` attribute of an
 * {@link BlockTag.identified} one, lifted off before any data parsing.
 */
type FlatToken = {
  indent: number;
  type: string;
  data: unknown;
  children?: SerializedBlock[];
  ref?: string;
};

/**
 * The tag name → owning handle map, built per call. Exactly the set of tags the
 * SERIALIZER can emit minus the `serializeOnly` ones, so a name that comes out
 * can always go back in.
 */
function tagParsersOf(handles: Handle[]): Map<string, ResolvedTag> {
  const byName = new Map<string, ResolvedTag>();
  for (const h of handles) {
    const tag = tagFor(h);
    if (!tag || tag.serializeOnly) continue;
    const existing = byName.get(tag.name);
    if (existing) {
      throw new Error(
        `markdown: block types "${existing.handle.type}" and "${h.type}" both claim the ` +
          `<${tag.name}> tag on PARSE. Exactly one may own a name; the other must declare ` +
          "`markdown.tag.serializeOnly` (as `page` does, so `<page/>` parses as a page-link).",
      );
    }
    byName.set(tag.name, tag);
  }
  return byName;
}

/**
 * Strip UP TO `indent` columns of leading whitespace — never blindly, so genuine
 * leading whitespace inside a fenced body survives. A tab counts as the 2
 * columns the indent measurement above gives it.
 */
function dedent(line: string, indent: number): string {
  let i = 0;
  let consumed = 0;
  while (i < line.length && consumed < indent) {
    const c = line[i]!;
    if (c === " ") consumed += 1;
    else if (c === "\t") consumed += 2;
    else break;
    i += 1;
  }
  return line.slice(i);
}

export function parseMarkdownToForest(
  text: string,
  ctx: MarkdownContext,
): SerializedBlock[] {
  const { handles } = ctx;
  const parseCtx = parseCtxFor(ctx);
  const fallback = defaultTextHandle(handles);
  // Non-default handles paired with their resolved parser, ordered by precedence
  // desc — stable sort keeps registration order for ties. The default-text
  // handle is the fallback, never a claiming parser.
  const claimers = handles
    .filter((h) => !h.defaultText)
    .map((h) => ({
      handle: h,
      precedence: h.markdown?.precedence ?? 0,
      parse: parserFor(h),
    }))
    .sort((a, b) => b.precedence - a.precedence);
  const fenceHandles = handles.filter((h) => h.markdown?.fence);
  const fences = fenceHandles.map((h) => h.markdown!.fence!);
  const tagParsers = tagParsersOf(handles);

  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const tokens: FlatToken[] = [];

  // A blank line carries no indentation of its own, so the block it stands for
  // is placed by the block that FOLLOWS it: the run is held here and flushed at
  // the next token's own indent, which `tokensToTree` then reads as "previous
  // sibling of that token". Two drops fall out of that one counter rather than
  // being rules of their own, and both are the dialect's accepted loss (see
  // `research/2026-09-01-page-blank-line-empty-paragraph.md`): a run with no
  // token BEFORE it in this scope flushes nothing, and a run with no token after
  // it is never flushed at all. A tag body recurses through this same function,
  // so "this scope" means the document or one container's body.
  let pendingBlanks = 0;
  const flushBlanks = (indent: number): void => {
    // `tokens.length === 0` is the leading-run drop. A composition shipping no
    // default-text type has nothing to mint, and skips blank lines as it always
    // did — the same answer `defaultTextHandle` gives every other caller.
    if (tokens.length > 0 && fallback) {
      for (let n = 0; n < pendingBlanks; n++) {
        tokens.push({
          indent,
          type: fallback.type,
          data: { ...(fallback.empty?.() ?? {}), text: [] },
        });
      }
    }
    pendingBlanks = 0;
  };

  let i = 0;
  while (i < lines.length) {
    const raw = lines[i]!;
    if (raw.trim() === "") {
      // Under `"separator"` nothing is ever counted, so nothing can ever be
      // flushed: this dialect is byte-identical to the skip it replaced.
      if (ctx.blankLines === "empty-block") pendingBlanks++;
      i++;
      continue;
    }
    const ws = /^(\s*)/.exec(raw)![1]!;
    const indent = ws.replace(/\t/g, "  ").length;
    const content = raw.slice(ws.length);

    // Tag-delimited region — the ONLY pass that can produce children, since a
    // `parseLine` sees one line and a `fence` body is an opaque string. A line
    // opening `<name` for a REGISTERED name claims through its matching
    // `</name>` (depth-counted, so containers nest), and the dedented body
    // recurses through this same function.
    //
    // Nothing here (or anywhere else in this module) reads `typingPrefixes`:
    // that field is input syntax, not markdown syntax, so a `TODO ` line in
    // pasted prose stays prose and a `| ` line stays a table row rather than
    // becoming a quote. This pass keys on the tag NAME alone.
    if (content.startsWith("<")) {
      const claimed = claimTag(
        lines,
        i,
        indent,
        content,
        tagParsers,
        fences,
        parseCtx,
        ctx,
      );
      if (claimed) {
        flushBlanks(indent);
        tokens.push(claimed.token);
        i = claimed.next;
        continue;
      }
    }

    // Fenced multi-line (code): capture the info string, accumulate until the
    // closing fence, then hand the body to the type's `parseFenced`.
    const fenceH = fenceHandles.find((h) =>
      content.startsWith(h.markdown!.fence!.open),
    );
    if (fenceH) {
      const fence = fenceH.markdown!.fence!;
      const info = content.slice(fence.open.length).trim();
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.trim().startsWith(fence.close)) {
        // The serializer indents EVERY line of a multi-line block by its depth,
        // so a nested fence's body arrives carrying the fence token's own
        // indent. Pushing it raw made a nested code block accrete two spaces per
        // round trip.
        body.push(dedent(lines[i]!, indent));
        i++;
      }
      if (i < lines.length) i++; // consume closing fence
      flushBlanks(indent);
      tokens.push({
        indent,
        type: fenceH.type,
        data: fence.parseFenced(info, body.join("\n"), parseCtx),
      });
      continue;
    }

    // Non-default claiming handles, precedence desc, first non-null wins.
    let claimed = false;
    for (const c of claimers) {
      const data = c.parse(content, parseCtx);
      if (data !== null) {
        flushBlanks(indent);
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
      flushBlanks(indent);
      tokens.push({
        indent,
        type: fallback.type,
        data: { ...(fallback.empty?.() ?? {}), text: parseCtx.runs(content) },
      });
    }
    i++;
  }

  return tokensToTree(tokens);
}

/** Strip the COMMON leading indentation of a tag body, preserving its shape. */
function dedentBlock(lines: string[]): string[] {
  let min = Number.POSITIVE_INFINITY;
  for (const line of lines) {
    if (line.trim() === "") continue;
    min = Math.min(min, /^(\s*)/.exec(line)![1]!.replace(/\t/g, "  ").length);
  }
  if (!Number.isFinite(min) || min === 0) return lines;
  return lines.map((line) => dedent(line, min));
}

/**
 * One token for a tag whose body was claimed. `bodyLines` arrive ALREADY
 * dedented — the caller knows which form it read, and the single-line form's
 * inner text is verbatim (dedenting it would eat a leading space the text
 * genuinely carries).
 */
function tagToken(
  tag: ResolvedTag,
  indent: number,
  attrs: Record<string, string>,
  bodyLines: string[],
  parseCtx: MdParseCtx,
  ctx: MarkdownContext,
): FlatToken {
  if (tag.body === "none") {
    // LOUD, never a silent drop: `<page id="x">…</page>` is the syntax an
    // authoritative sub-page write would use, and it is deliberately not enabled
    // yet (a markdown apply must not span several `page_id` partitions).
    // Swallowing the body here would make enabling it later a silent behavior
    // change on documents that already exist.
    throw new Error(
      `markdown: <${tag.name}> takes no body, but one was written. This tag is a POINTER ` +
        "— its content lives elsewhere and cannot be authored through it.",
    );
  }
  if (tag.body === "text") {
    return {
      indent,
      type: tag.handle.type,
      data: tag.dataOf(attrs, bodyLines.join("\n"), parseCtx),
      children: [],
    };
  }
  return {
    indent,
    type: tag.handle.type,
    data: tag.dataOf(attrs, null, parseCtx),
    children: parseMarkdownToForest(bodyLines.join("\n"), ctx),
  };
}

/**
 * Claim the tag region starting at `lines[start]`, or `null` when this line does
 * not open a registered tag (it is then ordinary prose — the lenient half of the
 * contract; foreign `<div>`s and a line that merely begins with `<` still paste
 * as text).
 */
function claimTag(
  lines: string[],
  start: number,
  indent: number,
  content: string,
  tagParsers: Map<string, ResolvedTag>,
  fences: { open: string; close: string }[],
  parseCtx: MdParseCtx,
  ctx: MarkdownContext,
): { token: FlatToken; next: number } | null {
  const open = matchOpenTag(content);
  if (!open) return null;
  const tag = tagParsers.get(open.name);
  if (!tag) return null;
  const rest = content.slice(open.end);
  const close = `</${open.name}>`;

  // The reserved `id` of an `identified` tag is the ROW this node addresses, not
  // a field of its payload — so it comes off the attribute record here, before
  // `dataOf` (and through it the handle's own `schema.parse`) ever sees it.
  // Leaving it in place is exactly the failure this is written against: a void
  // `z.object({})` STRIPS the unknown key, which would make the attribute
  // decorative — the document says which card it is editing and the applier
  // never hears it, so alignment is free to re-pair a card with another card's
  // row and detach its authorship.
  const ref = tag.identified ? takeRef(open.attrs) : undefined;

  // The `annotated` attributes come off here for the SAME reason and in the same
  // place: they were supplied from outside `data` on the way out, so they are not
  // fields of the payload and must not reach `dataOf` (or, through it, the
  // handle's own `schema.parse`). Leaving one in place is the failure this is
  // written against from both ends — a void `z.object({})` STRIPS the unknown key
  // and the attribute is merely decorative, while a strict schema rejects the
  // document outright over an attribute this side emitted itself.
  //
  // The VALUES are DISCARDED, deliberately. These attributes are read-only: the
  // row they describe lives in another table, and a pure parser can neither tell
  // an edited value from the one it was handed nor write the owner. See
  // {@link BlockTag.annotated}.
  for (const name of tag.annotated) delete open.attrs[name];

  const withRef = (token: FlatToken): FlatToken =>
    ref === undefined ? token : { ...token, ref };

  if (open.selfClosing) {
    if (rest.trim() !== "") return null;
    return {
      token: withRef({
        indent,
        type: tag.handle.type,
        data: tag.dataOf(open.attrs, null, parseCtx),
        children: [],
      }),
      next: start + 1,
    };
  }

  // Single-line form: `<name …>body</name>` — how a `"text"` body is emitted.
  if (rest.endsWith(close)) {
    const inner = rest.slice(0, rest.length - close.length);
    return {
      token: withRef(tagToken(tag, indent, open.attrs, [inner], parseCtx, ctx)),
      next: start + 1,
    };
  }
  if (rest.trim() !== "") return null;

  // Multi-line form: scan to the MATCHING close, counting nested opens of the
  // same name so containers of one type nest correctly.
  const depthDelta = (line: string): number => {
    if (line.startsWith(close)) return -1;
    const nested = matchOpenTag(line);
    if (!nested || nested.name !== open.name) return 0;
    if (nested.selfClosing) return 0;
    return line.slice(nested.end).endsWith(close) ? 0 : 1;
  };
  const body: string[] = [];
  let depth = 1;
  let j = start + 1;
  // A FENCED region inside the body is opaque: its lines are code, so a
  // `</name>` sitting in a string literal must not close this tag.
  let fenceClose: string | null = null;
  for (; j < lines.length; j++) {
    const line = lines[j]!.trim();
    if (fenceClose !== null) {
      if (line.startsWith(fenceClose)) fenceClose = null;
    } else {
      const opened = fences.find((f) => line.startsWith(f.open));
      if (opened) fenceClose = opened.close;
      else {
        depth += depthDelta(line);
        if (depth === 0) break;
      }
    }
    body.push(lines[j]!);
  }
  // Unterminated: the document ended inside the tag. Decline the claim rather
  // than swallowing the rest of the document into a block it never closed.
  if (depth !== 0) return null;
  return {
    token: withRef(
      tagToken(tag, indent, open.attrs, dedentBlock(body), parseCtx, ctx),
    ),
    next: j + 1,
  };
}

/**
 * Take the reserved `id` attribute OFF `attrs` and hand it back as the node's
 * row ref. Mutating is safe and deliberate: `matchOpenTag` built this record for
 * this one claim, and removing the key is what keeps the attribute out of every
 * downstream `dataOf` path (derived projection and a declared `parseAttrs`
 * alike) rather than each of them having to remember to skip it.
 *
 * An absent or EMPTY value yields `undefined`, and the caller then sets no `ref`
 * field at all — never `ref: undefined`. A tagless `<agent-note>` is a
 * legitimate document ("mint me a card"), and it must be structurally identical
 * to the same card parsed off the clipboard, not merely equal modulo undefined.
 */
function takeRef(attrs: Record<string, string>): string | undefined {
  const raw = attrs.id;
  delete attrs.id;
  return raw === undefined || raw === "" ? undefined : raw;
}

function tokensToTree(tokens: FlatToken[]): SerializedBlock[] {
  const roots: SerializedBlock[] = [];
  const stack: { indent: number; node: SerializedBlock }[] = [];
  for (const tok of tokens) {
    const node: SerializedBlock = {
      type: tok.type,
      data: tok.data,
      // Every creation path in the editor mints `expanded: true` ("a block is
      // born expanded"), and a self-closing tag cannot distinguish "collapsed"
      // from "childless" anyway — so a parsed forest is uniformly expanded, as
      // it has always been.
      expanded: true,
      children: tok.children ?? [],
      // Spread, so a node with no ref carries no `ref` KEY — see `takeRef`.
      ...(tok.ref === undefined ? {} : { ref: tok.ref }),
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

/**
 * Nest one rendered sibling list under its parent (two columns per level).
 *
 * An EMPTY line stays empty. It is an empty paragraph, and padding it would emit
 * trailing whitespace — stripped in transit, and noise in a diff. Nothing
 * downstream wants the padding either: a blank line's own indent is never read
 * (its block takes the indent of the block that follows it), and `dedentBlock`
 * already skips blank lines when measuring a tag body's common indent.
 */
function indentLines(lines: string[]): string[] {
  return lines.map((line) => (line === "" ? line : "  " + line));
}

/**
 * The open tag's attributes, with the RESERVED ones lifted in FRONT of the
 * type's own — the `id` of an {@link BlockTag.identified} tag first, then the
 * {@link BlockTag.annotated} values the caller supplied, in declaration order.
 * So the address is the first thing anything reading the line sees, the facts
 * about the row come next, and both stay in one place across types.
 *
 * **An absent value omits the attribute rather than throwing**, for `id` and for
 * every annotation alike. An id-less, annotation-less forest is the clipboard
 * (copy/paste, a fuzz round trip) and it must still serialize: the bare
 * `<agent-note>` it produces is portable markdown that mints a fresh card
 * wherever it is pasted. `page` is the type that throws instead, and the
 * difference is not an inconsistency — a sub-page's identity IS its row, so an
 * id-less pointer would point at nothing.
 *
 * Two LOUD failures rather than a silent overwrite or a silent drop:
 *
 * - a declared `attrs` emitting a reserved name itself. `resolveTag` catches the
 *   schema-shaped half of that collision at resolution time; this catches the
 *   half only a function body knows. For an annotated name it fires whether or
 *   not a value was supplied this time — the conflict is in the declaration, and
 *   a failure that waits for the first annotated document is one that ships.
 * - a node carrying an annotation the tag never declared. Emitting it would make
 *   it a `data` key on the way back in (nothing reserves it, so `claimTag` leaves
 *   it for the schema); dropping it would make a fact its supplier believes is in
 *   the document silently absent.
 */
function tagAttrs(
  tag: ResolvedTag,
  data: unknown,
  ctx: MdSerializeCtx,
): Record<string, string> {
  const attrs = tag.attrsOf(data, ctx);
  const reserved: Record<string, string> = {};

  if (tag.identified && ctx.id !== undefined) {
    if ("id" in attrs) {
      throw new Error(
        `markdown: <${tag.name}> declares \`identified\`, which reserves the \`id\` attribute for ` +
          "the block's ROW id, but its own `attrs` emitted an `id` too. One of the two must go.",
      );
    }
    reserved.id = ctx.id;
  }

  const supplied = ctx.annotations;
  for (const name of Object.keys(supplied ?? {})) {
    if (!tag.annotated.includes(name)) {
      throw new Error(
        `markdown: a "${tag.handle.type}" node was given the annotation \`${name}\`, which ` +
          `<${tag.name}> does not declare in \`markdown.tag.annotated\`. An undeclared attribute ` +
          "is not reserved on the way back in, so it would parse as a `data` key — declare the " +
          "name, or stop supplying it.",
      );
    }
  }
  for (const name of tag.annotated) {
    if (name in attrs) {
      throw new Error(
        `markdown: <${tag.name}> declares \`${name}\` in \`markdown.tag.annotated\`, which reserves ` +
          "that attribute for a value supplied from OUTSIDE the block's data, but its own `attrs` " +
          "emitted one too. One of the two must go.",
      );
    }
    const value = supplied?.[name];
    if (value !== undefined) reserved[name] = value;
  }

  return Object.keys(reserved).length === 0 ? attrs : { ...reserved, ...attrs };
}

/**
 * A node's annotations have exactly one place to go — its open tag's attribute
 * list — so a node carrying one for a type that serializes as plain LINES (or
 * that no handle claims at all) is a defect, not a no-op. Same refusal
 * {@link tagAttrs} makes for an undeclared name, at the other branch of the same
 * decision: whoever supplied the value believes the document carries it.
 */
function assertNoLineAnnotations(node: MarkdownNode): void {
  const names = Object.keys(node.annotations ?? {});
  if (names.length === 0) return;
  throw new Error(
    `markdown: a "${node.type}" node was given the annotation(s) ${names.join(", ")}, but this ` +
      "type serializes as markdown LINES, which have no attributes to carry them. Only a " +
      "`markdown.tag` declaring them in `annotated` can.",
  );
}

export function serializeForestToMarkdown(
  forest: MarkdownNode[],
  ctx: MarkdownContext,
): string {
  const byType = new Map(ctx.handles.map((h) => [h.type, h] as const));
  const md = (text: RichText | string): string =>
    serializeInlineMarkdown(runsOf(text), ctx.protectedSpans);

  // Returns the lines for ONE sibling list, at depth 0; the caller indents. The
  // recursion carries the nesting rather than a `depth` counter so a tag can
  // render its own children INSIDE itself and tell the walk not to re-emit them.
  const renderList = (nodes: MarkdownNode[]): string[] => {
    const out: string[] = [];
    // Per-sibling-list ordinal: 1-based position within the consecutive run of
    // same-type siblings, reset on type change. Each recursive child list starts
    // its own fresh counter (matches render-time numbering).
    let ordinal = 0;
    let prevType: string | null = null;
    // Indexed rather than `for…of`: the pin below asks whether a node is the
    // FIRST or the LAST of this sibling list, and both must be exact.
    for (let index = 0; index < nodes.length; index++) {
      const n = nodes[index]!;
      ordinal = n.type === prevType ? ordinal + 1 : 1;
      prevType = n.type;
      const h = byType.get(n.type);
      const serializeCtx: MdSerializeCtx = {
        md,
        plain: plainOf,
        ordinal,
        id: n.id,
        annotations: n.annotations,
      };
      const resolved = h ? serializerFor(h) : null;

      // Flat line(s): the walk owns the children, exactly as it always has.
      if (resolved === null || resolved.kind === "lines") {
        assertNoLineAnnotations(n);
        const line =
          resolved === null ? "" : resolved.serialize(n.data, serializeCtx);
        // The pin. A whitespace-only line is an EMPTY block, and a blank line
        // carries no indentation of its own — so the parser places it by the
        // block that FOLLOWS it, and drops a run with nothing after it. Three
        // positions are therefore unstatable that way (they mirror the parser's
        // own rules): a node with children lands under them, the first of a
        // sibling list is a leading run, the last is a trailing one. Emit the
        // handle's tag form there instead, which states depth and position
        // exactly. A handle with no tag keeps the blank line — the pin never
        // invents a spelling, so that loss stays, honestly.
        //
        // It replaces only the LINE: the walk still emits `n.children` below,
        // exactly as for any other flat line. Routing through the tag branch
        // would be a silent delete — a `body: "none"` tag self-closes and
        // CONSUMES its children.
        const pinned =
          ctx.emptyBlocks === "pinned" &&
          line.trim() === "" &&
          (n.children.length > 0 || index === 0 || index === nodes.length - 1)
            ? h && tagFor(h)
            : null;
        if (pinned) {
          out.push(
            `${openTagPrefix(pinned.name, tagAttrs(pinned, n.data, serializeCtx))}/>`,
          );
        } else {
          out.push(...line.split("\n"));
        }
        out.push(...indentLines(renderList(n.children)));
        continue;
      }

      const tag = resolved.tag;
      const prefix = openTagPrefix(
        tag.name,
        tagAttrs(tag, n.data, serializeCtx),
      );
      if (tag.body === "text") {
        // The block's OWN text between the tags; children still nest below, as
        // for any text block.
        const text = md(h!.text!(n.data));
        out.push(
          ...(text.includes("\n")
            ? [`${prefix}>`, ...indentLines(text.split("\n")), `</${tag.name}>`]
            : [`${prefix}>${text}</${tag.name}>`]),
        );
        out.push(...indentLines(renderList(n.children)));
        continue;
      }

      // A tag CONSUMES its children — emitting them inside, or (collapsed /
      // pointer) deliberately not at all. Either way the walk must not re-emit
      // them, which is why this is an explicit branch and never inferred.
      const emitsChildren =
        tag.body === "children" ||
        (tag.body === "children-when-expanded" && n.expanded);
      const childLines = emitsChildren ? renderList(n.children) : [];
      if (childLines.length === 0) out.push(`${prefix}/>`);
      else out.push(`${prefix}>`, ...indentLines(childLines), `</${tag.name}>`);
    }
    return out;
  };

  return renderList(forest).join("\n");
}
