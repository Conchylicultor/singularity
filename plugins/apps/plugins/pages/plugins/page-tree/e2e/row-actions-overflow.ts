/**
 * Verifies the Pages sidebar row's authored action split: ONE `⋯` holding the
 * overflow bucket, not a cluster of icons and not two competing menus.
 *
 * A blind `screenshot.ts --click "More"` cannot do this: the action cluster is
 * `w-0 opacity-0` until the row is hovered, so the click lands on the row
 * beneath and navigates instead. The hover IS the flow under test, so it has to
 * be a script.
 *
 *   bun plugins/apps/plugins/pages/plugins/page-tree/e2e/row-actions-overflow.ts --headed
 */
import {
  arg,
  pathUrl,
  report,
  snap,
  withBrowser,
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";

const OUT = arg("out") ?? "/tmp/pages-overflow";

/** The three actions the committed config puts inside the bucket. */
const BUCKETED = ["Delete page", "Upgrade to story", "Add page below"];

await withBrowser(async (h) => {
  const r = report("pages sidebar — row-action overflow bucket");
  const { page, captured } = await h.session();

  await page.goto(pathUrl("pages"), { waitUntil: "domcontentloaded" });

  // The sidebar tree row. Wait for a real row rather than a fixed timeout.
  const row = page.locator('[data-ui-owner^="TreeRowChrome"]').first();
  await row.waitFor({ state: "visible", timeout: 30_000 });
  await snap(page, OUT, "before");

  // Reveal the cluster the way a user does.
  await row.hover();

  const inlineButtons = row.locator("button[aria-label]");
  const labels = (await inlineButtons.evaluateAll((els) =>
    els.map((e) => e.getAttribute("aria-label") ?? ""),
  )).filter(Boolean);
  r.note(`inline affordances on hover: ${JSON.stringify(labels)}`);

  // Exactly one "More" trigger — the whole point of unifying with `rowMenu`.
  const moreCount = labels.filter((l) => l === "More").length;
  r.eq("exactly one ⋯ trigger on the row", moreCount, 1);

  // The bucketed actions must NOT be inline.
  for (const name of BUCKETED) {
    r.ok(`"${name}" is not inline`, !labels.includes(name), `inline: ${labels.join(", ")}`);
  }
  // Star stays inline (authored as the one high-frequency action).
  r.ok(
    "a star toggle stays inline",
    labels.some((l) => /favorit/i.test(l)),
    `inline: ${labels.join(", ")}`,
  );

  await row.getByRole("button", { name: "More", exact: true }).click();

  const menu = page.getByRole("menu");
  await menu.waitFor({ state: "visible", timeout: 10_000 });
  await snap(page, OUT, "after");

  const items = (await menu.getByRole("menuitem").allTextContents()).map((t) => t.trim());
  r.note(`menu rows: ${JSON.stringify(items)}`);

  // Labelled rows, not a strip of icon buttons — the presentation switch.
  for (const name of BUCKETED) {
    r.ok(`"${name}" is a labelled menu row`, items.some((t) => t.includes(name)), `got: ${items.join(" | ")}`);
  }
  r.eq("menu holds exactly the bucketed actions", items.length, BUCKETED.length);

  // --- The open menu must not move when the pointer leaves the row -----------
  // The cluster is the menu's ANCHOR. It collapses to `w-0` off-hover, which
  // shoves the still-mounted trigger to the collapsed edge and drags the open
  // menu sideways with it. `tree-row-chrome` holds the cluster open on
  // `has-[[data-popup-open]]` — base-ui's attribute. It previously named
  // Radix's `data-[state=open]`, which matches nothing here, so the rule never
  // fired and the menu jumped ~52px right. A selector against another library's
  // attribute contract cannot be type-checked, so it is asserted here instead.
  const boxOf = async () => {
    const b = await menu.boundingBox();
    return b ? { x: Math.round(b.x), y: Math.round(b.y) } : null;
  };
  const atOpen = await boxOf();
  await page.mouse.move(900, 620); // off the row, onto the menu's backdrop
  await page.waitForTimeout(400);
  const atRest = await boxOf();
  r.eq("open menu does not move when the row loses hover", atRest, atOpen);

  await page.keyboard.press("Escape");

  // --- Favorites: the SAME authored bucket, in a flat `list` view -------------
  // `AddPageBelowAction` reads the tree row's controls, so it renders null here.
  // That is the normal non-tree case: the bucket must degrade to its remaining
  // members, not crash and not paint an empty menu.
  // `title=` targets the view-switcher chip itself — a bare role/name lookup also
  // matches the sortable wrapper reorder puts around every switcher chip.
  await page.locator('button[title="Favorites"]').click();
  const favLabel = page.getByText("Todos", { exact: true }).first();
  await favLabel.waitFor({ state: "visible", timeout: 10_000 });
  await favLabel.hover();

  const favMore = page.getByRole("button", { name: "More", exact: true });
  r.eq("Favorites row still has one ⋯", await favMore.count(), 1);
  await favMore.click();

  const favMenu = page.getByRole("menu");
  await favMenu.waitFor({ state: "visible", timeout: 10_000 });
  await snap(page, OUT, "favorites");
  const favItems = (await favMenu.getByRole("menuitem").allTextContents()).map((t) => t.trim());
  r.note(`favorites menu rows: ${JSON.stringify(favItems)}`);

  r.ok("bucket degrades — menu is not empty", favItems.length > 0, "an empty ⋯ menu is a dead affordance");
  r.ok(
    "Add page below is absent outside a tree",
    !favItems.some((t) => t.includes("Add page below")),
    `got: ${favItems.join(" | ")}`,
  );

  await page.keyboard.press("Escape");

  // --- Pen edit mode: the bucket must not hide its members behind a menu ------
  // A closed dropdown would suppress drag and hide what is being authored, so
  // the container renders its inline form in edit mode instead.
  await page.locator('button[title="Pages"]').click();

  // The pen lives in the collapsed floating action bar; hover expands it.
  const glyph = page.locator('[data-ui-owner^="GlobalActionBar"], svg').first();
  await glyph.waitFor({ state: "attached", timeout: 10_000 });
  const box = page.viewportSize();
  if (box) await page.mouse.move(box.width - 36, 26);

  const pen = page.getByRole("button", { name: "Reorder items", exact: true });
  await pen.waitFor({ state: "visible", timeout: 10_000 });
  await pen.click();

  await page.locator('[data-ui-owner^="TreeRowChrome"]').first().hover();
  await snap(page, OUT, "edit-mode");
  r.ok("entered edit mode", await page.getByRole("button", { name: "Exit edit mode" }).count() > 0);

  // `failedRequests` is deliberately excluded: the log-emit beacon is aborted by
  // design on teardown, so it is noise here, not a defect.
  const errors = [...captured.pageErrors, ...captured.consoleErrors];
  r.ok("no page or console errors", errors.length === 0, errors.join("\n"));
  r.finish();
});
