import { z } from "zod";
import { Mcp } from "@plugins/infra/plugins/mcp/server";
import { readPageAsMarkdown } from "./read";
import { applyMarkdownToPage, type ApplyReport } from "./apply";

/**
 * The agent-facing face of the markdown ⇄ forest projection: read a page as
 * markdown, edit the string, write it back — the loop an agent already runs on
 * files, now over a page whose block ids (and therefore content docs, undo
 * history, backlinks, stars and task links) survive the round trip.
 *
 * `edit_page` is the ergonomic path and the reason the whole design exists: a
 * localized string replacement produces a near-perfect alignment, so exactly
 * one block changes and everything else is left byte-identical.
 */

const jsonResult = (value: unknown): { content: [{ type: "text"; text: string }] } => ({
  content: [{ type: "text", text: JSON.stringify(value) }],
});

/** The part of an {@link ApplyReport} an agent needs to see. */
function applySummary(report: ApplyReport): unknown {
  return {
    page_id: report.pageId,
    survived: report.stats.survived,
    created: report.stats.created,
    deleted: report.stats.deleted,
    moved: report.stats.moved,
    text_edited: report.textEditedIds.length,
    created_ids: report.createdIds,
  };
}

/** Non-overlapping occurrences of `needle` in `haystack`. */
function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at < 0) return count;
    count += 1;
    from = at + needle.length;
  }
}

export const readPageTool = Mcp.tool({
  name: "read_page",
  description: `Read a Singularity page as markdown.

The markdown is a LOSSLESS projection of the page's block forest: what this
returns re-parses to the same blocks. Sub-pages appear as \`<page id="…"/>\`
pointers — leave the id alone; it is how a later write reconciles the tag
against the existing sub-page instead of destroying it.

Pair with \`edit_page\` (preferred) or \`write_page\`.`,
  inputSchema: {
    pageId: z.string().min(1).describe("The page's block id."),
  },
  async handler({ pageId }) {
    return { content: [{ type: "text" as const, text: await readPageAsMarkdown(pageId) }] };
  },
});

export const writePageTool = Mcp.tool({
  name: "write_page",
  description: `Replace a Singularity page's content with a markdown document.

This is a MERGE, not an overwrite: the incoming document is aligned against the
page's existing blocks, so unchanged blocks keep their identity (and with it
their edit history, stars, backlinks and any task launched from them). Only what
really changed is written.

Prefer \`edit_page\` for a localized change — it is the same machinery with a
much smaller chance of accidentally rewriting the whole page. Use \`write_page\`
when you are producing the document wholesale.

Always \`read_page\` first and edit THAT text: a document written from memory
loses every block the projection encoded (sub-page pointers, void blocks) and
will re-mint the blocks it fails to reproduce byte-for-byte.

Returns what the write actually did (survived / created / deleted / moved).`,
  inputSchema: {
    pageId: z.string().min(1).describe("The page's block id."),
    markdown: z
      .string()
      .describe("The full new document, in the same dialect `read_page` emits."),
  },
  async handler({ pageId, markdown }) {
    return jsonResult(applySummary(await applyMarkdownToPage(pageId, markdown)));
  },
});

export const editPageTool = Mcp.tool({
  name: "edit_page",
  description: `Replace an exact string in a Singularity page.

The page is read as markdown, \`oldString\` is replaced with \`newString\`, and
the result is merged back — so a one-word change touches exactly one block and
every other block keeps its identity.

Contract, matching the Edit file tool:
- \`oldString\` must appear at least once; zero matches is an error.
- It must be UNIQUE unless \`replaceAll\` is true; a non-unique match is an
  error naming how many were found. Include surrounding lines to disambiguate.
- \`oldString\` and \`newString\` must differ.

Match against what \`read_page\` returns, not against what you imagine the page
looks like.`,
  inputSchema: {
    pageId: z.string().min(1).describe("The page's block id."),
    oldString: z
      .string()
      .min(1)
      .describe("Exact text to replace, as it appears in `read_page`'s output."),
    newString: z.string().describe("Replacement text."),
    replaceAll: z
      .boolean()
      .default(false)
      .describe("Replace every occurrence instead of requiring a unique match."),
  },
  async handler({ pageId, oldString, newString, replaceAll }) {
    if (oldString === newString) {
      throw new Error("edit_page: oldString and newString are identical.");
    }
    const markdown = await readPageAsMarkdown(pageId);
    const matches = countOccurrences(markdown, oldString);
    if (matches === 0) {
      throw new Error(
        `edit_page: oldString was not found in page ${pageId}. ` +
          `Call read_page and copy the text to replace out of its output.`,
      );
    }
    if (matches > 1 && !replaceAll) {
      throw new Error(
        `edit_page: oldString matches ${matches} times in page ${pageId}. ` +
          `Include more surrounding text to make it unique, or pass replaceAll: true.`,
      );
    }
    // `split`/`join` rather than `String.replace`, whose replacement string
    // gives `$&`, `$1`, … a meaning the caller never asked for.
    const at = markdown.indexOf(oldString);
    const next = replaceAll
      ? markdown.split(oldString).join(newString)
      : markdown.slice(0, at) + newString + markdown.slice(at + oldString.length);
    return jsonResult({
      ...(applySummary(await applyMarkdownToPage(pageId, next)) as object),
      replaced: replaceAll ? matches : 1,
    });
  },
});
