// Pins the reorder CLAIM invariant on the real deployed app:
//
//   A contribution is a sortable item iff it was rendered as an ITEM OF an area
//   — by that area's own `renderItem` — not merely somewhere underneath it.
//
// The leak this catches is a slot dispatched from INSIDE a contribution
// (`.Dispatch` / `renderIsolated` mount no area of their own): it used to
// inherit the ambient `ReorderAreaContext` and register `useSortable` with a
// per-CONTRIBUTION id, so N rendered instances of one contribution meant N
// duplicate dnd-kit ids in a single `DndContext`.
//
// Edit mode MUST be on: `SortableReorderItem` passes `disabled={!editMode}`,
// dnd-kit returns no `listeners` when disabled, and `SortableItem` then spreads
// no attributes at all — so the `aria-roledescription="sortable"` marker is
// absent everywhere outside edit mode and the probe would read 0 both before and
// after the fix, proving nothing.
//
// Usage:
//   ./singularity run plugins/reorder/e2e/claim-verify.ts [--base http://<worktree>.localhost:9000] [--headed]

import {
  pathUrl,
  report,
  withBrowser,
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";

const SORTABLE = '[aria-roledescription="sortable"]';

/** A surface where a slot is dispatched from inside a reorderable contribution. */
interface Surface {
  name: string;
  url: string;
  /** The nested content that must contain NO sortable of its own. */
  nested: string;
}

const SURFACES: Surface[] = [
  {
    name: "website/apps → editor-toy → Editor.Block.Dispatch",
    url: pathUrl("/website/apps"),
    nested: "[data-block-id]",
  },
];

const r = report("reorder claim");

await withBrowser(async (h) => {
  const { page } = await h.session();

  for (const s of SURFACES) {
    await page.goto(s.url);
    await page.waitForTimeout(3000);

    // Pen toggle lives on the global action bar; label flips once engaged.
    // The global action bar is a hover-revealed floating panel when unpinned, so
    // the pen is present but pointer-intercepted until the bar is disclosed.
    const bar = page.locator('[data-source*="floating-action"]').first();
    if (await bar.count()) {
      await bar.hover();
      await page.waitForTimeout(600);
    }

    const pen = page.getByRole("button", { name: "Reorder items" });
    if ((await pen.count()) === 0) {
      r.fail(
        `${s.name}: edit mode`,
        "pen button not found — probe would be vacuous",
      );
      continue;
    }
    await pen.first().click();
    await page.waitForTimeout(800);

    const total = await page.locator(SORTABLE).count();
    const inside = await page.locator(`${s.nested} ${SORTABLE}`).count();
    r.note(`${s.name}: sortables on page=${total}, inside nested=${inside}`);

    // Non-vacuity guard FIRST: it proves edit mode really engaged and the marker
    // exists on this page, so the `inside === 0` assertion below means something.
    r.ok(
      `${s.name}: edit mode engaged`,
      total > 0,
      `no sortables anywhere (got ${total})`,
    );
    r.eq(`${s.name}: no sortable inside nested content`, inside, 0);

    await page.getByRole("button", { name: "Exit edit mode" }).first().click();
    await page.waitForTimeout(400);
  }
});

await r.finish();
