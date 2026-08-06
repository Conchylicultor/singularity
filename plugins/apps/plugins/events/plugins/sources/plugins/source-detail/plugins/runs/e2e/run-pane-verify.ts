/**
 * Drives the run ledger's one affordance: hover a run row, click its action, and
 * land on the run's own pane with its contributed Model call region.
 *
 * The assertion that matters is the HIT TEST, not the navigation. The action is
 * hover-revealed and pinned over the row, and the row's body is itself a button —
 * so "the handler works" and "a pointer can actually reach it" are different
 * claims, and only the second is what a user experiences. This script asks the
 * browser what is topmost at the action's own centre while the row is hovered, so
 * a regression that buries the action fails here rather than shipping as a
 * mysteriously inert button.
 *
 * Manual only, like every script under `e2e/`. Needs a deployed worktree and a
 * source that has run at least once:
 *
 *   bun plugins/apps/plugins/events/plugins/sources/plugins/source-detail/plugins/runs/e2e/run-pane-verify.ts --source <sourceId>
 */
import {
  arg,
  boot,
  pathUrl,
  report,
  snap,
  withBrowser,
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";

const SOURCE_ID = arg("source");
const OUT = arg("out") ?? "/tmp/run-pane";

const r = report("Events · Run pane");

/** Proves the ledger actually painted, not merely that `<body>` exists. */
const ROW_MARKER = '[data-ui-owner^="ListView@"]';

await withBrowser(async (h) => {
  if (!SOURCE_ID) {
    r.fail("--source <sourceId> is required (a source with at least one run)");
    r.finish();
  }

  const { page } = await h.session({ viewport: { width: 1600, height: 900 } });
  await boot(page, pathUrl(`/events/sources/source/${SOURCE_ID}`), {
    marker: ROW_MARKER,
    settleMs: 2500,
  });

  const row = page.locator(ROW_MARKER).first();
  const action = page.getByRole("button", { name: "Open run" }).first();

  // Hover the row the way a person does — the action is revealed, not persistent.
  await row.hover();
  await action.waitFor({ state: "visible", timeout: 10_000 });
  r.ok("the run row reveals its action on hover", true);

  const box = await action.boundingBox();
  if (!box) {
    r.fail("the revealed action has no box");
    r.finish();
  }

  // Reveal state, before the hit test — Playwright calls an opacity-0 element
  // "visible", so `waitFor` above does NOT prove the action was revealed. If
  // pointer-events is `none` here, the hit test below is measuring an unrevealed
  // action rather than a stacking bug.
  const reveal = await action.evaluate((el) => {
    const s = getComputedStyle(el as Element);
    return `opacity=${s.opacity} pointer-events=${s.pointerEvents} visibility=${s.visibility}`;
  });
  r.note(`action computed style while row hovered: ${reveal}`);

  // THE assertion: is the action what a pointer would actually land on?
  const topmost = await page.evaluate(
    ([x, y]) => {
      const el = document.elementFromPoint(x as number, y as number);
      const btn = el?.closest("button");
      return (
        btn?.getAttribute("aria-label") ??
        btn?.textContent?.trim().slice(0, 40) ??
        "<none>"
      );
    },
    [box!.x + box!.width / 2, box!.y + box!.height / 2],
  );
  r.ok(
    "the action is the topmost target at its own centre",
    topmost.includes("Open run"),
    `hit test found: ${topmost}`,
  );

  await action.click();
  await page.waitForTimeout(2000);

  const navigated = /\/run\/[0-9a-f-]{36}/.test(page.url());
  r.ok("clicking the action opens the run pane", navigated, page.url());

  // Scoped to the run pane's own region host, and gated on `navigated`. A bare
  // page-wide getByText("Model call") passes on the UNNAVIGATED page as soon as
  // any source is named something like "model call" — a green line proving
  // nothing, which is the failure mode this harness exists to prevent.
  r.ok(
    "the run pane carries the contributed Model call region",
    navigated &&
      (await page
        .getByRole("button", { name: /Model call/ })
        .first()
        .isVisible()),
  );

  await snap(page, OUT, "run-pane");
  r.finish();
});
