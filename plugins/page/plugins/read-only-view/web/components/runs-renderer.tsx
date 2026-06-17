import { Fragment, type CSSProperties, type ReactNode } from "react";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { colorCssValue } from "@plugins/page/plugins/editor/web";
import { runsOf, type RichText, type TextRun } from "@plugins/page/plugins/editor/core";
import { PAGE_LINK_TOKEN_PATTERN } from "@plugins/page/plugins/inline-page-link/core";
import { INLINE_MATH_TOKEN_PATTERN } from "@plugins/page/plugins/math/plugins/inline/core";
import { KatexMath } from "@plugins/page/plugins/math/plugins/render/web";
import { PageLinkChip } from "./page-link-chip";

/**
 * Faithful, non-editable rendering of the editor's `RichText` runs model.
 *
 * Mirrors the editor's runs→Lexical mapping (`block-text-extensions.ts`) without
 * mounting Lexical:
 *  - marks: bold→`<strong>`, italic→`<em>`, underline/strikethrough/code→the same
 *    class strings the live editor's Lexical theme applies, so the visual is
 *    pixel-identical.
 *  - color: `colorCssValue(token)` → the shared `var(--rt-color-<token>)` CSS var.
 *  - link: a non-editable `<a>` styled like the editor's link theme.
 *  - inline `[[<pageId>]]` page-link tokens → a read-only `<PageLinkChip>`.
 *  - inline `\(latex\)` math tokens → `<KatexMath display={false}>`.
 *
 * The mark class strings are duplicated from the editor's Lexical `theme.text`
 * config rather than imported (they live inside a Lexical config object, not an
 * exported value); they are the inline-format contract and change in lockstep
 * with that config.
 */

// Lexical theme.text mark classes (block-text-editor.tsx initialConfig.theme).
const MARK_UNDERLINE = "underline";
const MARK_STRIKETHROUGH = "line-through";
const MARK_CODE = "rounded-md bg-muted px-1 font-mono text-[0.9em]";
// Lexical theme.link.
const LINK_CLASS = "text-primary underline";

/** One token recognized inside a run's text, in priority order. */
type Segment =
  | { kind: "text"; text: string }
  | { kind: "page-link"; pageId: string }
  | { kind: "math"; latex: string };

const PAGE_LINK_RE = new RegExp(PAGE_LINK_TOKEN_PATTERN.source, "g");
const INLINE_MATH_RE = new RegExp(INLINE_MATH_TOKEN_PATTERN.source, "g");

/**
 * Split a run's text into plain spans + recognized inline tokens. Page-link and
 * inline-math tokens have non-overlapping, distinctive delimiters (`[[…]]` vs
 * `\(…\)`), so a single combined scan that prefers whichever token starts first
 * is unambiguous.
 */
function segmentsOf(text: string): Segment[] {
  const out: Segment[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    PAGE_LINK_RE.lastIndex = cursor;
    INLINE_MATH_RE.lastIndex = cursor;
    const link = PAGE_LINK_RE.exec(text);
    const math = INLINE_MATH_RE.exec(text);

    // Pick the earliest-starting match (if any).
    let next: { index: number; seg: Segment; length: number } | null = null;
    if (link && (!math || link.index <= math.index)) {
      next = {
        index: link.index,
        seg: { kind: "page-link", pageId: link[1]! },
        length: link[0].length,
      };
    } else if (math) {
      next = {
        index: math.index,
        seg: { kind: "math", latex: math[1]! },
        length: math[0].length,
      };
    }

    if (!next) {
      out.push({ kind: "text", text: text.slice(cursor) });
      break;
    }
    if (next.index > cursor) {
      out.push({ kind: "text", text: text.slice(cursor, next.index) });
    }
    out.push(next.seg);
    cursor = next.index + next.length;
  }
  return out;
}

/** Render a plain-text segment, preserving `\n` soft breaks as `<br>`. */
function renderText(text: string): ReactNode {
  if (!text.includes("\n")) return text;
  const lines = text.split("\n");
  return lines.map((line, i) => (
    <Fragment key={i}>
      {i > 0 ? <br /> : null}
      {line}
    </Fragment>
  ));
}

/** Wrap a run's rendered children with its marks/color/link. */
function decorateRun(run: TextRun, children: ReactNode): ReactNode {
  const marks = run.marks ?? [];
  // NOTE: `underline` and `line-through` are both `text-decoration-line`
  // utilities, so routing them through `cn()` (twMerge) would collapse to the
  // last one — silently dropping underline when a run is BOTH underlined and
  // struck. The live editor applies them as independent Lexical classes (no
  // twMerge) and CSS happily renders `text-decoration: underline line-through`.
  // So we join the decoration classes by hand and only `cn()` the non-colliding
  // `code` chrome.
  const className = [
    marks.includes("underline") && MARK_UNDERLINE,
    marks.includes("strikethrough") && MARK_STRIKETHROUGH,
    marks.includes("code") && MARK_CODE,
  ]
    .filter(Boolean)
    .join(" ");
  const colorValue = colorCssValue(run.color);
  const style: CSSProperties | undefined = colorValue ? { color: colorValue } : undefined;

  let node: ReactNode = children;
  if (marks.includes("italic")) node = <em>{node}</em>;
  if (marks.includes("bold")) node = <strong>{node}</strong>;

  if (run.link) {
    return (
      <a
        href={run.link}
        target="_blank"
        rel="noreferrer"
        className={cn(LINK_CLASS, className)}
        style={style}
      >
        {node}
      </a>
    );
  }
  if (className || style) {
    return (
      <span className={className || undefined} style={style}>
        {node}
      </span>
    );
  }
  return node;
}

export interface RunsRendererProps {
  /** A `RichText` array, or any `string | RichText | unknown` (coerced via `runsOf`). */
  value: unknown;
}

/** Faithfully renders the editor's rich-text runs as static React. */
export function RunsRenderer({ value }: RunsRendererProps) {
  const runs: RichText = runsOf(value);
  return (
    <>
      {runs.map((run, ri) => {
        const segments = segmentsOf(run.text);
        const children = segments.map((seg, si) => {
          if (seg.kind === "page-link") {
            return <PageLinkChip key={si} pageId={seg.pageId} />;
          }
          if (seg.kind === "math") {
            return <KatexMath key={si} expression={seg.latex} display={false} />;
          }
          return <Fragment key={si}>{renderText(seg.text)}</Fragment>;
        });
        return <Fragment key={ri}>{decorateRun(run, children)}</Fragment>;
      })}
    </>
  );
}
