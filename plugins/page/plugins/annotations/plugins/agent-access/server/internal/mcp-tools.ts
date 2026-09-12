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
  assertAgentAuthored,
  assertAgentAuthoredPlan,
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
 * `<agent-inline>` and `<agent-page>` are statements about that family, not
 * about markdown.
 *
 * **One parameter name — `block_id` — in all three.** The old
 * `blockId`-means-scope / `noteId`-means-target split dissolved with
 * `append_agent_notes`: a tagless `<agent-inline>` (or `<agent-page title="…">`)
 * in the document is now how a card (or a page) is minted. What the three tools
 * differ in is what they ACCEPT, and that difference is carried by the refusals,
 * which name the tool to use instead.
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
 * note. The agent-authored blocks a write actually touched — cards and pages —
 * are `note_ids`, plural, because one edit may create and revise several of them.
 *
 * `created_page_ids` is the pages among `created_ids`: an `<agent-page>` the
 * document minted comes back as the page AND its body, and the page's id is the
 * one the agent passes back to read or write that page. Without it, telling the
 * page apart from its first paragraph means another read.
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
    created_page_ids: report.createdPageIds,
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
 * Stamp this conversation onto every agent-authored block a write touched —
 * cards and pages alike, one authorship table for both.
 *
 * AFTER the patch commits, always: `page_blocks_agent_authors.block_id` FKs onto
 * the row, so stamping a card — or a page — the same call just created is a
 * foreign-key violation until then. `recordAgentNotesAuthor` is
 * `onConflictDoNothing`, so re-stamping one this conversation already wrote is
 * free. The EARLIEST stamp is a page's creator (the chip its row shows): a page
 * minted here is stamped by the conversation that minted it, and an empty one a
 * human inserted with `/agent-page` by its first writer. A crash between the
 * commit and this loop leaves a page with no creator — nothing corrupt, only an
 * absent chip.
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

Four things in the output are ADDRESSES, and all of them matter when you write
back:

- \`<agent-inline id="…">\` — an agent card, placed inline among the page's own
  blocks. What an agent writes to a page lives inside one of these, or in an
  agent page (next).
- \`<agent-page id="…" title="…"/>\` — an AGENT PAGE: a sub-page an agent created,
  whose whole content is the agent's to write. Here it is only a pointer; its
  content lives in its own page — pass its id as \`block_id\` to read or write it.
- \`<human id="…">\` — a card the page's author wrote. Same kind of address, the
  opposite permission: see below.
- \`<page id="…" title="…"/>\` — a pointer at another page: one of the author's
  sub-pages, or a link to a page. Leave it alone: the id is how a later write
  reconciles the pointer against the existing page instead of destroying it.

An \`<agent-inline>\` id and an \`<agent-page>\` id are what \`write_agent_note\`
takes. On both pointers \`title\` is READ-ONLY — shown so you can tell pages
apart without opening each one; editing it changes nothing.

**\`<human>\` and \`<todo>\` cards are the page author's OWN words.** A \`<human>\`
card is what they wrote for you — conventions, corrections, "the writer is in
encode.ts"; a \`<todo>\` card is work they assigned. Read both, follow both, and
never write one: you may not create a \`<human>\` or \`<todo>\` card, and you may
not change, move or drop an existing one. That holds even when the card sits
INSIDE your own \`<agent-inline>\` card or agent page — nesting one there is
exactly how the author answers you inside your own note, and it stays theirs.
Hand every such card back byte-identical, id and all; reply beside it, in the
block that holds it.

The markdown is a faithful projection of the block forest: what this returns
re-parses to exactly the same blocks. Hand a line back the way you found it and
it is not a write — an edit is judged only on what YOU changed, so the rest of
the document costs you nothing and you never have to repair the projection by
hand. What that asks of you is the other half: change only the text you mean to
change, and leave everything else byte-identical.

A \`\\n\` inside a line is part of that projection: it is a soft line break
WITHIN that block, the same as pressing Shift+Enter in the editor, and not a
block boundary. Hand it back unchanged, like everything else, and it is not a
write.

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

To write: \`write_agent_note\` replaces the whole contents of one
\`<agent-inline>\` card or agent page; \`edit_page\` changes anything, as long as
every block it touches sits inside an \`<agent-inline>\` card or an agent page,
and not inside a \`<human>\` or \`<todo>\` card within it.`,
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
  description: `Replace the whole contents of ONE agent-authored block — an \`<agent-inline>\` card or an agent page — with a markdown document.

**This writes to the SHARED instance (normally main), not your worktree** — the
opposite default from \`query_db\`, because pages are prod documents you edit
collaboratively with the user, not something to test on. What you write is live
for them at once and outlives your worktree.

\`block_id\` must name one of the two — copy the id off the tag \`read_page\`
emits:

- \`<agent-inline id="…">\` — a card inline in a page. \`content\` becomes the
  card's children.
- \`<agent-page id="…" title="…"/>\` — an agent page. A page's content is written
  by its OWN id: \`content\` becomes the page's whole content. If it opens with
  the page's \`# Title\` line exactly as \`read_page\` showed it, that line is
  dropped rather than written. Any OTHER \`# …\` line is an ordinary heading
  inside the page's content — the title itself is not writable here.

To CREATE one, use \`edit_page\` on the page that should hold it: a tagless
\`<agent-inline>\` … \`</agent-inline>\` mints a card where you put it, and
\`<agent-page title="…">\` … \`</agent-page>\` mints an agent page there, its
body becoming the new page's content. There is no separate append tool.

\`content\` is the block's CONTENTS, not the block. Write ordinary markdown
(paragraphs, lists, headings); do not wrap it in an \`<agent-inline>\` tag
yourself, or you get a card inside this one rather than the contents of this one
(nesting is legal, so nothing will stop you).

A blank line is an empty paragraph, the same as pressing Enter twice in the
editor. Blocks are one per line here, so a blank line you leave between two
paragraphs becomes a spacer block of its own rather than whitespace.

This is a MERGE, not an overwrite: the incoming document is aligned against the
block's existing children, so unchanged blocks keep their identity (and with it
their edit history, stars, backlinks and any task launched from them). Only what
really changed is written.

**If the block contains a \`<human id="…">\` or \`<todo id="…">\` card, your
\`content\` must echo it back verbatim, id and all.** Those are the page author's
own words — typically their answer to you, written inside your own card or page —
and they are not yours to rewrite or to drop. \`content\` is the block's WHOLE
new contents, so a document that simply leaves such a card out is a document that
plans its deletion: the whole write is refused and NOTHING is written, not even
the parts that were fine. \`read_page\` the block first and edit that text; that
is the only way to be sure you are echoing what is actually there. The same goes
for \`<page id="…"/>\` and \`<agent-page id="…"/>\` pointers inside an agent page:
a sub-page is never deleted by leaving it out, but hand the pointers back anyway.

Always \`read_page\` the block first (\`read_page\` with its id returns exactly
this document) and edit THAT text: a document written from memory loses every
block the projection encoded and re-mints the blocks it fails to reproduce
byte-for-byte. Prefer \`edit_page\` for a localized change — same machinery, far
smaller chance of rewriting the whole block by accident.

The block records that THIS conversation wrote it, so a human reading the page
can open the run that produced it. Returns what the write actually did
(survived / created / deleted / moved).`,
  inputSchema: {
    block_id: z
      .string()
      .min(1)
      .describe(
        "The `<agent-inline>` card's or agent page's block id, as read_page emits it.",
      ),
    content: z
      .string()
      .describe(
        "The block's full new contents, in the same dialect `read_page` emits.",
      ),
  },
  async handler({ block_id: blockId, content }, ctx) {
    assertAgentAuthored(await loadBlockScope(blockId), blockId);
    // The block set the acceptance predicate resolved, carried out of the hook.
    // `assertAcceptable` returns void by design — its only verdict is throwing —
    // so the answer it computes on the way rides out on a closure rather than
    // being walked a second time here.
    let authored: string[] = [];
    const report = await applyMarkdownToBlock(blockId, content, {
      // The SAME filter the read used, which is what makes the apply a diff
      // against the document the agent actually saw.
      redact: redactHumanAudience,
      assertAcceptable: (plan, { rows, pageRow }) => {
        authored = assertAgentAuthoredPlan({
          plan,
          rows,
          pageRow,
          rootId: blockId,
        });
      },
    });
    // The target is stamped even when the diff was empty: "I wrote this" is true
    // either way, and an agent that re-sends an unchanged document has still
    // taken authorship of what it says.
    await stampAuthors([blockId, ...authored], ctx.conversationId);
    return jsonResult(
      applySummary(report, [
        blockId,
        ...authored.filter((id) => id !== blockId),
      ]),
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
sit inside an agent-authored block — an \`<agent-inline>\` card or an agent page
— and not inside a \`<human>\` or \`<todo>\` card within it.** The page's own
prose is read-only to an agent — you annotate it, you do not rewrite it — and so
is a card the author wrote, wherever it sits. The rule is one walk: from each
block you touched, go up until you reach something that says whose words it
holds; \`<agent-inline>\` and an agent page say yours, \`<human>\` and
\`<todo>\` say theirs, and reaching the top of a page the author wrote without
meeting either means the page's own prose, which is theirs too. You may not
create a \`<human>\`, \`<todo>\` or \`<private-note>\` card anywhere, including
inside your own — to file work, use \`add_task\`.

Two ways to add something of your own, both TAGLESS — a tag with an id names a
block that already exists:

- \`<agent-inline>\` … \`</agent-inline>\` — a card, right where you put it,
  among the page's blocks. For an annotation on a line.
- \`<agent-page title="…">\` … \`</agent-page>\` — an AGENT PAGE: a new sub-page
  in this page, its body becoming the new page's content, all of it yours. For
  something long enough to deserve its own page. It comes back from \`read_page\`
  as the pointer \`<agent-page id="…" title="…"/>\`, and the result's
  \`created_page_ids\` names it. After that, a page's content is written by its
  OWN id — pass it as \`block_id\` (here or to \`write_agent_note\`); a pointer
  with a body, or with any attribute besides \`title\`, is refused. Its
  \`title\` is read-only on the pointer: set it when you create the page.

\`block_id\` is only the SCOPE the edit applies to (a page id for the whole
page); what is allowed is judged by what the resulting diff TOUCHED, not by which
id you passed. Scoped to an agent page's own id, every block in it is yours.

A blank line is an empty paragraph, the same as pressing Enter twice in the
editor. Blocks are one per line in this document, so a blank line you add is a
new block — and a new block that lands outside a card is refused like any other.
Put tags and paragraphs on consecutive lines unless you mean the spacer.

A \`\\n\` INSIDE a line is the opposite: a soft line break within that block, the
same as pressing Shift+Enter in the editor rather than Enter. It is part of that
line's text, not a block boundary, so handing one back unchanged is not a write —
and adding one gives you a break inside a block where a new line would have given
you a new block.

A worked round trip:

1. \`read_page(block_id: "<page id>")\` →

       # Parser notes

       The parser handles UTF-8.

       <agent-inline id="block-77">
       Checked the writer.
       <human id="block-90">
       No — the writer is in encode.ts.
       </human>
       </agent-inline>

2. Annotate that prose line — the line itself comes back byte-identical, and the
   only new block sits in a new, TAGLESS card:

       edit_page(
         block_id:   "<page id>",
         old_string: "The parser handles UTF-8.",
         new_string: "The parser handles UTF-8.\\n<agent-inline>\\nUTF-16 input is rejected in decode.ts.\\n</agent-inline>",
       )

3. Revise what you wrote earlier — inside the existing card, so it is yours:

       edit_page(block_id: "<page id>",
                 old_string: "Checked the writer.",
                 new_string: "Checked the writer and the reader.")

4. REFUSED — this rewrites a prose block that is inside no card:

       edit_page(block_id: "<page id>",
                 old_string: "The parser handles UTF-8.",
                 new_string: "The parser handles UTF-16.")

       403: block block-12 was edited outside every agent-authored block. …

5. REFUSED — this one is INSIDE your own card, and still refused, because the
   line it rewrites is inside the \`<human>\` card the author nested there:

       edit_page(block_id: "<page id>",
                 old_string: "No — the writer is in encode.ts.",
                 new_string: "No — the writer is in decode.ts.")

       403: block block-91 was edited, and it sits inside <human> card block-90. …

   Same for deleting it, moving it out, or leaving it out of a
   \`write_agent_note\` on block-77. Answer it in block-77, below the card.

Contract, matching the \`Edit\` file tool:
- \`old_string\` must appear at least once; zero matches is an error.
- It must be UNIQUE unless \`replace_all\` is true; a non-unique match is an
  error naming how many were found. Include surrounding lines to disambiguate.
- \`old_string\` and \`new_string\` must differ.

Match against what \`read_page\` returns for this \`block_id\`, not against what
you imagine it says. Everything outside your own blocks must come back
byte-identical — including the \`# Title\` line (a page's title is not writable,
an agent page's included), every \`<page id="…"/>\` and \`<agent-page id="…"/>\`
pointer, and every \`<human>\` / \`<todo>\` card, which is the author's even when
it sits in yours.`,
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

    let authored: string[] = [];
    const report = await applyMarkdownToBlock(blockId, next, {
      // `markdown` is what this tool read a moment ago and `next` is that same
      // string with one splice in it, so every write the two have in common is
      // the round trip's own and not this edit's. Without it the boundary rule
      // below judges the caller for blocks the projection touched.
      baseline: markdown,
      redact: redactHumanAudience,
      assertAcceptable: (plan, { rows, pageRow }) => {
        authored = assertAgentAuthoredPlan({
          plan,
          rows,
          pageRow,
          rootId: blockId,
        });
      },
    });
    // Nothing is stamped when nothing changed: unlike `write_agent_note`, this
    // tool names no block of its own, so an edit that touched no agent-authored
    // block has no authorship to claim. A page it MINTED is among `authored` —
    // the new page is its own nearest agent-authored row — so it is stamped as
    // its creator here, after the commit.
    await stampAuthors(authored, ctx.conversationId);
    return jsonResult({
      ...(applySummary(report, authored) as object),
      replaced: replaceAll ? matches : 1,
    });
  },
});
