/**
 * Verifies the file tree's expand state after it moved off a mount-local
 * `useState<Set>` onto the data-view primitive's per-(surface, view-instance)
 * expand map (`research/2026-07-29-global-delete-hierarchy-expand-hooks.md`).
 *
 * Three claims, none of which held before that change:
 *   1. a folder row's BODY click toggles it (`TreeViewOptions.expandOnActivate`,
 *      which replaced the consumer's own toggle);
 *   2. the toggle lands in `${storageKey}:view-state` — the view's own map;
 *   3. it therefore survives a reload, where the old local Set reset to empty.
 *
 * Manual only. Run after `./singularity build`:
 *   ./singularity run plugins/code-explorer/e2e/file-tree-expand.ts [--headed]
 */
import { errors, type Locator, type Page } from "playwright";
import {
  arg,
  boot,
  pathUrl,
  report,
  withBrowser,
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";

const STORAGE_KEY = "code-explorer.file-tree:view-state";
/** A top-level directory row, and a child visible only once it opens. */
const FOLDER = arg("folder") ?? "plugins";
const CHILD = arg("child") ?? "code-explorer";

/**
 * Whether `locator` reaches `state` within the timeout — the assertion itself,
 * so a miss is a reported FAIL rather than a thrown stack. Only Playwright's
 * own TimeoutError means "did not happen"; anything else is a real fault and
 * propagates.
 */
async function reaches(
  locator: Locator,
  state: "visible" | "hidden",
  timeoutMs = 10_000,
): Promise<boolean> {
  try {
    await locator.waitFor({ state, timeout: timeoutMs });
    return true;
  } catch (err) {
    if (err instanceof errors.TimeoutError) return false;
    throw err;
  }
}

/** The expand map this surface persists for its `tree` view instance. */
async function expandMap(page: Page): Promise<Record<string, boolean>> {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<
      string,
      { expanded?: Record<string, boolean> }
    >;
    return parsed.tree?.expanded ?? {};
  }, STORAGE_KEY);
}

const r = report("code-explorer file-tree expand");

await withBrowser(async (h) => {
  const { page } = await h.session();
  const folderRow = page.getByText(FOLDER, { exact: true }).first();
  const childRow = page.getByText(CHILD, { exact: true }).first();

  // The tree renders behind a loading skeleton, so wait for a real row.
  await boot(page, pathUrl("/agents/code/main"), {
    marker: `text="${FOLDER}"`,
    settleMs: 500,
  });

  // Start from a known state: the map must not already hold this folder.
  await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY);
  await page.reload({ waitUntil: "domcontentloaded" });
  await folderRow.waitFor({ state: "visible", timeout: 30_000 });

  r.ok(
    "starts collapsed (the file tree sets no defaultExpanded)",
    !(await childRow.isVisible()),
  );

  // 1. A body click — NOT the chevron — toggles the folder open.
  await folderRow.click();
  r.ok(
    "body click on a folder row expands it (expandOnActivate)",
    await reaches(childRow, "visible"),
  );

  // 2. The write went to the view's own expand map, not to any domain store.
  const afterClick = await expandMap(page);
  r.ok(
    `"${FOLDER}" recorded true in ${STORAGE_KEY}`,
    afterClick[FOLDER] === true,
    JSON.stringify(afterClick),
  );

  // 3. It survives a reload — the old mount-local Set did not.
  await page.reload({ waitUntil: "domcontentloaded" });
  await folderRow.waitFor({ state: "visible", timeout: 30_000 });
  r.ok("expansion survives a reload", await reaches(childRow, "visible"));

  // And collapses back the same way, so the map is written in both directions.
  await folderRow.click();
  const collapsed = await reaches(childRow, "hidden");
  const afterCollapse = await expandMap(page);
  r.ok(
    "body click collapses it again",
    collapsed && afterCollapse[FOLDER] === false,
    JSON.stringify(afterCollapse),
  );
});

r.finish();
