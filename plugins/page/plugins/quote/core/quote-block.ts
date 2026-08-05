import { z } from "zod";
import { MdFormatQuote } from "react-icons/md";
import { defineContainerBlock } from "@plugins/page/plugins/container/core";

/**
 * A quote is a VOID container: it owns NOTHING but its type.
 *
 * `z.object({})` — no `text` (its content is its children) and no appearance
 * fields (a quote has one fixed look, so there is nothing per-instance to
 * store); the annotation cards are the precedent for an empty payload. The write
 * boundary parses through `handle.schema.strict()`, so a stray `text` key is
 * REJECTED with a 400 rather than quietly stored — which is what makes the void
 * model enforced instead of aspirational, and what stops the previous
 * text-bearing quote rows from being written back.
 */
export const quoteDataSchema = z.object({});

/**
 * `defineContainerBlock` — not `defineBlock` — is what makes this a container.
 * It FORCES `anchor: true` and `wrapOnConvert: true`, the two facts that are
 * only correct together (see `@plugins/page/plugins/container/core`), so this
 * file declares nothing but the quote's own identity.
 *
 * A blockquote quotes a PASSAGE, not a line. As a text block it could hold
 * exactly one paragraph, so a quoted list, a quoted heading or a two-paragraph
 * quotation were all unexpressible: Enter minted a SECOND quote (two bars with a
 * seam between them) and Tab-ing a list under it left the list outside the bar.
 * As a container the bar spans the whole passage and its content is ordinary
 * blocks of any type that do not know they are inside it — the same argument the
 * callout and the annotation cards already won.
 */
export const quoteBlock = defineContainerBlock({
  type: "quote",
  schema: quoteDataSchema,
  label: "Quote",
  icon: MdFormatQuote,
  aliases: ["blockquote", "cite", "quotation"],
  empty: () => ({}),
  // Typing `| ` at the start of a line WRAPS that line into a quote, with the
  // prefix stripped and the line as the quote's first child — the
  // markdown-shortcut plugin resolves a `wrapOnConvert` target that way.
  //
  // TYPING-only, and that is the whole reason the two prefix fields are
  // separate: `| ` starts a markdown TABLE ROW, so declaring it as
  // `markdownPrefixes` would have `derivedParsePrefixes` claim it and turn every
  // row of a pasted table into a quote. A container could not declare it there
  // anyway — a void type derives no line parser.
  //
  // NOTE: the canonical Markdown quote prefix `> ` is already claimed by the
  // `toggle` block, so this block declares no markdown line syntax at all.
  typingPrefixes: ["| "],
  // `<quote>…</quote>` — the CHILDREN go inside it, so a quoted list or a
  // two-paragraph quotation survives a markdown round trip instead of dissolving
  // into its contents. This replaces the text-bearing `body: "text"` form, which
  // had exactly one line to carry and no way to carry the rest.
  markdown: { tag: { body: "children" } },
});
