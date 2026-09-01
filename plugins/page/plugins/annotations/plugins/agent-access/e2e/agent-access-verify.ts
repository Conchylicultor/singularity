// Agent access to a page: what an agent may see, and what it may write.
//
// This file is the executable statement of BOTH halves — the policy this plugin
// adds, and the engine guarantee it inherits from `page/markdown-apply` (whose
// own end-to-end spec moved here with the tools, since the engine has no
// agent-facing surface of its own any more).
//
// Policy:
//  P1. `read_page` is LOSSLESS and REDACTING at once — the prose and every
//      `<agent-note id="…">` address are there; a `/private` card, its contents
//      and even the substring `private-note` are not.
//  P2. Every refusal fires with a message that names the fix, and — checked on a
//      five-column row snapshot, not on the tool's own report — writes NOTHING.
//  P3. A block INSIDE a private card cannot be read — the id itself is not a
//      bypass.
//  P4. Notes do not nest: an edit whose markdown puts an `<agent-note>` inside an
//      existing card is refused. Judged on the PLAN, so a retyped survivor is
//      caught as surely as a create.
//  P5. A card CREATED by `edit_page` is stamped with the calling conversation
//      (the provenance a human opens from the card's glyph). Every newly minted
//      card, not one known id.
//  P6. **The T3 attack.** An edit that re-indents the page's own prose under an
//      existing `<agent-note id="…">` is refused. It is a MOVE, not a creation —
//      the text is byte-identical so the aligner preserves the block's id — which
//      is exactly why the acceptance predicate has to test the OLD chain too.
//  P7. A private card survives a PAGE-scoped edit untouched, in all five columns.
//      The tool's report is not proof: a deleted card is simply unmentioned, and
//      a card re-ranked to the end of the page passes any row-existence check.
//
// Engine, through the notes-only surface:
//  E1. Every prose block on the page keeps its id across a write — which is what
//      keeps its content doc, undo history, backlinks, star and task link
//      attached to it.
//  E2. The edited block's text lands in BOTH owners: its content `Y.Doc` and the
//      `page_blocks.data.text` projection search / backlinks / history read.
//  E3. A browser with the page OPEN converges on the change.
//  E4. **The round trip is a fixed point.** `read_page`'s exact output, fed back
//      as a write, reports `{created:0, deleted:0, moved:0, text_edited:0}` — one
//      call proving the tag round trip, id-pinning and alignment together — and
//      leaves the same five-column snapshot behind.
//
// Manual only. Requires `./singularity build` first.
// Usage: bun plugins/page/plugins/annotations/plugins/agent-access/e2e/agent-access-verify.ts [--base <url>] [--out <path>]
import type { Page } from "playwright";
import {
  arg,
  baseUrl,
  report,
  snap,
  withBrowser,
  agentFetch,
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";
import {
  blockIdOf,
  editableBlocks,
  openBlankPage,
} from "@plugins/page/plugins/editor/e2e";
import { fetchBlockDocText } from "@plugins/page/plugins/editor-collab/e2e";
import { plainOf, type Block } from "@plugins/page/plugins/editor/core";

const base = baseUrl();
const out = arg("out", "/tmp/agent-access");

/** The conversation the MCP calls below are attributed to (P5 reads it back). */
const CONVERSATION = "e2e-agent-access";

/** Set on the page row, so the `# Title` banner is a line worth attacking. */
const TITLE = "Parser notes";
const LINES = ["alpha one", "bravo two", "charlie three"];
const SECRET = "do not tell the agent";
// What an agent actually writes: a paragraph, a blank line, then a list. Under
// the blank-line dialect that is FOUR blocks — the blank line is an empty
// paragraph, not spacing — and all four land inside the card, so this stays a
// legal write. Keeping the realistic shape is the point: it is what the round
// trip below (E4) has to be a fixed point over.
const NOTE_MD =
  "found two call sites\n\n- one in the parser\n- one in the writer";
const NOTE_FIRST = "found two call sites";
const NOTE_EDITED = "found three call sites";
const CARD_TAG = "agent-note";

const r = report();

/** Record one failure and stop. Used where nothing further is checkable. */
async function bail(name: string, detail: string): Promise<never> {
  r.fail(name, detail);
  return await r.finish();
}

interface ToolCall {
  ok: boolean;
  /** The tool's text content — its result, or the error message it refused with. */
  text: string;
}

/**
 * Call one MCP tool over the HTTP MCP endpoint.
 *
 * Returns the refusal rather than throwing it: half the assertions here are
 * ABOUT refusals, and a refusal that reads as a transport failure would be
 * indistinguishable from the tool not existing.
 */
async function callTool(name: string, args: unknown): Promise<ToolCall> {
  const res = await agentFetch(`/api/mcp/${CONVERSATION}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(`MCP ${name}: HTTP ${res.status} — ${raw}`);
  // The transport answers with plain JSON (`enableJsonResponse`), but the same
  // endpoint is allowed to answer SSE; accept both rather than depending on
  // which one the SDK picked today.
  const payload =
    raw.startsWith("event:") || raw.startsWith("data:")
      ? raw
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice("data:".length).trim())
          .join("")
      : raw;
  const body = JSON.parse(payload) as {
    error?: { message?: string };
    result?: { isError?: boolean; content?: { text?: string }[] };
  };
  if (body.error) return { ok: false, text: body.error.message ?? "error" };
  const text = body.result?.content?.[0]?.text;
  if (text === undefined)
    throw new Error(`MCP ${name}: no text content — ${raw}`);
  return { ok: body.result?.isError !== true, text };
}

/** A tool call that must succeed; its text, or a bail. */
async function mustCall(name: string, args: unknown): Promise<string> {
  const call = await callTool(name, args);
  if (!call.ok) return await bail(`${name} succeeds`, call.text);
  return call.text;
}

/** What a write reports it did. `note_ids` are the cards it was attributed to. */
interface ApplySummary {
  note_ids?: string[];
  created?: number;
  deleted?: number;
  moved?: number;
  text_edited?: number;
  created_ids?: string[];
}

/** A write that must succeed, with its summary parsed. */
async function mustWrite(name: string, args: unknown): Promise<ApplySummary> {
  return JSON.parse(await mustCall(name, args)) as ApplySummary;
}

/** `{created, deleted, moved, text_edited}` — the four numbers a fixed point zeroes. */
function counts(summary: ApplySummary): Record<string, number | undefined> {
  return {
    created: summary.created,
    deleted: summary.deleted,
    moved: summary.moved,
    text_edited: summary.text_edited,
  };
}

/** The page's rows, straight off the live-state resource endpoint. */
async function fetchBlocks(pageId: string): Promise<Block[]> {
  const res = await agentFetch(
    `/api/resources/page-blocks?pageId=${encodeURIComponent(pageId)}`,
  );
  if (!res.ok) throw new Error(`page-blocks ${pageId}: HTTP ${res.status}`);
  const body = (await res.json()) as { value?: Block[] };
  if (!body.value)
    throw new Error(`page-blocks ${pageId}: response carried no value`);
  return body.value;
}

/** A row's projected plain text (`data.text`). */
function rowText(block: Block): string {
  const data = block.data;
  const text =
    data !== null && typeof data === "object"
      ? (data as { text?: unknown }).text
      : undefined;
  return plainOf(text);
}

/**
 * The five columns a write can move a row through: `(id, type, parent_id, rank,
 * data->>'text')`.
 *
 * `(id, text)` — what this spec used to compare — is blind to exactly the
 * failure modes the plan-judged write introduces: a card silently re-parented
 * into the agent's own, or re-ranked to the bottom of the page, survives an
 * id-and-text comparison unchanged. Rank is in here deliberately and is the
 * strictest column: minting a card beside a redacted row is precisely where a
 * hidden row's key would be overwritten.
 */
type Snapshot = Map<string, string>;

async function snapshot(pageId: string): Promise<Snapshot> {
  const rows = await fetchBlocks(pageId);
  return new Map(
    rows.map(
      (b) =>
        [
          b.id,
          `${b.type}|${b.parentId ?? "-"}|${b.rank}|${rowText(b)}`,
        ] as const,
    ),
  );
}

/** Every row that appeared, vanished or changed between two snapshots. */
function snapshotDiff(before: Snapshot, after: Snapshot): string[] {
  const lines: string[] = [];
  for (const [id, row] of before) {
    const now = after.get(id);
    if (now === undefined) lines.push(`-${id} ${row}`);
    else if (now !== row) lines.push(`~${id} ${row} => ${now}`);
  }
  for (const [id, row] of after)
    if (!before.has(id)) lines.push(`+${id} ${row}`);
  return lines;
}

/** Set the page's own title, so the `# Title` banner is not an empty line. */
async function setPageTitle(
  page: Page,
  pageId: string,
  title: string,
): Promise<void> {
  await page.evaluate(
    async ({ id, value }) => {
      const res = await fetch(`/api/blocks/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ data: { title: value, icon: null } }),
      });
      if (!res.ok)
        throw new Error(`PATCH /api/blocks ${res.status}: ${await res.text()}`);
    },
    { id: pageId, value: title },
  );
}

/** Seed a `/private` card holding one line, through the write boundary. */
async function seedPrivateCard(
  page: Page,
  pageId: string,
  secret: string,
): Promise<{ card: string; child: string }> {
  return page.evaluate(
    async ({ parent, line }) => {
      const post = async (body: unknown): Promise<{ id: string }> => {
        const res = await fetch("/api/blocks", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok)
          throw new Error(
            `POST /api/blocks ${res.status}: ${await res.text()}`,
          );
        return (await res.json()) as { id: string };
      };
      const card = await post({
        parentId: parent,
        type: "private-note",
        data: {},
      });
      const child = await post({
        parentId: card.id,
        type: "text",
        data: { text: [{ text: line }] },
      });
      return { card: card.id, child: child.id };
    },
    { parent: pageId, line: secret },
  );
}

/** The conversations recorded as authors of one agent-note card. */
async function fetchAuthors(blockId: string): Promise<string[]> {
  const res = await agentFetch(
    `/api/resources/agent-notes-authors?blockId=${encodeURIComponent(blockId)}`,
  );
  if (!res.ok)
    throw new Error(`agent-notes-authors ${blockId}: HTTP ${res.status}`);
  const body = (await res.json()) as { value?: { conversationId: string }[] };
  return (body.value ?? []).map((a) => a.conversationId);
}

await withBrowser(async (h) => {
  const { page } = await h.session({ label: "reader" });
  const { pageId } = await openBlankPage(page, base, { settleMs: 2500 });

  // Three ordinary paragraphs, typed like a human so their docs are real
  // browser-authored CRDT state (not a server seed).
  for (const [i, line] of LINES.entries()) {
    if (i > 0) {
      await page.keyboard.press("Enter");
      await page.waitForTimeout(150);
    }
    await page.keyboard.type(line, { delay: 10 });
  }
  // Long enough for the ~300ms doc flush AND the ~1s data.text projection.
  await page.waitForTimeout(2500);

  const blocks = editableBlocks(page);
  const proseIds: string[] = [];
  for (let i = 0; i < LINES.length; i++)
    proseIds.push(await blockIdOf(blocks.nth(i)));
  r.ok(
    "three prose blocks typed",
    proseIds.length === 3 && new Set(proseIds).size === 3,
    JSON.stringify(proseIds),
  );

  await setPageTitle(page, pageId, TITLE);
  const priv = await seedPrivateCard(page, pageId, SECRET).catch(
    (err: unknown): Promise<never> =>
      bail(
        "seed: a /private card posts through the write boundary",
        `${err instanceof Error ? err.message : String(err)} — nothing below is checkable`,
      ),
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);

  // --- P4 (creation) / P5 / P7. a tagless <agent-note> mints a card ----------
  // The ONLY way an agent adds anything now: there is no append tool, so the tag
  // in the document is the create.
  const beforeCreate = await snapshot(pageId);
  const created = await mustWrite("edit_page", {
    block_id: pageId,
    old_string: LINES[1]!,
    // One `\n`, not two: a blank line here is an empty paragraph at ROOT, outside
    // every card, which the notes-only rule refuses — and the refusal would look
    // nothing like this case's subject.
    new_string: `${LINES[1]!}\n<${CARD_TAG}>\n${NOTE_MD}\n</${CARD_TAG}>`,
  });
  const noteId = created.note_ids?.[0];
  if (noteId === undefined) {
    return await bail(
      "edit_page reports the card it minted",
      JSON.stringify(created),
    );
  }

  const rowsAfterCreate = await fetchBlocks(pageId);
  const card = rowsAfterCreate.find((b) => b.id === noteId);
  r.ok(
    `a tagless <${CARD_TAG}> minted a card under the page`,
    card?.type === CARD_TAG && card.parentId === pageId,
    JSON.stringify(card ?? null),
  );
  // Four children, not three: the blank line inside `NOTE_MD` is an empty
  // paragraph. Exactly one of them is empty — asserted rather than counted, so a
  // fourth block appearing for some OTHER reason still fails this.
  const cardChildren = rowsAfterCreate.filter((b) => b.parentId === noteId);
  r.ok(
    "the markdown became the card's CHILDREN (not a nested card), blank line included",
    cardChildren.length === 4 &&
      cardChildren.filter((b) => rowText(b) === "").length === 1 &&
      rowsAfterCreate.every((b) => b.id === noteId || b.type !== CARD_TAG),
    JSON.stringify(cardChildren.map((b) => [b.type, rowText(b)])),
  );
  r.ok(
    "the create touched no prose block — every one is still there",
    proseIds.every((id) => rowsAfterCreate.some((b) => b.id === id)),
    JSON.stringify(proseIds),
  );

  // P5, retargeted: the stamp lands on a card MINTED by this write, not on an id
  // the tool was handed. That is the new code path — every newly minted card is
  // resolved out of the plan and stamped after the patch commits.
  const authors = await fetchAuthors(noteId);
  r.ok(
    "P5: the minted card is stamped with the calling conversation",
    authors.includes(CONVERSATION),
    JSON.stringify(authors),
  );

  // P7. The private card is not in the document this edit was written against,
  // so nothing in the plan may have moved it — including its RANK, which is the
  // column a "the row still exists" check cannot see.
  const afterCreate = await snapshot(pageId);
  r.ok(
    "P7: the private card and its child survive a page-scoped edit in all five columns",
    beforeCreate.get(priv.card) !== undefined &&
      beforeCreate.get(priv.card) === afterCreate.get(priv.card) &&
      beforeCreate.get(priv.child) !== undefined &&
      beforeCreate.get(priv.child) === afterCreate.get(priv.child),
    JSON.stringify({
      card: [beforeCreate.get(priv.card), afterCreate.get(priv.card)],
      child: [beforeCreate.get(priv.child), afterCreate.get(priv.child)],
    }),
  );
  r.ok(
    "P7: the edit deleted nothing anywhere on the page",
    snapshotDiff(beforeCreate, afterCreate).every(
      (line) => !line.startsWith("-"),
    ),
    JSON.stringify(snapshotDiff(beforeCreate, afterCreate)),
  );

  // --- P1. lossless AND redacting, in one output ----------------------------
  const markdown = await mustCall("read_page", { block_id: pageId });
  r.ok(
    "P1: read_page returns the page's prose and its title banner",
    LINES.every((line) => markdown.includes(line)) &&
      markdown.startsWith(`# ${TITLE}`),
    JSON.stringify(markdown),
  );
  r.ok(
    "P1: read_page emits the card's id as an address",
    markdown.includes(`<${CARD_TAG} id="${noteId}">`),
    JSON.stringify(markdown),
  );
  r.ok(
    "P1: read_page omits the private card, its contents AND its tag",
    !markdown.includes(SECRET) && !markdown.includes("private-note"),
    JSON.stringify(markdown),
  );

  // --- P3. naming a block inside the card is not a way around that -----------
  for (const [label, id] of [
    ["the card itself", priv.card],
    ["a block inside it", priv.child],
  ] as const) {
    const refused = await callTool("read_page", { block_id: id });
    r.ok(
      `P3: read_page refuses ${label}`,
      !refused.ok && /withheld from agents/.test(refused.text),
      refused.text,
    );
  }

  // --- E4. the round trip is a fixed point ----------------------------------
  // `read_page`'s ENTIRE output goes back in as `old_string`, replaced by itself
  // plus one trailing newline — the smallest change the tool's "old and new must
  // differ" contract accepts, and one a markdown parse cannot see. So what is
  // planned is the read's own document, and every zero below is the tag round
  // trip, the id pinning and the alignment all agreeing at once.
  const beforeRoundTrip = await snapshot(pageId);
  const roundTrip = await mustWrite("edit_page", {
    block_id: pageId,
    old_string: markdown,
    new_string: `${markdown}\n`,
  });
  r.eq(
    "E4: feeding read_page's output back writes nothing",
    counts(roundTrip),
    {
      created: 0,
      deleted: 0,
      moved: 0,
      text_edited: 0,
    },
  );
  const afterRoundTrip = await snapshot(pageId);
  r.ok(
    "E4: and the five-column snapshot is byte-identical",
    snapshotDiff(beforeRoundTrip, afterRoundTrip).length === 0,
    JSON.stringify(snapshotDiff(beforeRoundTrip, afterRoundTrip)),
  );

  // The card-scoped half of the same law: `read_page(card)` is exactly what
  // `write_agent_note(card)` takes, so re-writing it changes nothing either.
  const cardMarkdown = await mustCall("read_page", { block_id: noteId });
  const rewrite = await mustWrite("write_agent_note", {
    block_id: noteId,
    content: cardMarkdown,
  });
  r.eq(
    "E4: write_agent_note of the card's own read is a fixed point too",
    counts(rewrite),
    {
      created: 0,
      deleted: 0,
      moved: 0,
      text_edited: 0,
    },
  );

  // --- P2 / P4 / P6. everything an agent may NOT do -------------------------
  // Every entry is an EDIT the tools accept the shape of; what refuses it is the
  // acceptance predicate, the type rule, or the read door.
  // The prose line that FOLLOWS the card, and the same line moved inside it —
  // written the way the serializer writes a card's children (one two-space
  // indent), so the parse reads it as a child rather than as a stray line.
  const closeThenProse = `</${CARD_TAG}>\n${LINES[2]!}`;
  const proseIntoCard = `  ${LINES[2]!}\n</${CARD_TAG}>`;
  r.ok(
    "the T3 attack is expressible against the document as read",
    markdown.includes(closeThenProse),
    JSON.stringify(markdown),
  );

  const refusals: [
    name: string,
    tool: string,
    args: unknown,
    expect: RegExp,
  ][] = [
    [
      "P6/T3: re-indenting the page's prose INTO the card (a move, id preserved)",
      "edit_page",
      {
        block_id: pageId,
        old_string: closeThenProse,
        new_string: proseIntoCard,
      },
      /did not COME from inside/,
    ],
    [
      "P2: rewriting a prose block",
      "edit_page",
      { block_id: pageId, old_string: LINES[0]!, new_string: "hijacked" },
      new RegExp(`outside every "${CARD_TAG}" card`),
    ],
    [
      "P4: nesting a card inside the card",
      "edit_page",
      {
        block_id: pageId,
        old_string: NOTE_FIRST,
        new_string: `${NOTE_FIRST}\n<${CARD_TAG}>\nnested\n</${CARD_TAG}>`,
      },
      /do not nest/,
    ],
    [
      "P2: minting a private card inside its own",
      "edit_page",
      {
        block_id: pageId,
        old_string: NOTE_FIRST,
        new_string: `${NOTE_FIRST}\n<private-note>\nsneaky\n</private-note>`,
      },
      /addressed to the page's author only/,
    ],
    [
      "P2: claiming an id that names no card",
      "edit_page",
      {
        block_id: pageId,
        old_string: `<${CARD_TAG} id="${noteId}">`,
        new_string: `<${CARD_TAG} id="block-does-not-exist">`,
      },
      /names no addressable/,
    ],
    [
      "P2: rewriting the page's title banner",
      "edit_page",
      { block_id: pageId, old_string: `# ${TITLE}`, new_string: "# Hijacked" },
      /TITLE and not a block/,
    ],
    [
      "P3: scoping an edit to a block inside the private card",
      "edit_page",
      { block_id: priv.child, old_string: SECRET, new_string: "hijacked" },
      /withheld from agents/,
    ],
    [
      "P2: old_string that is not in the document",
      "edit_page",
      { block_id: pageId, old_string: SECRET, new_string: "hijacked" },
      /was not found/,
    ],
    [
      "P2: an edit that asks for no change",
      "edit_page",
      { block_id: pageId, old_string: NOTE_FIRST, new_string: NOTE_FIRST },
      /identical/,
    ],
    [
      "P2: write_agent_note at a prose block",
      "write_agent_note",
      { block_id: proseIds[1]!, content: "hijacked" },
      new RegExp(`is not an "${CARD_TAG}" card`),
    ],
    [
      "P2: write_agent_note at the page",
      "write_agent_note",
      { block_id: pageId, content: "hijacked" },
      new RegExp(`is the page itself, not an "${CARD_TAG}" card`),
    ],
    [
      "P2: write_agent_note at the private card",
      "write_agent_note",
      { block_id: priv.card, content: "hijacked" },
      new RegExp(`is not an "${CARD_TAG}" card`),
    ],
  ];

  const beforeRefusals = await snapshot(pageId);
  for (const [name, tool, args, expect] of refusals) {
    const refused = await callTool(tool, args);
    r.ok(
      `refused: ${name}`,
      !refused.ok && expect.test(refused.text),
      refused.text,
    );
  }
  const afterRefusals = await snapshot(pageId);
  r.ok(
    "P2: no refusal wrote anything — set-equality on all five columns",
    snapshotDiff(beforeRefusals, afterRefusals).length === 0,
    JSON.stringify(snapshotDiff(beforeRefusals, afterRefusals)),
  );

  // --- E1 / E2. a real write into the card, and what it may touch -----------
  const noteChildId = rowsAfterCreate.find(
    (b) => b.parentId === noteId && rowText(b) === NOTE_FIRST,
  )?.id;
  if (noteChildId === undefined) {
    return await bail(
      "the minted card has an addressable first line",
      JSON.stringify(NOTE_MD),
    );
  }

  const edit = await mustWrite("edit_page", {
    block_id: pageId,
    old_string: NOTE_FIRST,
    new_string: NOTE_EDITED,
  });
  r.eq(
    "a page-scoped edit INSIDE the card is exactly one text edit",
    counts(edit),
    {
      created: 0,
      deleted: 0,
      moved: 0,
      text_edited: 1,
    },
  );
  r.ok(
    "the edit is attributed to the card it landed in",
    (edit.note_ids ?? []).includes(noteId),
    JSON.stringify(edit.note_ids ?? null),
  );

  // Let the doc-update push reach the open tab and the projection settle.
  await page.waitForTimeout(2500);

  const rowsAfterEdit = await fetchBlocks(pageId);
  r.ok(
    "E1: every prose block kept its id AND its text",
    proseIds.every((id, i) => {
      const row = rowsAfterEdit.find((b) => b.id === id);
      return row !== undefined && rowText(row) === LINES[i];
    }),
    JSON.stringify(rowsAfterEdit.map((b) => [b.id, b.type, rowText(b)])),
  );
  const finalSnapshot = await snapshot(pageId);
  r.ok(
    "E1: the private card and its contents are untouched, in all five columns",
    beforeRefusals.get(priv.card) === finalSnapshot.get(priv.card) &&
      beforeRefusals.get(priv.child) === finalSnapshot.get(priv.child),
    JSON.stringify([
      finalSnapshot.get(priv.card),
      finalSnapshot.get(priv.child),
    ]),
  );

  const docAfter = await fetchBlockDocText(noteChildId);
  r.ok(
    "E2: the content doc holds the edit",
    docAfter === NOTE_EDITED,
    JSON.stringify(docAfter),
  );
  const editedRow = rowsAfterEdit.find((b) => b.id === noteChildId);
  r.ok(
    "E2: data.text was projected from the doc",
    editedRow !== undefined && rowText(editedRow) === NOTE_EDITED,
    JSON.stringify(editedRow ? rowText(editedRow) : null),
  );

  // --- E3. the open editor converged ---------------------------------------
  // By block id, not by position: the card sits between `bravo` and `charlie`,
  // so the editable-line order is no longer the prose order.
  const rendered: string[] = [];
  for (const id of proseIds) {
    rendered.push(
      (await page.locator(`[data-block-id="${id}"]`).first().innerText())
        .replace(/ /g, " ")
        .trim(),
    );
  }
  r.ok(
    "E3: the already-open editor still shows the prose it had",
    JSON.stringify(rendered) === JSON.stringify(LINES),
    JSON.stringify(rendered),
  );
  r.ok(
    "E3: the open editor shows the edited note",
    (
      await page.locator(`[data-block-id="${noteChildId}"]`).first().innerText()
    ).includes(NOTE_EDITED),
    NOTE_EDITED,
  );

  await snap(page, out, "after-notes");
  await r.finish();
});
