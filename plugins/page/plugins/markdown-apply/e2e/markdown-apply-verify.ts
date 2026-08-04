// Markdown apply: the load-bearing claim, end to end.
//
// An agent edits one word of a page through `edit_page` while a browser has
// that page OPEN, and:
//
//  A. every surviving block keeps its id — which is what keeps its content
//     doc, undo history, backlinks, star and task link attached to it (the
//     whole reason this exists instead of `replacePageContent`);
//  B. the edited block's text is updated in BOTH owners: its content `Y.Doc`
//     (the truth) and `page_blocks.data.text` (the projection search /
//     backlinks / history read) — a doc write with no projection would leave
//     the row stale forever on a page nobody has open;
//  C. the untouched blocks' docs are byte-untouched (nothing was rewritten
//     "just in case");
//  D. the already-open editor CONVERGED on the change rather than being
//     clobbered or fighting it.
//
// Manual only. Requires `./singularity build` first.
// Usage: bun plugins/page/plugins/markdown-apply/e2e/markdown-apply-verify.ts [--base <url>] [--out <path>]
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
const out = arg("out", "/tmp/markdown-apply");

const LINES = ["alpha one", "bravo two", "charlie three"];
const EDITED = "bravo TWO";

/**
 * Call one MCP tool over the HTTP MCP endpoint and return its text content.
 *
 * The conversation id is arbitrary: these tools never read `ctx.conversationId`
 * (a page edit has no conversation), and the endpoint only requires the segment
 * to be present.
 */
async function callTool(name: string, args: unknown): Promise<string> {
  const res = await fetch(`${base}/api/mcp/e2e-markdown-apply`, {
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
  const payload = raw.startsWith("event:") || raw.startsWith("data:")
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
  if (body.error) throw new Error(`MCP ${name}: ${body.error.message ?? "error"}`);
  const text = body.result?.content?.[0]?.text;
  if (body.result?.isError) throw new Error(`MCP ${name} returned an error: ${text}`);
  if (text === undefined) throw new Error(`MCP ${name}: no text content — ${raw}`);
  return text;
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

const r = report();

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
  const idsBefore: string[] = [];
  for (let i = 0; i < LINES.length; i++) {
    idsBefore.push(await blockIdOf(blocks.nth(i)));
  }
  r.ok(
    "three blocks typed",
    idsBefore.length === 3 && new Set(idsBefore).size === 3,
    JSON.stringify(idsBefore),
  );

  const docsBefore = await Promise.all(
    idsBefore.map((id) => fetchBlockDocText(base, id)),
  );
  r.ok(
    "content docs hold the typed text",
    JSON.stringify(docsBefore) === JSON.stringify(LINES),
    JSON.stringify(docsBefore),
  );

  // --- read_page ------------------------------------------------------------
  const markdown = await callTool("read_page", { pageId });
  r.ok(
    "read_page returns the typed document",
    LINES.every((line) => markdown.includes(line)),
    JSON.stringify(markdown),
  );

  // --- edit_page: one word, in the middle block -----------------------------
  const summary = await callTool("edit_page", {
    pageId,
    oldString: LINES[1]!,
    newString: EDITED,
  });
  const stats = JSON.parse(summary) as {
    created?: number;
    deleted?: number;
    moved?: number;
    text_edited?: number;
  };
  r.ok(
    "edit_page created / deleted / moved NOTHING",
    stats.created === 0 && stats.deleted === 0 && stats.moved === 0,
    summary,
  );
  r.ok("edit_page reports exactly one text edit", stats.text_edited === 1, summary);

  // Let the doc-update push reach the open tab and the projection settle.
  await page.waitForTimeout(2500);

  // --- A. identity ----------------------------------------------------------
  const idsAfter: string[] = [];
  for (let i = 0; i < LINES.length; i++) {
    idsAfter.push(await blockIdOf(blocks.nth(i)));
  }
  r.ok(
    "surviving block ids are unchanged",
    JSON.stringify(idsAfter) === JSON.stringify(idsBefore),
    `${JSON.stringify(idsBefore)} -> ${JSON.stringify(idsAfter)}`,
  );

  // --- B. both owners updated ----------------------------------------------
  const editedId = idsBefore[1]!;
  const docAfter = await fetchBlockDocText(base, editedId);
  r.ok("the content doc holds the edit", docAfter === EDITED, JSON.stringify(docAfter));

  const rows = await fetchBlocks(pageId);
  const editedRow = rows.find((b) => b.id === editedId);
  r.ok(
    "data.text was projected from the doc",
    editedRow !== undefined && rowText(editedRow) === EDITED,
    JSON.stringify(editedRow ? rowText(editedRow) : null),
  );

  // --- C. nothing else was rewritten ---------------------------------------
  const untouched = await Promise.all(
    [idsBefore[0]!, idsBefore[2]!].map((id) => fetchBlockDocText(base, id)),
  );
  r.ok(
    "untouched blocks' docs are unchanged",
    JSON.stringify(untouched) === JSON.stringify([LINES[0], LINES[2]]),
    JSON.stringify(untouched),
  );

  // --- D. the open editor converged ----------------------------------------
  const rendered: string[] = [];
  for (let i = 0; i < LINES.length; i++) {
    rendered.push(await blockText(blocks.nth(i)));
  }
  r.ok(
    "the already-open editor converged (not clobbered)",
    JSON.stringify(rendered) === JSON.stringify([LINES[0], EDITED, LINES[2]]),
    JSON.stringify(rendered),
  );

  await snap(page, out, "after-edit");
  r.finish();
});
