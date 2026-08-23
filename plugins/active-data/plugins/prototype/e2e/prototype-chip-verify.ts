// Verifies the `proto-<id>` inline chip: a prototype id written in a
// conversation renders as a chip labelled with the mock's `<title>`, and
// clicking it opens the prototype-detail column beside the conversation
// (`…/proto/proto-…`).
//
// The conversation must already contain the id in its transcript; pass the one
// you seeded it with. Any of the real prototypes will do — run
// `./singularity prototype list` (or `ls ~/.singularity/apps/prototypes/`) to
// pick one.
//
// Usage:
//   bun plugins/active-data/plugins/prototype/e2e/prototype-chip-verify.ts \
//     --conv <conversationId> --proto proto-1786877040-w2vi \
//     [--base http://<worktree>.localhost:9000] [--headed]

import {
  baseUrl,
  numArg,
  requireArg,
  report,
  snap,
  withBrowser,
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";

const BASE = baseUrl();
const USAGE =
  "usage: prototype-chip-verify.ts --conv <conversationId> --proto <proto-id>";
const CONV = requireArg("conv", USAGE);
const PROTO_ID = requireArg("proto", USAGE);
const OUT = "/tmp/claude-501/prototype-chip";
const waitMs = numArg("wait", 4000);

const r = report("active-data prototype");

await withBrowser(async (h) => {
  const { page } = await h.session({ colorScheme: "dark" });

  await page.goto(`${BASE}/agents/c/${CONV}`);
  await page.waitForTimeout(waitMs);
  await snap(page, OUT, "1-conversation");

  // The chip is the only element carrying the raw id in its `title` (the
  // unresolved fallback is bare text with no attributes), so a hit here IS the
  // chip — and finding one already proves it resolved.
  const chips = page.locator(`button[title*="${PROTO_ID}"]`);
  // Polled, not `waitFor`: an absent chip is the outcome the next line ASSERTS
  // on, so it must not arrive as a thrown timeout.
  for (let i = 0; i < 20 && (await chips.count()) === 0; i++) {
    await page.waitForTimeout(500);
  }
  const count = await chips.count();
  r.ok(`chip rendered for ${PROTO_ID}`, count > 0);
  if (count === 0) return;

  const chip = chips.first();
  const label = (await chip.innerText()).trim();
  r.note(`label="${label}" title="${await chip.getAttribute("title")}"`);
  // The whole point of resolving: the chip says what the mock IS, not what the
  // model typed. An opaque id showing through means it did not resolve.
  r.ok(
    "chip is labelled with the title, not the raw id",
    label.length > 0 && label !== PROTO_ID,
  );

  await chip.click();
  await page.waitForTimeout(2000);
  await snap(page, OUT, "2-opened");

  r.ok(
    "click opened the prototype column",
    page.url().includes(`/proto/${PROTO_ID}`),
    `url=${page.url()}`,
  );
  const ids: string[] = await page
    .locator("[data-pane-id]")
    .evaluateAll((els) =>
      els.map((e) => e.getAttribute("data-pane-id") ?? "?"),
    );
  r.note(`columns=${JSON.stringify(ids)}`);
  r.ok("the conversation stayed open beside it", ids.includes("conversation"));
});

r.finish();
