// Executable spec for the ANNOTATION FAMILY as a family — the four blocks that
// carry a page's human↔agent side-channel (`context`, `todo`, `agent-notes`,
// `private-notes`).
//
// Per-container behaviour (wrap, unwrap, Enter-in-a-child, nesting, the void
// write boundary) is already pinned by
// `plugins/context/e2e/context-container-verify.ts`, and every member is built by
// the SAME `defineAnnotationBlock` call, so this file deliberately does NOT re-run
// that suite four times. It checks only what is true of the family and of nothing
// else:
//
//  1. All four types are REGISTERED and VOID at the write boundary: `{}` is
//     accepted, a `text` key is a 400 (`handle.schema.strict()`).
//  2. Each paints ONE dashed box spanning its own zero-height anchor row plus its
//     whole subtree, and never the block that follows it.
//  3. The four boxes are visually DISTINCT — four different border colours — which
//     is the family's whole visual language: same shape (dashed = meta, vs the
//     callout's solid tint), hue = direction. A regression that collapsed two
//     tints into one would leave every other assertion here green.
//  4. All four are reachable from the `/` palette by the labels a user types.
//  5. `TODO ` typed at the start of a line WRAPS that line into a todo card, with
//     the prefix stripped and the line surviving as the card's first child — the
//     one member with a typed trigger, and the one thing here that is not shared.
//
// Convention: a box's owner is the FIRST row whose top sits on the box's top edge
// (a void anchor row is zero-height and precedes its first child in document
// order, so the anchor wins) — the same rule the context spec uses, for the same
// reason: frames are grid SIBLINGS of the rows they cover, so DOM ancestry says
// nothing about ownership.
//
// Usage: bun plugins/page/plugins/annotations/e2e/annotations-verify.ts [--base <url>] [--out /tmp/annotations]
import {
  arg,
  baseUrl,
  report,
  snap,
  withBrowser,
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";
import type { Page } from "playwright";
import { blockText, openBlankPage } from "@plugins/page/plugins/editor/e2e";

const base = baseUrl();
const out = arg("out", "/tmp/annotations");

const r = report();

/** Record one failure and stop. Used where nothing further is checkable. */
function bail(name: string, detail: string): never {
  r.fail(name, detail);
  return r.finish();
}

/** The family, in channel order — the same order the palette group declares. */
const MEMBERS = [
  { type: "context", label: "Context", child: "conventions live here" },
  { type: "todo", label: "TODO", child: "wire the delivery filter" },
  { type: "agent-notes", label: "Agent notes", child: "found two call sites" },
  { type: "private-notes", label: "Private note", child: "ask before shipping" },
] as const;

interface Box {
  top: number;
  bottom: number;
  left: number;
  /** Dashed identifies an ANNOTATION box; a callout's tint has no border. */
  dashed: boolean;
  /** Resolved border colour — the family's per-member hue. */
  borderColor: string;
}

interface Row {
  top: number;
  bottom: number;
  height: number;
  contentLeft: number;
}

interface Geometry {
  boxes: Box[];
  rows: Record<string, Row | undefined>;
  /** Every block id in document order. */
  order: string[];
}

/**
 * Read the surface's geometry off the DOM in one pass — every row and every
 * painted backdrop, with no notion of which block owns which box. Ownership is
 * resolved below, in readable code, rather than by asking the browser a question
 * whose answer this script would have had to guess first.
 */
async function geometry(page: Page): Promise<Geometry> {
  return page.evaluate(() => {
    const rows: Record<string, Row> = {};
    const order: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>("[data-block-id]")) {
      const id = el.getAttribute("data-block-id");
      if (id === null) continue;
      order.push(id);
      const rect = el.getBoundingClientRect();
      rows[id] = {
        top: rect.top,
        bottom: rect.bottom,
        height: rect.height,
        contentLeft: rect.left + parseFloat(getComputedStyle(el).paddingLeft || "0"),
      };
    }

    // Rows sit one wrapper deep in the block grid; frames are siblings of those
    // wrappers holding no rows of their own — which is how they are told apart.
    const anyRow = document.querySelector<HTMLElement>("[data-block-id]");
    const grid = anyRow?.parentElement?.parentElement;
    const boxes: Box[] = [];
    for (const child of grid ? [...grid.children] : []) {
      if (!(child instanceof HTMLElement)) continue;
      if (child.querySelector("[data-block-id]") !== null) continue;
      // The wrapper only positions; the contribution inside it paints. Take the
      // first node in the subtree that actually paints — a background OR a
      // border, since an annotation's box is defined by its dashed border as much
      // as by its tint.
      for (const node of [child, ...child.querySelectorAll<HTMLElement>("div")]) {
        const style = getComputedStyle(node);
        const bg = style.backgroundColor;
        const filled =
          bg !== "" && bg !== "transparent" && !bg.startsWith("rgba(0, 0, 0, 0)");
        const bordered =
          style.borderTopStyle !== "none" && parseFloat(style.borderTopWidth || "0") > 0;
        if (!filled && !bordered) continue;
        const rect = node.getBoundingClientRect();
        boxes.push({
          top: rect.top,
          bottom: rect.bottom,
          left: rect.left,
          dashed: style.borderTopStyle === "dashed",
          borderColor: style.borderTopColor,
        });
        break;
      }
    }
    return { boxes, rows, order };
  });
}

/** The dashed box a given block OWNS, i.e. the one starting on that block's row. */
function boxOf(g: Geometry, blockId: string): Box | undefined {
  const row = g.rows[blockId];
  if (!row) return undefined;
  return g.boxes.find((b) => b.dashed && Math.abs(b.top - row.top) <= 1);
}

interface StoredRow {
  id: string;
  parentId: string | null;
  type: string;
}

/** The persisted forest — rects prove what is painted, only this proves structure. */
async function storedRows(page: Page, pageId: string): Promise<StoredRow[]> {
  return page.evaluate(async (id: string) => {
    const res = await fetch(`/api/pages/${id}/blocks`);
    if (!res.ok) throw new Error(`GET blocks ${res.status}: ${await res.text()}`);
    return (await res.json()) as StoredRow[];
  }, pageId);
}

/** The write boundary's verdict on one `POST /api/blocks` body, verbatim. */
async function probePost(
  page: Page,
  pageId: string,
  type: string,
  data: unknown,
): Promise<{ status: number; body: string }> {
  return page.evaluate(
    async ({ parent, blockType, payload }) => {
      const res = await fetch("/api/blocks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ parentId: parent, type: blockType, data: payload }),
      });
      return { status: res.status, body: await res.text() };
    },
    { parent: pageId, blockType: type, payload: data },
  );
}

async function deleteBlock(page: Page, blockId: string): Promise<void> {
  const res = await page.evaluate(async (id: string) => {
    const response = await fetch(`/api/blocks/${id}`, { method: "DELETE" });
    return { status: response.status, body: await response.text() };
  }, blockId);
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`DELETE /api/blocks/${blockId} ${res.status}: ${res.body}`);
  }
}

interface Seeded {
  /** Per member type: its card id, its two children, and the block after it. */
  cards: Record<string, { card: string; head: string; tail: string; after: string }>;
  /** The trailing empty paragraph the `TODO ` trigger is typed into. */
  typing: string;
}

/**
 * Seed one card per member through `POST /api/blocks` and let a cold load
 * re-derive everything from persisted rows — no keystroke has run yet, so nothing
 * measured afterwards can be an artifact of the composing flow.
 *
 * Every payload is `{}`: an annotation is VOID, its content IS its children.
 */
async function seed(
  page: Page,
  pageId: string,
  members: [type: string, child: string][],
): Promise<Seeded> {
  return page.evaluate(
    async ({ parent, types }) => {
      const post = async (body: unknown): Promise<{ id: string }> => {
        const res = await fetch("/api/blocks", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`POST /api/blocks ${res.status}: ${await res.text()}`);
        return (await res.json()) as { id: string };
      };
      const text = (parentId: string, type: string, body: string) =>
        post({ parentId, type, data: { text: [{ text: body }] } });

      const cards: Record<string, { card: string; head: string; tail: string; after: string }> =
        {};
      for (const [type, childText] of types) {
        const card = await post({ parentId: parent, type, data: {} });
        // A HEADING first child on purpose: "the first visible line can be a
        // heading" is the property the void-container model exists to buy.
        const head = await text(card.id, "heading-2", type);
        const tail = await text(card.id, "bulleted-list", childText);
        const after = await text(parent, "text", `after ${type}`);
        cards[type] = { card: card.id, head: head.id, tail: tail.id, after: after.id };
      }
      const typing = await text(parent, "text", "");
      return { cards, typing: typing.id };
    },
    { parent: pageId, types: members },
  );
}

await withBrowser(async (h) => {
  const { page } = await h.session({ label: "annotations" });
  const { pageUrl, pageId } = await openBlankPage(page, base, { settleMs: 3000 });
  console.log("page url:", pageUrl);

  // --- 1. every member is registered AND void at the write boundary -----------
  // The pincer matters: an UNREGISTERED type also 400s (`resolveBlockHandle` →
  // "Unknown block type"), so the rejection alone would pass on a page where the
  // type does not exist at all. The accepted `{}` is what carries that proof.
  for (const { type } of MEMBERS) {
    const withText = await probePost(page, pageId, type, { text: [{ text: "no" }] });
    r.ok(
      `void schema: a \`${type}\` payload carrying \`text\` is REJECTED as an unrecognized key`,
      withText.status === 400 &&
        new RegExp(`Invalid data for block type "${type}"`).test(withText.body) &&
        /Unrecognized key/.test(withText.body),
      `status=${withText.status} body=${withText.body}`,
    );

    const withEmpty = await probePost(page, pageId, type, {});
    const accepted = withEmpty.status >= 200 && withEmpty.status < 300;
    r.ok(
      `void schema: \`${type}\` accepts \`{}\` — the type is registered and truly void`,
      accepted,
      `status=${withEmpty.status} body=${withEmpty.body}`,
    );
    if (accepted) {
      // Delete the probe row: it is a real childless card, and left on the page it
      // would add a box to every count below plus a prune target to the first
      // structural keystroke.
      const probeId = (JSON.parse(withEmpty.body) as { id?: string }).id;
      if (probeId === undefined) r.fail(`probe for ${type} returned a row`, withEmpty.body);
      else await deleteBlock(page, probeId);
    }
  }

  // --- seed ------------------------------------------------------------------
  const seeded = await seed(
    page,
    pageId,
    MEMBERS.map((m): [string, string] => [m.type, m.child]),
  ).catch((err: unknown): never =>
    bail(
      "seed: the fixture posts through the write boundary",
      `${err instanceof Error ? err.message : String(err)} — nothing below is checkable`,
    ),
  );

  await page.reload({ waitUntil: "domcontentloaded" });
  await page
    .locator(`[data-block-id="${seeded.typing}"]`)
    .first()
    .waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(1500);
  await snap(page, out, "1-family");

  const g = await geometry(page);

  // --- 2. one dashed box per card, spanning its subtree and nothing after -----
  const seenColors = new Map<string, string>();
  for (const { type } of MEMBERS) {
    const ids = seeded.cards[type];
    if (!ids) {
      r.fail(`${type}: seeded`, "missing from the seed result");
      continue;
    }
    const box = boxOf(g, ids.card);
    const anchorRow = g.rows[ids.card];
    const headRow = g.rows[ids.head];
    const tailRow = g.rows[ids.tail];
    const afterRow = g.rows[ids.after];
    if (!box || !anchorRow || !headRow || !tailRow || !afterRow) {
      r.fail(
        `${type}: paints a dashed box over its own row + subtree`,
        JSON.stringify({ box, anchorRow, headRow, tailRow, afterRow }),
      );
      continue;
    }
    r.ok(
      `${type}: the anchor row is ZERO HEIGHT — the card renders no line of its own`,
      anchorRow.height <= 1,
      `height=${anchorRow.height}`,
    );
    r.ok(
      `${type}: its box covers BOTH children`,
      box.top <= headRow.top + 1 && box.bottom >= tailRow.bottom - 1,
      JSON.stringify({ box, headRow, tailRow }),
    );
    r.ok(
      `${type}: its box stops before the following block`,
      box.bottom <= afterRow.top + 1,
      JSON.stringify({ boxBottom: box.bottom, afterTop: afterRow.top }),
    );
    r.ok(
      `${type}: its children are NESTED (one indent deeper than the block after it)`,
      headRow.contentLeft > afterRow.contentLeft,
      JSON.stringify({ head: headRow.contentLeft, after: afterRow.contentLeft }),
    );
    seenColors.set(type, box.borderColor);
  }

  // --- 3. the four hues are distinct ------------------------------------------
  const distinct = new Set(seenColors.values());
  r.ok(
    "family: the four members paint four DIFFERENT border colours",
    seenColors.size === MEMBERS.length && distinct.size === MEMBERS.length,
    JSON.stringify(Object.fromEntries(seenColors)),
  );

  // --- 4. all four are in the `/` palette -------------------------------------
  const editable = page
    .locator(`[data-block-id="${seeded.typing}"] [contenteditable="true"]`)
    .first();
  await editable.click();
  await page.keyboard.type("/");
  await page.waitForTimeout(600);
  await snap(page, out, "2-palette");
  for (const { label } of MEMBERS) {
    const count = await page.getByText(label, { exact: true }).count();
    r.ok(`palette: \`/\` offers "${label}"`, count > 0, `matches=${count}`);
  }
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  // Escape keeps the block and clears the query text; clear it explicitly so the
  // typed trigger below starts from a genuinely empty line.
  await page.keyboard.press("Backspace");
  await page.waitForTimeout(300);

  // --- 5. typing `TODO ` wraps the line ---------------------------------------
  // The one member with a typed trigger. `MarkdownShortcutPlugin` strips the
  // prefix and calls `convertTo`, which for a `wrapOnConvert` type WRAPS — so the
  // line survives as the new card's first child, with its id (and caret) intact.
  await page.keyboard.type("TODO ");
  await page.waitForTimeout(800);
  await page.keyboard.type("write the delivery filter");
  await page.waitForTimeout(2000);
  await snap(page, out, "3-todo-trigger");

  const g2 = await geometry(page);
  const typedRow = g2.rows[seeded.typing];
  const stored = await storedRows(page, pageId);
  const typedStored = stored.find((b) => b.id === seeded.typing);
  const wrapper = stored.find((b) => b.id === typedStored?.parentId);

  r.ok(
    "TODO trigger: the typed line kept its id and became a CHILD of a new `todo` card",
    typedStored?.type === "text" && wrapper?.type === "todo",
    JSON.stringify({ typedStored, wrapper }),
  );
  r.ok(
    "TODO trigger: the prefix was stripped, the rest of the line survived",
    (await blockText(
      page.locator(`[data-block-id="${seeded.typing}"] [contenteditable="true"]`).first(),
    )) === "write the delivery filter",
    await blockText(
      page.locator(`[data-block-id="${seeded.typing}"] [contenteditable="true"]`).first(),
    ),
  );
  r.ok(
    "TODO trigger: the new card paints a dashed box over the line",
    wrapper !== undefined &&
      typedRow !== undefined &&
      (() => {
        const box = boxOf(g2, wrapper.id);
        return box !== undefined && box.bottom >= typedRow.bottom - 1;
      })(),
    JSON.stringify({ wrapper: wrapper?.id, typedRow }),
  );

  r.finish();
});
