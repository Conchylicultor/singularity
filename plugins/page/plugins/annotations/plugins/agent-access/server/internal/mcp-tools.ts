import { z } from "zod";
import { Mcp } from "@plugins/infra/plugins/mcp/server";
import { HttpError } from "@plugins/infra/plugins/endpoints/server";
import {
  applyMarkdownToBlock,
  loadBlockScope,
  readBlockAsMarkdown,
  serverMarkdownContext,
  type ApplyReport,
} from "@plugins/page/plugins/markdown-apply/server";
import { pageTitleBanner } from "@plugins/page/plugins/markdown-apply/core";
import { recordAgentNotesAuthor } from "@plugins/page/plugins/annotations/plugins/agent-notes/plugins/authorship/server";
import {
  assertAgentAddressable,
  assertNoteCard,
  assertNotesOnlyPlan,
  redactHumanAudience,
} from "./policy";

/**
 * The agent-facing face of a page, as the file triple an agent already knows:
 *
 * ```
 * Read   → read_page(block_id)
 * Write  → write_agent_note(block_id, content)
 * Edit   → edit_page(block_id, old_string, new_string, replace_all)
 * ```
 *
 * `page/markdown-apply` is the engine and stays audience-agnostic — it takes a
 * root, a row filter and a boundary predicate, and knows nothing about who
 * anything is for. These three tools are the POLICY over it (see `./policy.ts`),
 * which is why they live under `annotations`: withholding `/private` and owning
 * `<agent-note>` are both statements about that family, not about markdown.
 *
 * **One parameter name — `block_id` — in all three.** The old
 * `blockId`-means-scope / `noteId`-means-target split dissolved with
 * `append_agent_notes`: a tagless `<agent-note>` in the document is now how a
 * card is minted. What the three tools differ in is what they ACCEPT, and that
 * difference is carried by the refusals, which name the tool to use instead.
 *
 * snake_case, matching the file tools (`file_path`, `old_string`, `replace_all`)
 * — and this plugin's results, which were already snake_case.
 */

const jsonResult = (
  value: unknown,
): { content: [{ type: "text"; text: string }] } => ({
  content: [{ type: "text", text: JSON.stringify(value) }],
});

/**
 * The part of an {@link ApplyReport} an agent needs to see.
 *
 * `scope_id` is the root the apply was made at — the id the agent passed, which
 * for `edit_page` is routinely a whole page. It was called `note_id` when the
 * only writable root WAS a card; keeping that name would now claim a page is a
 * note. The cards a write actually touched are `note_ids`, plural, because one
 * edit may create and revise several of them.
 */
function applySummary(
  report: ApplyReport,
  noteIds: readonly string[],
): unknown {
  return {
    scope_id: report.rootId,
    page_id: report.pageId,
    note_ids: noteIds,
    survived: report.stats.survived,
    created: report.stats.created,
    deleted: report.stats.deleted,
    moved: report.stats.moved,
    text_edited: report.textEditedIds.length,
    created_ids: report.createdIds,
    // Writes that came from re-applying the document rather than from the edit
    // itself, dropped before the write was judged. Surfaced rather than hidden:
    // a number climbing here is the projection becoming lossy, which nothing
    // else in this response would show.
    absorbed_writes: report.absorbedWrites,
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

/**
 * Stamp this conversation onto every card a write touched.
 *
 * AFTER the patch commits, always: `page_blocks_agent_authors.block_id` FKs onto
 * the card's row, so stamping a card the same call just created is a foreign-key
 * violation until then. `recordAgentNotesAuthor` is `onConflictDoNothing`, so
 * re-stamping a card this conversation already wrote is free.
 *
 * The tool layer is where `conversationId` exists at all — neither the engine nor
 * the policy ever learns one.
 */
async function stampAuthors(
  cardIds: Iterable<string>,
  conversationId: string,
): Promise<void> {
  for (const id of new Set(cardIds))
    await recordAgentNotesAuthor(id, conversationId);
}

export const readPageTool = Mcp.tool({
  name: "read_page",
  description: `Read a Singularity page — or any block within one — as markdown.

**This tool reads the SHARED instance (normally main), not your worktree** — the
opposite default from \`query_db\`, because pages are prod documents you edit
collaboratively with the user, not something to test on.

\`block_id\` is the SCOPE, not a line in the output: you get that block's
sub-blocks. A page's id gives the whole page, opening with a \`# Title\` line.

Two things in the output are ADDRESSES, and both matter when you write back:

- \`<agent-note id="…">\` — an agent-note card. Everything an agent writes to a
  page lives inside one of these, and that id is what \`write_agent_note\` takes.
- \`<page id="…"/>\` — a sub-page pointer. Leave the id alone: it is how a later
  write reconciles the tag against the existing sub-page instead of destroying it.

The markdown is a faithful projection of the block forest: what this returns
re-parses to exactly the same blocks. Hand a line back the way you found it and
it is not a write — an edit is judged only on what YOU changed, so the rest of
the document costs you nothing and you never have to repair the projection by
hand. What that asks of you is the other half: change only the text you mean to
change, and leave everything else byte-identical.

Some tags also carry READ-ONLY attributes describing state that lives outside
the page — facts about the block held elsewhere in the system, not text anyone
typed into the document. Write them back exactly as you found them. Editing one
changes nothing: the value comes from its own owner, and a write is judged on
the blocks it touches, so an edited attribute is simply ignored. To change what
such an attribute reports, act on the thing it describes.

**Content may be missing, with nothing marking where.** Cards the page's author
addressed to themselves (\`/private\`) are removed from this output entirely,
along with everything inside them. So a gap in the prose may be a note you are
not meant to see rather than something missing: do not "restore" it, and do not
read this text as proof of what the author has or has not already written down.

There is no offset/limit, deliberately — a line window can open a tag it never
closes. To read less, pass the id of the block you care about; that is what the
ids in the output are for.

To write: \`write_agent_note\` replaces one card's contents; \`edit_page\`
changes anything, as long as every block it touches sits inside an
\`<agent-note>\` card.`,
  inputSchema: {
    block_id: z
      .string()
      .min(1)
      .describe(
        "The page's block id, or any block within it to scope the read to.",
      ),
  },
  async handler({ block_id: blockId }) {
    // The scope is loaded here to decide ABOUT the block (rule 2) and again
    // inside the engine to serialize it. Two reads, deliberately: the policy
    // question is "may this id be addressed at all", which has to be answered
    // before the id is handed over as a root, and the engine's own read is what
    // keeps its walk and its rows one thing.
    assertAgentAddressable(await loadBlockScope(blockId), blockId);
    const markdown = await readBlockAsMarkdown(blockId, {
      redact: redactHumanAudience,
    });
    return { content: [{ type: "text" as const, text: markdown }] };
  },
});

export const writeAgentNoteTool = Mcp.tool({
  name: "write_agent_note",
  description: `Replace ONE \`<agent-note>\` card's contents with a markdown document.

**This writes to the SHARED instance (normally main), not your worktree** — the
opposite default from \`query_db\`, because pages are prod documents you edit
collaboratively with the user, not something to test on. What you write is live
for them at once and outlives your worktree.

\`block_id\` must name an \`<agent-note>\` card — copy the id off the opening tag
\`read_page\` emits. To CREATE a card, use \`edit_page\` and put a tagless
\`<agent-note>\` … \`</agent-note>\` where you want it; there is no separate
append tool.

\`content\` is the card's CONTENTS, not the card. Write ordinary markdown
(paragraphs, lists, headings) and it becomes the card's children; do not wrap it
in an \`<agent-note>\` tag yourself — nesting a card inside a card is refused.

A blank line is an empty paragraph, the same as pressing Enter twice in the
editor. Blocks are one per line here, so a blank line you leave between two
paragraphs becomes a spacer block of its own rather than whitespace.

This is a MERGE, not an overwrite: the incoming document is aligned against the
card's existing blocks, so unchanged blocks keep their identity (and with it
their edit history, stars, backlinks and any task launched from them). Only what
really changed is written.

Always \`read_page\` the card first (\`read_page\` with the card's id returns
exactly this document) and edit THAT text: a document written from memory loses
every block the projection encoded and re-mints the blocks it fails to reproduce
byte-for-byte. Prefer \`edit_page\` for a localized change — same machinery, far
smaller chance of rewriting the whole card by accident.

The card records that THIS conversation wrote it, so a human reading the page can
open the run that produced the note. Returns what the write actually did
(survived / created / deleted / moved).`,
  inputSchema: {
    block_id: z
      .string()
      .min(1)
      .describe("The `<agent-note>` card's block id, as read_page emits it."),
    content: z
      .string()
      .describe(
        "The card's full new contents, in the same dialect `read_page` emits.",
      ),
  },
  async handler({ block_id: blockId, content }, ctx) {
    assertNoteCard(await loadBlockScope(blockId), blockId);
    // The card set the acceptance predicate resolved, carried out of the hook.
    // `assertAcceptable` returns void by design — its only verdict is throwing —
    // so the answer it computes on the way rides out on a closure rather than
    // being walked a second time here.
    let cards: string[] = [];
    const report = await applyMarkdownToBlock(blockId, content, {
      // The SAME filter the read used, which is what makes the apply a diff
      // against the document the agent actually saw.
      redact: redactHumanAudience,
      assertAcceptable: (plan, rows) => {
        cards = assertNotesOnlyPlan({ plan, rows, rootId: blockId });
      },
    });
    // The target card is stamped even when the diff was empty: "I wrote this
    // card" is true either way, and an agent that re-sends an unchanged document
    // has still taken authorship of what it says.
    await stampAuthors([blockId, ...cards], ctx.conversationId);
    return jsonResult(
      applySummary(report, [blockId, ...cards.filter((c) => c !== blockId)]),
    );
  },
});

export const editPageTool = Mcp.tool({
  name: "edit_page",
  description: `Replace an exact string in a page, the way \`Edit\` replaces one in a file.

**This writes to the SHARED instance (normally main), not your worktree** — the
opposite default from \`query_db\`, because pages are prod documents you edit
collaboratively with the user, not something to test on. Your edit is live for
them at once and outlives your worktree.

THE ONE RULE: **every block this edit creates, rewrites, moves or deletes must
sit inside an \`<agent-note>\` card.** The page's own prose is read-only to an
agent — you annotate it, you do not rewrite it. \`block_id\` is only the SCOPE
the edit applies to (a page id for the whole page); what is allowed is judged by
what the resulting diff TOUCHED, not by which id you passed.

A blank line is an empty paragraph, the same as pressing Enter twice in the
editor. Blocks are one per line in this document, so a blank line you add is a
new block — and a new block that lands outside a card is refused like any other.
Put tags and paragraphs on consecutive lines unless you mean the spacer.

A worked round trip:

1. \`read_page(block_id: "<page id>")\` →

       # Parser notes

       The parser handles UTF-8.

       <agent-note id="block-77">
       Checked the writer.
       </agent-note>

2. Annotate that prose line — the line itself comes back byte-identical, and the
   only new block sits in a new, TAGLESS card (a tagless \`<agent-note>\` mints
   one; a tagged one names the card that already exists):

       edit_page(
         block_id:   "<page id>",
         old_string: "The parser handles UTF-8.",
         new_string: "The parser handles UTF-8.\\n<agent-note>\\nUTF-16 input is rejected in decode.ts.\\n</agent-note>",
       )

3. Revise what you wrote earlier — inside the existing card, so it is yours:

       edit_page(block_id: "<page id>",
                 old_string: "Checked the writer.",
                 new_string: "Checked the writer and the reader.")

4. REFUSED — this rewrites a prose block that is inside no card:

       edit_page(block_id: "<page id>",
                 old_string: "The parser handles UTF-8.",
                 new_string: "The parser handles UTF-16.")

       403: block block-12 was edited outside every "agent-note" card. …

Contract, matching the \`Edit\` file tool:
- \`old_string\` must appear at least once; zero matches is an error.
- It must be UNIQUE unless \`replace_all\` is true; a non-unique match is an
  error naming how many were found. Include surrounding lines to disambiguate.
- \`old_string\` and \`new_string\` must differ.

Match against what \`read_page\` returns for this \`block_id\`, not against what
you imagine it says. Everything outside a card must come back byte-identical —
including the \`# Title\` line and every \`<page id="…"/>\` pointer.`,
  inputSchema: {
    block_id: z
      .string()
      .min(1)
      .describe("The page id, or any block within it, to scope the edit to."),
    old_string: z
      .string()
      .min(1)
      .describe(
        "Exact text to replace, as it appears in `read_page`'s output.",
      ),
    new_string: z.string().describe("Replacement text."),
    replace_all: z
      .boolean()
      .default(false)
      .describe(
        "Replace every occurrence instead of requiring a unique match.",
      ),
  },
  async handler(
    {
      block_id: blockId,
      old_string: oldString,
      new_string: newString,
      replace_all: replaceAll,
    },
    ctx,
  ) {
    if (oldString === newString) {
      throw new HttpError(
        400,
        `edit_page: old_string and new_string are identical, so this edit asks for ` +
          `no change. Pass the text you want instead as new_string.`,
      );
    }
    const scope = await loadBlockScope(blockId);
    // The READ door, not the write one: this tool reads the scope as markdown
    // before it edits, so a block inside a private card is refused here for the
    // same reason `read_page` refuses it. What may be WRITTEN is judged on the
    // plan, below.
    assertAgentAddressable(scope, blockId);
    const markdown = await readBlockAsMarkdown(blockId, {
      redact: redactHumanAudience,
    });

    const matches = countOccurrences(markdown, oldString);
    if (matches === 0) {
      throw new HttpError(
        400,
        `edit_page: old_string was not found in ${blockId}. Call read_page on that ` +
          `id and copy the text to replace out of its output verbatim — a card the ` +
          `page's author addressed to themselves is not in it, so text you remember ` +
          `from elsewhere may not be there.`,
      );
    }
    if (matches > 1 && !replaceAll) {
      throw new HttpError(
        400,
        `edit_page: old_string matches ${matches} times in ${blockId}. Include more ` +
          `surrounding text to make it unique, or pass replace_all: true.`,
      );
    }
    // `split`/`join` rather than `String.replace`, whose replacement string
    // gives `$&`, `$1`, … a meaning the caller never asked for.
    const at = markdown.indexOf(oldString);
    const next = replaceAll
      ? markdown.split(oldString).join(newString)
      : markdown.slice(0, at) +
        newString +
        markdown.slice(at + oldString.length);

    // The `# Title` banner is a READER-SIDE PREFIX, not a block: a page-rooted
    // read prepends it and the apply strips it back off by BYTE-IDENTITY. An edit
    // that rewrote it would therefore fail that test, fall through to the planner
    // as a created heading, and be refused as a block outside every card — true,
    // but an answer that names neither the title nor the fix. So it is caught
    // here, where the two documents are both in hand and the diagnosis is exact.
    if (blockId === scope.pageId) {
      const banner = pageTitleBanner(scope.title, serverMarkdownContext());
      if (markdown.startsWith(banner) && !next.startsWith(banner)) {
        throw new HttpError(
          400,
          `edit_page: this edit changes the document's first line, which is page ` +
            `${scope.pageId}'s TITLE and not a block of the page — read_page ` +
            `prepends it, and no edit can write it. Anchor old_string below the ` +
            `blank line that follows the title, or scope the edit to a block ` +
            `inside the page instead of the page itself.`,
        );
      }
    }

    let cards: string[] = [];
    const report = await applyMarkdownToBlock(blockId, next, {
      // `markdown` is what this tool read a moment ago and `next` is that same
      // string with one splice in it, so every write the two have in common is
      // the round trip's own and not this edit's. Without it the boundary rule
      // below judges the caller for blocks the projection touched.
      baseline: markdown,
      redact: redactHumanAudience,
      assertAcceptable: (plan, rows) => {
        cards = assertNotesOnlyPlan({ plan, rows, rootId: blockId });
      },
    });
    // Nothing is stamped when nothing changed: unlike `write_agent_note`, this
    // tool names no card of its own, so an edit that touched no card has no
    // authorship to claim.
    await stampAuthors(cards, ctx.conversationId);
    return jsonResult({
      ...(applySummary(report, cards) as object),
      replaced: replaceAll ? matches : 1,
    });
  },
});
