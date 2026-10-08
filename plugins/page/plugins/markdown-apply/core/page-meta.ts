// The `<page-meta>` header a read may open with, and the split that takes it
// back off a document about to be applied.
//
// It is the `# Title` banner's sibling (`./page-title.ts`) and follows the same
// two rules, for the same reasons:
//
//  - **A READER-SIDE PREFIX, never a node.** It is prepended to the finished
//    document and removed before the parse, so the forest on either side of the
//    round trip is exactly the one the engine already had. No write can name it.
//  - **Emit and read in ONE module.** If the two disagreed on a byte, a header a
//    read emitted would reach the planner as created blocks.
//
// Where it differs from the banner: the banner is stripped only on BYTE-IDENTITY
// with the stored title, because a changed title line is a rename to decide. The
// header's fields are facts held elsewhere (the page's ancestry, its timestamps)
// — READ-ONLY, like a tag's annotated attributes — so a header is recognised by
// its STRUCTURE and its values are ignored. That is also what lets a document
// read a minute ago still apply after the page's `edited` time moved. A field
// that becomes writable later (tags) is read off {@link PageMetaSplit}'s `meta`
// by the caller that owns it, never by this engine.
//
// Structure is checked strictly all the same: a header holding a line it does
// not know is refused rather than skipped, so a block an agent wrote inside it
// is never silently dropped.
//
// Shape:
//
//     <page-meta created="2026-07-14T09:12Z" edited="2026-10-07T18:02Z">
//       <breadcrumb>
//         <page id="block-…" title="Singularity"/>
//         <page id="block-…" title="Hosted"/>
//       </breadcrumb>
//     </page-meta>
//
// A paragraph can never open with `<` in this dialect (the inline serializer
// escapes it, `core/markdown.ts`), so no block's line can be mistaken for the
// header's first line.

import { formatTagLine, parseTagLine } from "@plugins/page/plugins/editor/core";

const META_TAG = "page-meta";
const BREADCRUMB_TAG = "breadcrumb";
const CRUMB_TAG = "page";
const INDENT = "  ";

/** One page of a breadcrumb: an address `read_page` takes, and its title. */
export interface PageCrumb {
  id: string;
  title: string;
}

/** What a header states about the page a read was taken from. */
export interface PageMeta {
  /** When the page row was created. */
  created: Date;
  /** When the page or any of its live blocks last changed. */
  edited: Date;
  /** Root first, ending with the page itself — "where am I" for any scope. */
  breadcrumb: readonly PageCrumb[];
}

/** A header as read back: its attributes and breadcrumb, values unjudged. */
export interface ParsedPageMeta {
  attrs: Record<string, string>;
  breadcrumb: PageCrumb[];
}

/** Minute precision, UTC: `2026-10-07T18:02Z`. */
function minuteIso(date: Date): string {
  return `${date.toISOString().slice(0, 16)}Z`;
}

/**
 * The header for `meta`, blank line included — so a caller writes
 * `pageMetaHeader(meta) + document` and nothing else.
 */
export function pageMetaHeader(meta: PageMeta): string {
  const lines = [
    formatTagLine(
      META_TAG,
      { created: minuteIso(meta.created), edited: minuteIso(meta.edited) },
      false,
    ),
    `${INDENT}${formatTagLine(BREADCRUMB_TAG, {}, false)}`,
    ...meta.breadcrumb.map(
      (crumb) =>
        `${INDENT}${INDENT}${formatTagLine(
          CRUMB_TAG,
          { id: crumb.id, title: crumb.title },
          true,
        )}`,
    ),
    `${INDENT}</${BREADCRUMB_TAG}>`,
    `</${META_TAG}>`,
  ];
  return `${lines.join("\n")}\n\n`;
}

/**
 * `markdown` split into its leading header (if any) and the document after it.
 *
 * `meta: null` with `rest === markdown` when the first non-empty line is not a
 * `<page-meta>` tag — a document without a header is an ordinary document. A
 * header that opens and is then malformed (an unknown line, no closing tag) is
 * `ok: false`, never a guess about where it ends.
 */
export type PageMetaSplit =
  | { ok: true; meta: ParsedPageMeta | null; header: string; rest: string }
  | { ok: false; reason: string };

export function splitPageMeta(markdown: string): PageMetaSplit {
  const lines = markdown.split("\n");
  let i = 0;
  while (i < lines.length && lines[i]!.trim() === "") i += 1;
  const open = i < lines.length ? parseTagLine(lines[i]!.trim()) : null;
  if (
    open === null ||
    !open.ok ||
    open.tag.name !== META_TAG ||
    open.tag.selfClosing
  ) {
    return { ok: true, meta: null, header: "", rest: markdown };
  }
  const start = i;
  const meta: ParsedPageMeta = { attrs: open.tag.attrs, breadcrumb: [] };
  let inBreadcrumb = false;
  for (i += 1; i < lines.length; i += 1) {
    const line = lines[i]!.trim();
    if (line === `</${META_TAG}>`) {
      if (inBreadcrumb) {
        return refusal(
          `<${BREADCRUMB_TAG}> is not closed before </${META_TAG}>`,
        );
      }
      let next = i + 1;
      if (next < lines.length && lines[next] === "") next += 1;
      return {
        ok: true,
        meta,
        header: lines.slice(start, next).join("\n"),
        rest: lines.slice(next).join("\n"),
      };
    }
    // The header is one block of lines: a blank line inside it means its close
    // went missing, which names the fix better than "unknown line".
    if (line === "") {
      return refusal(
        `it has no closing </${META_TAG}> line before a blank line`,
      );
    }
    if (line === `</${BREADCRUMB_TAG}>` && inBreadcrumb) {
      inBreadcrumb = false;
      continue;
    }
    const tag = parseTagLine(line);
    if (tag.ok && tag.tag.name === BREADCRUMB_TAG && !tag.tag.selfClosing) {
      if (inBreadcrumb) return refusal(`<${BREADCRUMB_TAG}> is opened twice`);
      inBreadcrumb = true;
      continue;
    }
    if (
      tag.ok &&
      inBreadcrumb &&
      tag.tag.name === CRUMB_TAG &&
      tag.tag.selfClosing
    ) {
      meta.breadcrumb.push({
        id: tag.tag.attrs.id ?? "",
        title: tag.tag.attrs.title ?? "",
      });
      continue;
    }
    return refusal(
      `it holds the line ${JSON.stringify(lines[i])}, which is not part of a ` +
        `<${META_TAG}> header`,
    );
  }
  return refusal(`it has no closing </${META_TAG}> line`);
}

function refusal(why: string): PageMetaSplit {
  return {
    ok: false,
    reason:
      `the document opens with a <${META_TAG}> header, but ${why}. The header ` +
      `is read-only: hand it back exactly as read_page showed it, or leave it ` +
      `out, and write your content below it`,
  };
}
