/**
 * Verifies the **one gate** on which view-types a surface offers: a flat
 * DataView (no hierarchy) must not offer a hierarchical view-type — not in the
 * `+` add menu, and not in the active view's settings type picker.
 *
 * ## Why this is worth a script
 *
 * The two menus used to disagree, and only one of them was wrong in a way you
 * could see. The add menu filtered correctly; the settings picker was handed the
 * global view-type registry, so a flat surface could not CREATE a tree view but
 * could SWITCH one into a tree. `buildInstanceFromRow` then resolved that row to
 * `null` and the switcher simply stopped painting the chip — which reads exactly
 * like the view was deleted, while its config row (name, sort, filter) sat
 * untouched on disk. A user hit this and lost four views' worth of confidence
 * before anyone could tell them nothing was gone.
 *
 * Nothing types "these two menus agree", so this script is what holds it: it
 * opens both menus on the same flat surface and asserts the same absence in
 * each. The Sonata library is the subject because it is a real flat surface —
 * songs have no parent/child axis, so `hasHierarchy` is false and tree is
 * exactly the type that must never be offered.
 *
 * Manual only. Run after `./singularity build`:
 *   ./singularity run plugins/primitives/plugins/data-view/plugins/view-core/e2e/view-type-gate.ts \
 *     --url http://<worktree>.localhost:9000 [--headed]
 *
 * Pass `--url` explicitly: the harness derives its default from
 * `$SINGULARITY_WORKTREE`, which in an agent shell reads `singularity` (main),
 * not the worktree this script is checked out in.
 */
import type { Locator, Page } from "playwright";
import {
  arg,
  boot,
  pathUrl,
  report,
  snap,
  withBrowser,
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";

const OUT = arg("out") ?? "/tmp/view-type-gate";

/** The hierarchical view-type this flat surface must never be offered. */
const HIERARCHICAL = "Tree";

/**
 * Every choice an open menu is offering, as plain text. Deliberately role-blind
 * across the shapes a choice can take (a dropdown item, a pushed panel's radio
 * row, a plain button): the assertion is about WHICH types are on offer, and it
 * should not start passing because the picker was redrawn in another vocabulary.
 */
async function offeredLabels(scope: Locator): Promise<string[]> {
  const labels = await scope
    .locator(
      '[role="menuitem"], [role="menuitemradio"], [role="option"], [role="radio"], button',
    )
    .allInnerTexts();
  return labels.map((t) => t.trim()).filter((t) => t.length > 0);
}

/** The one popup currently on screen (dropdown or panel), whichever it is. */
const openPopup = (page: Page): Locator =>
  page.locator('[role="menu"], [role="dialog"], [data-popup-open]').last();

await withBrowser(async (h) => {
  const r = report("view-core — the flat surface offers no hierarchical view");
  const { page } = await h.session();

  await boot(page, pathUrl("/sonata"), { marker: "button", settleMs: 1200 });
  await snap(page, OUT, "before");

  // --- The `+` add menu (the half that was always right) ---------------------
  // The `+` is hover-revealed chrome: at rest it carries `pointer-events: none`,
  // so a click lands on the switcher row instead. Hover the switcher first —
  // that reveal is the primitive's own contract, not a timing quirk.
  const switcher = page
    .locator('[data-ui-owner^="EditableViewSwitcher"]')
    .first();
  await switcher.hover();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "Add view", exact: true }).click();
  await page.waitForTimeout(400);
  const addMenu = openPopup(page);
  const addable = await offeredLabels(addMenu);
  r.note(`add menu offers: ${addable.join(", ")}`);
  r.ok(
    "the add menu offers at least one flat view-type",
    addable.some((t) => t === "Table" || t === "Gallery"),
    addable.join(", "),
  );
  r.ok(
    `the add menu does NOT offer "${HIERARCHICAL}"`,
    !addable.includes(HIERARCHICAL),
    addable.join(", "),
  );
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // --- The settings type picker (the half that used to be ungated) ----------
  // Clicking the ACTIVE chip opens its settings; the type picker is the "View"
  // row's own page inside that panel.
  const activeChip = page.locator("button", { hasText: "Cards" }).first();
  await activeChip.click();
  await page.waitForTimeout(400);
  const panel = openPopup(page);
  await panel.getByText("View", { exact: true }).first().click();
  await page.waitForTimeout(400);
  await snap(page, OUT, "after");

  const switchable = await offeredLabels(openPopup(page));
  r.note(`settings type picker offers: ${switchable.join(", ")}`);
  r.ok(
    "the type picker offers the surface's own flat view-types",
    switchable.some((t) => t === "Table" || t === "Gallery"),
    switchable.join(", "),
  );
  // THE assertion. Before the fix this listed Tree, and picking it made the
  // view disappear from the switcher.
  r.ok(
    `the type picker does NOT offer "${HIERARCHICAL}" either`,
    !switchable.includes(HIERARCHICAL),
    switchable.join(", "),
  );

  return r.finish();
});
