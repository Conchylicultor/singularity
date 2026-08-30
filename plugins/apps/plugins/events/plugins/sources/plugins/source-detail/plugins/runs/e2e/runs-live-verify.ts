/**
 * Proves the run ledger is LIVE: click "Refresh now", and the finished run's row
 * appears on its own, with no reload.
 *
 * The load-bearing assertion is the NO-RELOAD one. "A row is there at the end" is
 * also true of a page that navigated, so the script stamps a marker on `window`
 * before clicking and re-reads it after: a surviving marker is proof the same
 * document painted the new row. Without it this script would pass against the
 * exact regression it exists to catch.
 *
 * Manual only, like every script under `e2e/`. Needs a deployed worktree and an
 * enabled source (its refresh really runs — expect a live fetch of the page):
 *
 *   ./singularity run plugins/apps/plugins/events/plugins/sources/plugins/source-detail/plugins/runs/e2e/runs-live-verify.ts --source <sourceId>
 */
import {
  arg,
  boot,
  numArg,
  pathUrl,
  report,
  snap,
  withBrowser,
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";

const SOURCE_ID = arg("source");
const OUT = arg("out") ?? "/tmp/runs-live";
/** A refresh fetches a real page (and may call a model), so allow real time. */
const TIMEOUT_MS = numArg("timeout", 120_000);

const r = report("Events · Runs list is live");

/** Proves the ledger painted, not merely that `<body>` exists. */
const ROW_MARKER = '[data-ui-owner^="ListView@"]';

await withBrowser(async (h) => {
  if (!SOURCE_ID) {
    r.fail("--source <sourceId> is required (an enabled source)");
    await r.finish();
  }

  const { page } = await h.session({ viewport: { width: 1600, height: 900 } });
  await boot(page, pathUrl(`/events/sources/source/${SOURCE_ID}`), {
    marker: ROW_MARKER,
    settleMs: 2500,
  });

  // Exactly one per run row, and only in the runs list — so this counts the
  // ledger rather than every list on a pane that also shows the sources column.
  //
  // The aria-label SELECTOR, not `getByRole(…, { name })`: role+name also matches
  // the button's tooltip copy, which counts every row twice. The direction of the
  // change would still be right, but a number nobody can explain is not something
  // to hang an assertion on.
  const rows = page.locator('button[aria-label="Open run"]');
  const before = await rows.count();
  r.note(`runs on screen before: ${before}`);
  await snap(page, OUT, "before");

  // The witness: cleared by any reload, so its survival is what separates "the
  // list updated itself" from "the page came back with fresh data".
  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>).__runsLiveWitness = "alive";
  });

  const refresh = page.getByRole("button", { name: "Refresh now" }).first();
  await refresh.waitFor({ state: "visible", timeout: 10_000 });
  await refresh.click();
  r.note("clicked Refresh now");

  // Poll the SCREEN, never the DB: the claim is about what the user sees. No
  // reload, no navigation — only waiting.
  const deadline = Date.now() + TIMEOUT_MS;
  let after = before;
  while (after <= before && Date.now() < deadline) {
    await page.waitForTimeout(1000);
    after = await rows.count();
  }

  r.ok(
    "the finished run appears in the list on its own",
    after > before,
    `rows ${before} → ${after} after ${Math.round((TIMEOUT_MS - (deadline - Date.now())) / 1000)}s`,
  );

  const witness = await page.evaluate(
    () => (window as unknown as Record<string, unknown>).__runsLiveWitness,
  );
  r.ok(
    "…in the same document — the page never reloaded",
    witness === "alive",
    `window witness: ${String(witness)}`,
  );

  await snap(page, OUT, "after");
  await r.finish();
});
