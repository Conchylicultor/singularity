// Verifies the `block-<id>` inline chip: a block id written in a conversation
// renders as a chip labelled with the page's title, and clicking it opens the
// page-detail column beside the conversation (`…/page/<pageId>`).
//
// Both id kinds are asserted — a PAGE id (resolved client-side from the pages
// resource) and a CONTENT-block id (resolved through GET /api/blocks/:id/page),
// since only the second exercises the server lookup.
//
// The conversation must contain the ids in its transcript; pass the ones you
// seeded it with.
//
// Usage:
//   bun plugins/active-data/plugins/page-link/e2e/page-link-verify.ts \
//     --conv <conversationId> --page <block-…> [--block <block-…>] \
//     [--base http://<worktree>.localhost:9000] [--headed]

import {
  baseUrl,
  numArg,
  arg,
  requireArg,
  report,
  snap,
  withBrowser,
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";

const BASE = baseUrl();
const USAGE =
  "usage: page-link-verify.ts --conv <conversationId> --page <block-id> [--block <content-block-id>]";
const CONV = requireArg("conv", USAGE);
const PAGE_ID = requireArg("page", USAGE);
const BLOCK_ID = arg("block");
const OUT = "/tmp/claude-501/page-link";
const waitMs = numArg("wait", 4000);

const r = report("active-data page-link");

await withBrowser(async (h) => {
  const { page } = await h.session({ colorScheme: "dark" });

  await page.goto(`${BASE}/agents/c/${CONV}`);
  await page.waitForTimeout(waitMs);
  await snap(page, OUT, "1-conversation");

  // The chip is the only element carrying the id in its `title` (the raw text
  // fallback carries none), so a hit here IS the chip.
  async function chipFor(id: string) {
    const chip = page.locator(`button[title*="${id}"]`).first();
    // The content-block lookup is a fetch, so the chip appears a beat later.
    await chip.waitFor({ state: "visible", timeout: 10_000 }).catch(() => {});
    return chip;
  }

  async function verify(kind: string, id: string, expectedPageId: string) {
    const chip = await chipFor(id);
    const count = await page.locator(`button[title*="${id}"]`).count();
    r.ok(`${kind}: chip rendered for ${id}`, count > 0);
    if (count === 0) return;

    const label = (await chip.innerText()).trim();
    r.note(`${kind}: label="${label}" title="${await chip.getAttribute("title")}"`);
    r.ok(`${kind}: chip is labelled, not the raw id`, label.length > 0 && label !== id);

    await chip.click();
    await page.waitForTimeout(2000);
    await snap(page, OUT, `${kind}-opened`);

    r.ok(
      `${kind}: click opened the page column`,
      page.url().includes(`/page/${expectedPageId}`),
      `url=${page.url()}`,
    );
    const ids: string[] = await page
      .locator("[data-pane-id]")
      .evaluateAll((els) => els.map((e) => e.getAttribute("data-pane-id") ?? "?"));
    r.note(`${kind}: columns=${JSON.stringify(ids)}`);
    r.ok(`${kind}: the conversation stayed open beside it`, ids.includes("conversation"));

    // Back to the bare conversation for the next case.
    await page.goto(`${BASE}/agents/c/${CONV}`);
    await page.waitForTimeout(waitMs);
  }

  await verify("page-id", PAGE_ID, PAGE_ID);
  if (BLOCK_ID) {
    // A content block resolves to its OWNING page — the endpoint's answer, so
    // the expected id is read from it rather than assumed.
    const res = await fetch(`${BASE}/api/blocks/${BLOCK_ID}/page`);
    const body = (await res.json()) as { found: boolean; pageId?: string };
    r.ok(`content-block: endpoint resolved ${BLOCK_ID}`, body.found, JSON.stringify(body));
    if (body.pageId) await verify("content-block", BLOCK_ID, body.pageId);
  }
});

r.finish();
