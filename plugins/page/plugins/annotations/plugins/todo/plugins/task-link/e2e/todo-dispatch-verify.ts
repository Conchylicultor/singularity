// Executable spec for DISPATCHING AN AGENT FROM A TODO CARD.
//
// The flow this pins, end to end: type `TODO …` to mint a card, open the panel
// its glyph carries, dispatch, and watch the card start reporting the task it is
// now bound to — in the UI and, through `read_page`, to every agent that reads
// the page.
//
//  1. The card's glyph is a TRIGGER on the editable surface (its three siblings'
//     glyphs are inert marks), and it opens the dispatch panel.
//  2. `POST /api/todo-blocks/:blockId/task` composes a prompt carrying the page
//     id, the block id and the card's own text, and links the card to a task in
//     the `pages` category.
//  3. **One task, many attempts.** A second dispatch from the same card returns
//     the SAME task id — the extension table's primary key IS the block id, so
//     this is a fact of the schema and not a check the endpoint remembers.
//  4. The card then reports the task: its glyph becomes the task's status icon
//     and the panel leads with the task's title.
//  5. A non-TODO block is refused with a 400 naming the type it actually is.
//
// **Nothing here presses Launch**, deliberately: `LaunchControl` would create a
// conversation, and a conversation is a real agent in a real worktree. The
// endpoint above is the whole of this feature's own server work — the attempt
// itself is `createConversation`'s existing `taskId`-without-`attemptId` branch,
// pinned by `page/prompt/block`'s own spec. So this script proves everything up
// to the model call and stops.
//
// What it deliberately does NOT cover, because they are not browser facts:
// the `<todo task_id="…" status="…">` attributes (read with `read_page` against
// a dispatched card) and the round trip that proves they parse back off
// (`edit_page` re-sending that document unchanged). Both are MCP-tool checks.
//
// Usage: bun plugins/page/plugins/annotations/plugins/todo/plugins/task-link/e2e/todo-dispatch-verify.ts [--base <url>] [--out /tmp/todo-dispatch]
import {
  arg,
  baseUrl,
  report,
  snap,
  withBrowser,
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";
import type { Page } from "playwright";
import { openBlankPage } from "@plugins/page/plugins/editor/e2e";

const base = baseUrl();
const out = arg("out", "/tmp/todo-dispatch");

const r = report();

const CARD_TEXT = "fix the UTF-16 path in decode.ts";

interface StoredRow {
  id: string;
  type: string;
  parentId: string | null;
}

interface DispatchResult {
  status: number;
  taskId?: string;
  prompt?: string;
  body?: string;
}

/** The page's live rows, straight off the same endpoint the editor reads. */
async function storedRows(page: Page, pageId: string): Promise<StoredRow[]> {
  return page.evaluate(async (id: string) => {
    const res = await fetch(`/api/pages/${id}/blocks`);
    if (!res.ok) throw new Error(`GET blocks ${res.status}: ${await res.text()}`);
    return (await res.json()) as StoredRow[];
  }, pageId);
}

/**
 * The resolved border colour of the document's one dashed box — the TODO card's
 * frame. Dashed is the annotation family's signature and this scratch page holds
 * exactly one annotation, so the box needs no other identification.
 *
 * `undefined` when no dashed box is painted, which is itself a failure the
 * caller reports rather than an absorbed empty answer.
 */
async function dashedBorder(page: Page): Promise<string | undefined> {
  return page.evaluate(() => {
    for (const el of document.querySelectorAll("div")) {
      const style = getComputedStyle(el);
      if (style.borderStyle === "dashed") return style.borderColor;
    }
    return undefined;
  });
}

/**
 * The dashed border once it differs from `from`, or its unchanged value at the
 * deadline — which the caller then reports as the failure it is.
 */
async function waitForBorderChange(
  page: Page,
  from: string | undefined,
  deadlineMs = 10_000,
): Promise<string | undefined> {
  const until = Date.now() + deadlineMs;
  for (;;) {
    const now = await dashedBorder(page);
    if (now !== from || Date.now() >= until) return now;
    await page.waitForTimeout(250);
  }
}

/**
 * One dispatch, as the panel's `getRequest` makes it. The status is returned
 * rather than thrown on, because a REFUSAL is one of the things under test.
 */
async function dispatch(
  page: Page,
  blockId: string,
  context: string,
): Promise<DispatchResult> {
  return page.evaluate(
    async ({ id, ctx }) => {
      const res = await fetch(`/api/todo-blocks/${id}/task`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ context: ctx || undefined }),
      });
      const text = await res.text();
      if (!res.ok) return { status: res.status, body: text };
      return { status: res.status, ...(JSON.parse(text) as object) };
    },
    { id: blockId, ctx: context },
  );
}

await withBrowser(async (h) => {
  const { page } = await h.session();
  const doc = await openBlankPage(page, base, { settleMs: 3000 });

  // --- 1. mint the card ------------------------------------------------------
  // The typed trigger, which `annotations-verify.ts` pins in full; here it is
  // just the cheapest way to a real card.
  await page.keyboard.type("TODO ");
  await page.waitForTimeout(800);
  await page.keyboard.type(CARD_TEXT);
  await page.waitForTimeout(2000);

  const rows = await storedRows(page, doc.pageId);
  const card = rows.find((b) => b.type === "todo");
  if (!card) {
    r.fail("a `todo` card was minted by typing `TODO `", JSON.stringify(rows));
    r.finish();
  }
  const cardId = card!.id;

  // --- 2. the glyph is a trigger, and it opens the panel ----------------------
  // `ContainerAnchor`'s interactive arm renders a real button with the anchor's
  // `triggerLabel` as its accessible name; the inert arm renders no button at
  // all. So finding one IS the assertion that this card has `sections`.
  const trigger = page.getByRole("button", { name: "Dispatch an agent" });
  const hasTrigger = (await trigger.count()) > 0;
  r.ok(
    "the card's glyph is a TRIGGER on the editable surface",
    hasTrigger,
    `buttons named "Dispatch an agent": ${await trigger.count()}`,
  );

  if (hasTrigger) {
    await trigger.first().click();
    await page.waitForTimeout(600);
    await snap(page, out, "1-panel-before-dispatch");
    // The context editor is Lexical, whose placeholder is a rendered NODE and
    // not an HTML `placeholder` attribute — so it is found by its text.
    r.ok(
      "the glyph opens the dispatch panel",
      (await page.getByText("Extra context (optional)…").count()) > 0 &&
        (await page.getByText("Dispatch an agent").count()) > 0,
      "extra-context editor + panel title visible",
    );
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  }

  // --- 3. the dispatch itself ------------------------------------------------
  const first = await dispatch(page, cardId, "prefer a table-driven decoder");
  r.ok(
    "POST /api/todo-blocks/:blockId/task returns a task id and a prompt",
    first.status === 200 && !!first.taskId && !!first.prompt,
    JSON.stringify(first),
  );

  const prompt = first.prompt ?? "";
  r.ok(
    "the prompt carries the page id, the block id, the card's text and the extra context",
    prompt.includes(doc.pageId) &&
      prompt.includes(cardId) &&
      prompt.includes(CARD_TEXT) &&
      prompt.includes("prefer a table-driven decoder"),
    prompt,
  );
  r.ok(
    "the prompt tells the agent where to write its findings back",
    prompt.includes("<agent-note>") && prompt.includes("read_page"),
    prompt,
  );

  // --- 4. one task, many attempts --------------------------------------------
  const second = await dispatch(page, cardId, "second dispatch, different notes");
  r.ok(
    "a SECOND dispatch returns the SAME task — one task per card, so this is a new attempt",
    second.status === 200 && second.taskId === first.taskId,
    JSON.stringify({ first: first.taskId, second: second.taskId }),
  );
  r.ok(
    "…and recomposes the prompt against the card as it reads NOW",
    (second.prompt ?? "").includes("second dispatch, different notes"),
    second.prompt ?? "",
  );

  // --- 5. the card now reports its task ---------------------------------------
  // The link is a live resource, so the glyph re-renders without a reload: a
  // fresh task is `new`, whose `STATUS_META` icon replaces the pending-actions
  // mark and whose trigger label changes with it.
  await page.waitForTimeout(1500);
  const dispatchedTrigger = page.getByRole("button", { name: "TODO card's agent run" });
  const reports = (await dispatchedTrigger.count()) > 0;
  r.ok(
    "the card's glyph switches to reporting the task it is bound to",
    reports,
    `buttons named "TODO card's agent run": ${await dispatchedTrigger.count()}`,
  );

  if (reports) {
    await dispatchedTrigger.first().click();
    await page.waitForTimeout(600);
    await snap(page, out, "2-panel-after-dispatch");
    r.ok(
      "the panel leads with the task, and offers another dispatch below it",
      (await page.getByText("Dispatched", { exact: true }).count()) > 0 &&
        (await page.getByText("Dispatch another agent").count()) > 0,
      "task header + `Dispatch another agent` form",
    );
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  }

  // --- 6. a settled task repaints the card ------------------------------------
  // The box is the one thing a reader sees WITHOUT opening anything, so it is
  // the assertion that matters most: dropping the task must fade the card from
  // the family's `warning` hue. Read as a computed colour rather than a class
  // name — the tint is a token, and what is under test is that the frame
  // re-rendered at all.
  const beforeDrop = await dashedBorder(page);
  await page.evaluate(async (taskId: string) => {
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ drop: true }),
    });
    if (!res.ok) throw new Error(`PATCH task ${res.status}: ${await res.text()}`);
  }, first.taskId!);
  // POLLED, not slept on. The repaint arrives with the `tasks` push, which is
  // sub-second in the ordinary case — but a fixed wait turns "usually fast
  // enough" into a test that fails on the run where a burst of writes queued
  // ahead of it. The deadline is what the assertion is actually about.
  const afterDrop = await waitForBorderChange(page, beforeDrop);
  await snap(page, out, "3-card-dropped");
  r.ok(
    "dropping the task repaints the card's dashed box",
    beforeDrop !== undefined && afterDrop !== undefined && beforeDrop !== afterDrop,
    JSON.stringify({ beforeDrop, afterDrop }),
  );

  // --- 7. only a TODO card can dispatch ---------------------------------------
  // The card's own first child is a plain text block — a real id of the right
  // shape that is simply the wrong type, which is the mistake worth refusing.
  const childId = rows.find((b) => b.parentId === cardId)?.id;
  if (childId === undefined) {
    r.fail("the card has a first child to probe with", JSON.stringify(rows));
  } else {
    const refused = await dispatch(page, childId, "");
    r.ok(
      "a non-TODO block is refused with a 400 naming the type it actually is",
      refused.status === 400 && (refused.body ?? "").includes("text"),
      JSON.stringify(refused),
    );
  }

  r.finish();
});
