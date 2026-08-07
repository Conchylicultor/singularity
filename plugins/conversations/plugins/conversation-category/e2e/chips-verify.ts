/**
 * Reports what the conversation header actually renders for this plugin: one
 * chip per configured category, labelled `<category>: <item>` when the
 * conversation is classified along it and `<category>: not set` when it is not.
 *
 * Nothing but a browser can answer this. The chip count is not a property of the
 * code — it is the length of a user-edited config list, resolved at render time
 * through a live-state subscription. A unit test can assert the mapping; only
 * the deployed app can say it read the config the user actually has.
 *
 *   bun plugins/conversations/plugins/conversation-category/e2e/chips-verify.ts \
 *     --conv conv-1786112094-i6an [--expect-categories 2] [--headed]
 */
import {
  arg,
  boot,
  numArg,
  pathUrl,
  report,
  requireArg,
  snap,
  withBrowser,
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";

const CONV = requireArg(
  "conv",
  "usage: chips-verify.ts --conv <conversationId> [--expect-categories N] [--out <prefix>]",
);
const OUT = arg("out") ?? "/tmp/category-chips";
/** 0 = report what rendered without asserting a count. */
const EXPECT = numArg("expect-categories", 0);

/**
 * The chips by provenance, not by text: `data-ui-owner` carries the component
 * that rendered each node, so this matches exactly this plugin's chips and can
 * never pick up another plugin's `"<x>: <y>"` label. Their own text is ambiguous
 * on purpose — an unset chip shows its CATEGORY's name — so the assertion reads
 * `aria-label`, which always spells out which of the two it is.
 */
const CHIP = '[data-ui-owner^="CategoryChip@"]';

await withBrowser(async (h) => {
  const r = report("conversation-category chips");
  const { page, captured } = await h.session();
  await boot(page, pathUrl(`agents/c/${CONV}`));
  // The chips mount after the point subscription settles — one post-mount
  // round-trip, since point resources are deliberately not boot-critical.
  await page.waitForTimeout(6000);

  const chips = await page.$$eval(CHIP, (els) =>
    els.map((e) => e.getAttribute("aria-label") ?? "(no aria-label)"),
  );

  await snap(page, OUT, "header");

  r.note(`conversation: ${CONV}`);
  r.note(`chips rendered: ${chips.length}`);
  for (const c of chips) r.note(`  • ${c}`);
  r.ok("at least one category chip rendered", chips.length > 0);
  r.ok(
    "every chip announces its category and state",
    chips.every((c) => /^.+: .+$/.test(c)),
    chips.join(" | "),
  );
  if (EXPECT > 0) r.eq("chip count", chips.length, EXPECT);
  r.ok(
    "no page errors",
    captured.pageErrors.length === 0,
    captured.pageErrors.join("; "),
  );
  r.finish();
});
