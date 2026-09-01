// The `# Title` line a PAGE-rooted read prepends, and the strip that takes it
// back off a document about to be applied.
//
// ONE module, both halves — the same rule `flatten.ts` states for its own shared
// traversal: if the emitter and the stripper disagreed by a single byte, an
// apply would be a diff against a document nobody ever saw. Here that byte has a
// name: the page's own title would arrive at the planner as a CREATED heading
// block, inside the document, at the top of the page.
//
// The banner is a READER-SIDE PREFIX, never a node. The walk starts at the
// root's CHILDREN (`flatten.ts`) — the root is SCOPE, not content — and that is
// what bounds every authority downstream of it: the planner's `deleteIds` come
// from the walk's output, so a root with no line in the document is a root no
// write can name. Nothing here changes that. The string is prepended AFTER the
// serialize walk and removed BEFORE the parse, so the forest on either side of
// the round trip is exactly the one the engine already had, and the title
// handling adds zero authority of its own.

import {
  runsOf,
  serializeInlineMarkdown,
  type MarkdownContext,
} from "@plugins/page/plugins/editor/core";

/**
 * The markdown heading prefix the banner is written with. A literal, not a read
 * off some heading handle's `markdownPrefixes`: the banner is not a block and
 * must not acquire a block type's opinions. What keeps it honest is not where
 * the `# ` came from but that ONE function emits it and ONE function recognizes
 * it, which is the whole point of this module.
 */
const BANNER_PREFIX = "# ";

/**
 * The banner as a single line — what {@link stripPageTitleBanner} compares
 * against, and the reason both halves live here.
 *
 * Two things happen to the title, and both are about what a title may NOT do:
 *
 *  - **Line terminators collapse to a space.** The banner is one line by
 *    construction. A title carrying a `\n` would otherwise emit a second line
 *    the document never accounted for — which the parser would read as a
 *    paragraph and the planner as a created block, from a page's title alone.
 *  - **The rest goes through the SAME inline serializer every other line of the
 *    document uses.** A title reading `<agent-note id="…">` or `**bold**` is
 *    literal text, so it is escaped to literal text; unescaped it would forge
 *    structure in the document the agent reads — an opening tag with no close,
 *    a mark spanning the page. This is the half that matters even when the strip
 *    below succeeds, because the READ is what an agent acts on.
 */
function bannerLine(title: string, ctx: MarkdownContext): string {
  const oneLine = title.replace(/\r\n?|\n/g, " ");
  return (
    BANNER_PREFIX + serializeInlineMarkdown(runsOf(oneLine), ctx.protectedSpans)
  );
}

/**
 * The leading `# Title` line a PAGE-rooted read prepends, blank line included —
 * so a caller writes `pageTitleBanner(title, ctx) + document` and nothing else.
 *
 * Emitted for a page ROOT only. A card-scoped read must never get one: the
 * document it returns is that card's content, and a banner there would make
 * `read_page(card)` → write(card) silently mint an `# H1` inside the card.
 */
export function pageTitleBanner(title: string, ctx: MarkdownContext): string {
  return `${bannerLine(title, ctx)}\n\n`;
}

/**
 * `markdown` with the banner removed — iff its first non-empty line is
 * BYTE-IDENTICAL to the line `banner` opens with. `banner` is what
 * {@link pageTitleBanner} returned for the page's CURRENT stored title, so the
 * comparison is against what this page's own read emitted, never against a
 * shape ("some `# …` line").
 *
 * That single test is deliberately the ONLY rule, and it adds no authority:
 * everything it declines to strip simply reaches the planner, which judges it by
 * the rules it already had. The four cases, all of them intended:
 *
 *  - **first non-empty line === the banner → strip.** The common case: the agent
 *    read the page and wrote back a document still carrying its banner.
 *  - **a DIFFERENT `# …` line → do NOT strip.** A renamed title and the page's
 *    own first heading are indistinguishable from here — the document says `#
 *    Something` either way, and this module cannot know which was meant. So it
 *    falls through: the planner sees a created heading block and the acceptance
 *    predicate refuses it. Loud and correct, rather than a silent rename of the
 *    page from inside its content (or a silently deleted first heading).
 *  - **no banner at all** (the agent deleted the line) → there is nothing to
 *    strip and the document plans as-is. Tolerated because it cannot cause
 *    damage: the banner was never a row, so its absence deletes nothing.
 *  - **an edit that spliced across the banner** (`# TitleFOO`, a partial
 *    rewrite, a re-wrapped line) → not byte-identical → not stripped → reaches
 *    the planner as a created heading → refused. The same arm as a rename, for
 *    the same reason: this module refuses to guess which half of a mangled line
 *    was the title.
 *
 * Leading blank lines are tolerated (the rule is on the first NON-EMPTY line).
 * A blank line is no longer inert to `parseMarkdownToForest` — it is an empty
 * paragraph — but this runs BEFORE the parse, and a blank left at the front of
 * the document is a leading blank run with nothing to attach to, which the
 * parser drops. The ONE blank line the banner itself emitted is consumed with
 * it, which is what makes
 * `stripPageTitleBanner(pageTitleBanner(t, ctx) + doc, banner) === doc` exact.
 *
 * KNOWN BOUND: "byte-identical" is measured on lines split by `\n`, so a
 * document whose line endings were rewritten to CRLF in transit does not strip —
 * its first line carries a trailing `\r`. That lands in the mangled-line arm
 * above: refused, never silently applied.
 */
export function stripPageTitleBanner(markdown: string, banner: string): string {
  const nl = banner.indexOf("\n");
  const wanted = nl === -1 ? banner : banner.slice(0, nl);

  const lines = markdown.split("\n");
  let i = 0;
  while (i < lines.length && lines[i]!.trim() === "") i += 1;
  if (i >= lines.length || lines[i] !== wanted) return markdown;

  let next = i + 1;
  if (next < lines.length && lines[next] === "") next += 1;
  return lines.slice(next).join("\n");
}
