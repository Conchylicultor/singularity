import { z } from "zod";
import { Mcp } from "@plugins/infra/plugins/mcp/server";
import {
  applyMarkdownToBlock,
  loadBlockScope,
  readBlockAsMarkdown,
  type ApplyReport,
} from "@plugins/page/plugins/markdown-apply/server";
import { recordAgentNotesAuthor } from "@plugins/page/plugins/annotations/plugins/agent-notes/plugins/authorship/server";
import { appendAgentNotes } from "./append";
import {
  assertAgentAddressable,
  assertMarkdownWritable,
  assertWritableNote,
  redactHumanAudience,
} from "./policy";

/**
 * The agent-facing face of a page: read it as markdown, write back only into
 * agent-notes cards.
 *
 * `page/markdown-apply` is the engine and stays audience-agnostic — it takes a
 * root and a row filter and knows nothing about who anything is for. These four
 * tools are the POLICY over it (see `./policy.ts`), which is why they live under
 * `annotations`: withholding `/private-notes` and owning `<agent-notes>` are
 * both statements about that family, not about markdown.
 *
 * `write_page` / `edit_page` — whole-page markdown editing, which shipped with
 * the engine — are deliberately GONE. Nothing an agent can name reaches the
 * page's prose any more. The engine that made them possible is untouched, so
 * they could return behind a per-page, human-set opt-in if that is ever wanted.
 */

const jsonResult = (value: unknown): { content: [{ type: "text"; text: string }] } => ({
  content: [{ type: "text", text: JSON.stringify(value) }],
});

/** The part of an {@link ApplyReport} an agent needs to see. */
function applySummary(report: ApplyReport): unknown {
  return {
    note_id: report.rootId,
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
  description: `Read a Singularity page — or any block within one — as markdown.

\`blockId\` is the SCOPE, not a line in the output: you get that block's
sub-blocks. A page's id gives the whole page.

The markdown is a LOSSLESS projection of the block forest: what this returns
re-parses to the same blocks. Sub-pages appear as \`<page id="…"/>\` pointers —
leave the id alone; it is how a later write reconciles the tag against the
existing sub-page instead of destroying it.

**Content may be missing, with nothing marking where.** Cards the page's author
addressed to themselves (\`/private-notes\`) are removed from this output
entirely, along with everything inside them. So a gap in the prose may be a note
you are not meant to see rather than something missing: do not "restore" it, and
do not read this text as proof of what the author has or has not already
written down.

Writes are notes-only. Use \`append_agent_notes\` to add a new note card, and
\`write_agent_notes\` / \`edit_agent_notes\` to revise one. There is no tool that
edits the page's own prose.`,
  inputSchema: {
    blockId: z
      .string()
      .min(1)
      .describe("The page's block id, or any block within it to scope the read to."),
  },
  async handler({ blockId }) {
    // The scope is loaded here to decide ABOUT the block (rule 3) and again
    // inside the engine to serialize it. Two reads, deliberately: the policy
    // question is "may this id be addressed at all", which has to be answered
    // before the id is handed over as a root, and the engine's own read is what
    // keeps its walk and its rows one thing.
    assertAgentAddressable(await loadBlockScope(blockId), blockId);
    const markdown = await readBlockAsMarkdown(blockId, { redact: redactHumanAudience });
    return { content: [{ type: "text" as const, text: markdown }] };
  },
});

export const appendAgentNotesTool = Mcp.tool({
  name: "append_agent_notes",
  description: `Append a new \`<agent-notes>\` card to a page (or to any block in one).

This is how an agent writes back to a page: what it found, what it assumed, what
it left undone. The card lands as the LAST child of \`blockId\`, and nothing
already on the page is moved, rewritten or deleted — this tool only creates.

\`markdown\` is the card's CONTENTS, not the card. Write ordinary markdown
(paragraphs, lists, headings) and it becomes the card's children; do not wrap it
in an \`<agent-notes>\` tag yourself.

Keep the returned \`note_id\`. It is the only handle for revising this card later
(\`write_agent_notes\` / \`edit_agent_notes\`), and the card records that THIS
conversation wrote it, so a human reading the page can open the run that produced
the note.

Refused when \`blockId\` is, or sits inside, an agent-notes card (notes do not
nest) or a card the author addressed to themselves.`,
  inputSchema: {
    blockId: z
      .string()
      .min(1)
      .describe("The block the new card is appended under — a page id for the page itself."),
    markdown: z
      .string()
      .min(1)
      .describe("The card's contents, in the same dialect `read_page` emits."),
  },
  async handler({ blockId, markdown }, ctx) {
    const result = await appendAgentNotes(blockId, markdown);
    // AFTER the patch commits: `page_blocks_agent_authors.block_id` FKs onto the
    // card's row, so stamping a card that does not exist yet is a foreign-key
    // violation. The tool layer is where `conversationId` lives at all — the
    // engine never learns one.
    await recordAgentNotesAuthor(result.noteId, ctx.conversationId);
    return jsonResult({
      note_id: result.noteId,
      page_id: result.pageId,
      created: result.createdIds.length,
    });
  },
});

export const writeAgentNotesTool = Mcp.tool({
  name: "write_agent_notes",
  description: `Replace one agent-notes card's contents with a markdown document.

\`noteId\` must name an \`<agent-notes>\` card — one \`append_agent_notes\`
returned, or one an earlier agent wrote. **That restriction is the whole
permission model**: an agent may add notes to a page and revise its own, and can
never touch the page's prose because no tool accepts a prose block's id.

This is a MERGE, not an overwrite: the incoming document is aligned against the
card's existing blocks, so unchanged blocks keep their identity (and with it
their edit history, stars, backlinks and any task launched from them). Only what
really changed is written.

Prefer \`edit_agent_notes\` for a localized change — same machinery, far smaller
chance of accidentally rewriting the whole card. Use this one when you are
producing the card's contents wholesale.

Always \`read_page\` the card first (\`read_page\` with the card's id returns
exactly this document) and edit THAT text: a document written from memory loses
every block the projection encoded and re-mints the blocks it fails to reproduce
byte-for-byte.

Returns what the write actually did (survived / created / deleted / moved).`,
  inputSchema: {
    noteId: z
      .string()
      .min(1)
      .describe("The `<agent-notes>` card's block id."),
    markdown: z
      .string()
      .describe("The card's full new contents, in the same dialect `read_page` emits."),
  },
  async handler({ noteId, markdown }, ctx) {
    assertWritableNote(await loadBlockScope(noteId), noteId);
    // The incoming document, not just the target: rules 1-4 reason about rows
    // that already exist and cannot see a card the agent is about to MINT.
    assertMarkdownWritable(markdown);
    const report = await applyMarkdownToBlock(noteId, markdown);
    await recordAgentNotesAuthor(noteId, ctx.conversationId);
    return jsonResult(applySummary(report));
  },
});

export const editAgentNotesTool = Mcp.tool({
  name: "edit_agent_notes",
  description: `Replace an exact string inside one agent-notes card.

The card is read as markdown, \`oldString\` is replaced with \`newString\`, and
the result is merged back — so a one-word change touches exactly one block and
every other block keeps its identity.

\`noteId\` must name an \`<agent-notes>\` card, for the reason
\`write_agent_notes\` states: addressing IS the permission model.

Contract, matching the Edit file tool:
- \`oldString\` must appear at least once; zero matches is an error.
- It must be UNIQUE unless \`replaceAll\` is true; a non-unique match is an
  error naming how many were found. Include surrounding lines to disambiguate.
- \`oldString\` and \`newString\` must differ.

Match against what \`read_page\` returns for this card, not against what you
imagine it says.`,
  inputSchema: {
    noteId: z
      .string()
      .min(1)
      .describe("The `<agent-notes>` card's block id."),
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
  async handler({ noteId, oldString, newString, replaceAll }, ctx) {
    if (oldString === newString) {
      throw new Error("edit_agent_notes: oldString and newString are identical.");
    }
    assertWritableNote(await loadBlockScope(noteId), noteId);
    // NOT redacted, deliberately. The card was just proved to hold no
    // human-audience content, so redaction here would be a no-op — and if it
    // ever were not, stripping rows out of the text a write is diffed against is
    // exactly how a hidden card becomes a deletion.
    const markdown = await readBlockAsMarkdown(noteId);
    const matches = countOccurrences(markdown, oldString);
    if (matches === 0) {
      throw new Error(
        `edit_agent_notes: oldString was not found in card ${noteId}. ` +
          `Call read_page on that id and copy the text to replace out of its output.`,
      );
    }
    if (matches > 1 && !replaceAll) {
      throw new Error(
        `edit_agent_notes: oldString matches ${matches} times in card ${noteId}. ` +
          `Include more surrounding text to make it unique, or pass replaceAll: true.`,
      );
    }
    // `split`/`join` rather than `String.replace`, whose replacement string
    // gives `$&`, `$1`, … a meaning the caller never asked for.
    const at = markdown.indexOf(oldString);
    const next = replaceAll
      ? markdown.split(oldString).join(newString)
      : markdown.slice(0, at) + newString + markdown.slice(at + oldString.length);
    // The SPLICED document, not `newString` alone: a tag can be opened in one
    // replacement and closed by text that was already there, so only the whole
    // result is meaningful to parse.
    assertMarkdownWritable(next);
    const report = await applyMarkdownToBlock(noteId, next);
    await recordAgentNotesAuthor(noteId, ctx.conversationId);
    return jsonResult({
      ...(applySummary(report) as object),
      replaced: replaceAll ? matches : 1,
    });
  },
});
