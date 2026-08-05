// Agent access to a page: what an agent may see, and what it may write.
//
// This file is the executable statement of BOTH halves — the policy this plugin
// adds, and the engine guarantee it inherits from `page/markdown-apply` (whose
// own end-to-end spec moved here with the tools, since the engine has no
// agent-facing surface of its own any more).
//
// Policy:
//  P1. `read_page` omits a `/private-notes` card ENTIRELY — the card, its
//      children, and any trace of it.
//  P2. A write can only address an `<agent-notes>` card: pointing one at a prose
//      block, at a private card, or at the page refuses LOUDLY.
//  P3. A block INSIDE a private card cannot be read — the id itself is not a
//      bypass.
//  P4. Notes do not nest: appending under an agent-notes card refuses.
//  P5. `append_agent_notes` stamps the calling conversation onto the card it
//      mints (the provenance a human opens from the card's glyph).
//
// Engine, through the notes-only surface:
//  E1. Every prose block on the page keeps its id across a write — which is what
//      keeps its content doc, undo history, backlinks, star and task link
//      attached to it.
//  E2. The edited block's text lands in BOTH owners: its content `Y.Doc` and the
//      `page_blocks.data.text` projection search / backlinks / history read.
//  E3. A browser with the page OPEN converges on the change.
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
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";
import {
  blockIdOf,
  blockText,
  editableBlocks,
  openBlankPage,
} from "@plugins/page/plugins/editor/e2e";
import { fetchBlockDocText } from "@plugins/page/plugins/editor-collab/e2e";
import { plainOf, type Block } from "@plugins/page/plugins/editor/core";

const base = baseUrl();
const out = arg("out", "/tmp/agent-access");

/** The conversation the MCP calls below are attributed to (P5 reads it back). */
const CONVERSATION = "e2e-agent-access";

const LINES = ["alpha one", "bravo two", "charlie three"];
const SECRET = "do not tell the agent";
const NOTE_MD = "found two call sites\n\n- one in the parser\n- one in the writer";
const NOTE_EDITED = "found three call sites";

const r = report();

/** Record one failure and stop. Used where nothing further is checkable. */
function bail(name: string, detail: string): never {
  r.fail(name, detail);
  return r.finish();
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
  const res = await fetch(`${base}/api/mcp/${CONVERSATION}`, {
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
  if (text === undefined) throw new Error(`MCP ${name}: no text content — ${raw}`);
  return { ok: body.result?.isError !== true, text };
}

/** A tool call that must succeed; its text, or a bail. */
async function mustCall(name: string, args: unknown): Promise<string> {
  const call = await callTool(name, args);
  if (!call.ok) bail(`${name} succeeds`, call.text);
  return call.text;
}

/** The page's rows, straight off the live-state resource endpoint. */
async function fetchBlocks(pageId: string): Promise<Block[]> {
  const res = await fetch(
    `${base}/api/resources/page-blocks?pageId=${encodeURIComponent(pageId)}`,
  );
  if (!res.ok) throw new Error(`page-blocks ${pageId}: HTTP ${res.status}`);
  const body = (await res.json()) as { value?: Block[] };
  if (!body.value) throw new Error(`page-blocks ${pageId}: response carried no value`);
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

/** Seed a `/private-notes` card holding one line, through the write boundary. */
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
        if (!res.ok) throw new Error(`POST /api/blocks ${res.status}: ${await res.text()}`);
        return (await res.json()) as { id: string };
      };
      const card = await post({ parentId: parent, type: "private-notes", data: {} });
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

/** The conversations recorded as authors of one agent-notes card. */
async function fetchAuthors(blockId: string): Promise<string[]> {
  const res = await fetch(
    `${base}/api/resources/agent-notes-authors?blockId=${encodeURIComponent(blockId)}`,
  );
  if (!res.ok) throw new Error(`agent-notes-authors ${blockId}: HTTP ${res.status}`);
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
  for (let i = 0; i < LINES.length; i++) proseIds.push(await blockIdOf(blocks.nth(i)));
  r.ok(
    "three prose blocks typed",
    proseIds.length === 3 && new Set(proseIds).size === 3,
    JSON.stringify(proseIds),
  );

  const priv = await seedPrivateCard(page, pageId, SECRET).catch((err: unknown): never =>
    bail(
      "seed: a /private-notes card posts through the write boundary",
      `${err instanceof Error ? err.message : String(err)} — nothing below is checkable`,
    ),
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);

  // --- P1. the private card is not in what an agent reads --------------------
  const markdown = await mustCall("read_page", { blockId: pageId });
  r.ok(
    "read_page returns the page's prose",
    LINES.every((line) => markdown.includes(line)),
    JSON.stringify(markdown),
  );
  r.ok(
    "read_page omits the private card, its contents AND its tag",
    !markdown.includes(SECRET) && !markdown.includes("private-notes"),
    JSON.stringify(markdown),
  );

  // --- P3. naming a block inside the card is not a way around that -----------
  for (const [label, id] of [
    ["the card itself", priv.card],
    ["a block inside it", priv.child],
  ] as const) {
    const refused = await callTool("read_page", { blockId: id });
    r.ok(
      `read_page refuses ${label}`,
      !refused.ok && /withheld from agents/.test(refused.text),
      refused.text,
    );
  }

  // --- append: the only way an agent adds anything --------------------------
  const appended = JSON.parse(
    await mustCall("append_agent_notes", { blockId: pageId, markdown: NOTE_MD }),
  ) as { note_id?: string; created?: number };
  const noteId = appended.note_id;
  if (noteId === undefined) bail("append_agent_notes returns the new card's id", JSON.stringify(appended));

  const rowsAfterAppend = await fetchBlocks(pageId);
  const card = rowsAfterAppend.find((b) => b.id === noteId);
  r.ok(
    "append_agent_notes minted an <agent-notes> card under the page",
    card?.type === "agent-notes" && card.parentId === pageId,
    JSON.stringify(card ?? null),
  );
  r.ok(
    "the markdown became the card's CHILDREN (not a nested card)",
    rowsAfterAppend.filter((b) => b.parentId === noteId).length === 3 &&
      rowsAfterAppend.every((b) => b.id === noteId || b.type !== "agent-notes"),
    JSON.stringify(
      rowsAfterAppend.filter((b) => b.parentId === noteId).map((b) => [b.type, rowText(b)]),
    ),
  );
  r.ok(
    "append created ONLY its own rows — every prose block is still there",
    proseIds.every((id) => rowsAfterAppend.some((b) => b.id === id)),
    JSON.stringify(proseIds),
  );

  // --- P5. the card records who wrote it ------------------------------------
  const authors = await fetchAuthors(noteId);
  r.ok(
    "the new card is stamped with the calling conversation",
    authors.includes(CONVERSATION),
    JSON.stringify(authors),
  );

  // --- P2 / P4. everything an agent may NOT address -------------------------
  const refusals: [name: string, tool: string, args: unknown, expect: RegExp][] = [
    ["write_agent_notes at a prose block", "write_agent_notes", { noteId: proseIds[1]!, markdown: "hijacked" }, /not an "agent-notes" card/],
    ["write_agent_notes at the page", "write_agent_notes", { noteId: pageId, markdown: "hijacked" }, /not an "agent-notes" card/],
    ["write_agent_notes at the private card", "write_agent_notes", { noteId: priv.card, markdown: "hijacked" }, /not an "agent-notes" card/],
    ["edit_agent_notes at a prose block", "edit_agent_notes", { noteId: proseIds[1]!, oldString: LINES[1]!, newString: "hijacked" }, /not an "agent-notes" card/],
    ["append_agent_notes inside the notes card", "append_agent_notes", { blockId: noteId, markdown: "nested" }, /do not nest/],
    ["append_agent_notes inside the private card", "append_agent_notes", { blockId: priv.card, markdown: "sneaky" }, /withheld from agents/],
  ];
  for (const [name, tool, args, expect] of refusals) {
    const refused = await callTool(tool, args);
    r.ok(`refused: ${name}`, !refused.ok && expect.test(refused.text), refused.text);
  }

  const rowsAfterRefusals = await fetchBlocks(pageId);
  const textById = (rows: Block[]): string =>
    JSON.stringify(
      rows
        .map((b): [string, string] => [b.id, rowText(b)])
        .sort((a, b) => a[0].localeCompare(b[0])),
    );
  r.ok(
    "no refusal wrote anything",
    textById(rowsAfterRefusals) === textById(rowsAfterAppend),
    `${rowsAfterAppend.length} rows -> ${rowsAfterRefusals.length} rows`,
  );

  // --- E1 / E2. a real write into the card, and what it may touch -----------
  const noteChildId = rowsAfterAppend.find(
    (b) => b.parentId === noteId && rowText(b) === "found two call sites",
  )?.id;
  if (noteChildId === undefined) {
    bail("the appended card has an addressable first line", JSON.stringify(NOTE_MD));
  }

  const summary = JSON.parse(
    await mustCall("edit_agent_notes", {
      noteId,
      oldString: "found two call sites",
      newString: NOTE_EDITED,
    }),
  ) as { created?: number; deleted?: number; moved?: number; text_edited?: number };
  r.ok(
    "edit_agent_notes created / deleted / moved NOTHING",
    summary.created === 0 && summary.deleted === 0 && summary.moved === 0,
    JSON.stringify(summary),
  );
  r.ok(
    "edit_agent_notes reports exactly one text edit",
    summary.text_edited === 1,
    JSON.stringify(summary),
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
  const privChildAfter = rowsAfterEdit.find((b) => b.id === priv.child);
  r.ok(
    "E1: the private card and its contents are untouched",
    rowsAfterEdit.some((b) => b.id === priv.card) &&
      privChildAfter !== undefined &&
      rowText(privChildAfter) === SECRET,
    JSON.stringify(privChildAfter ?? null),
  );

  const docAfter = await fetchBlockDocText(base, noteChildId);
  r.ok("E2: the content doc holds the edit", docAfter === NOTE_EDITED, JSON.stringify(docAfter));
  const editedRow = rowsAfterEdit.find((b) => b.id === noteChildId);
  r.ok(
    "E2: data.text was projected from the doc",
    editedRow !== undefined && rowText(editedRow) === NOTE_EDITED,
    JSON.stringify(editedRow ? rowText(editedRow) : null),
  );

  // --- E3. the open editor converged ---------------------------------------
  const rendered: string[] = [];
  for (let i = 0; i < LINES.length; i++) rendered.push(await blockText(blocks.nth(i)));
  r.ok(
    "E3: the already-open editor still shows the prose it had",
    JSON.stringify(rendered) === JSON.stringify(LINES),
    JSON.stringify(rendered),
  );
  r.ok(
    "E3: the open editor shows the edited note",
    (await page.locator(`[data-block-id="${noteChildId}"]`).first().innerText()).includes(
      NOTE_EDITED,
    ),
    NOTE_EDITED,
  );

  await snap(page, out, "after-notes");
  r.finish();
});
