/**
 * Every card in a draft chain carries the action slot — not only the head.
 *
 * A `TaskDraftFormSlots.Action` button (the element picker) writes into the
 * editor of the card it is rendered in, so each card needs its own. The slot
 * was head-card-only for as long as there was a `HeadToolbar` to hang it off,
 * which meant adding a second task left you with no way to attach an element to
 * it. A type-check cannot see that — the gate was one boolean in the card's bar
 * — so it is asserted here.
 *
 * What makes this a real check is counting the buttons AFTER adding a card.
 * Asserting only that the head has one passes just as happily with the gate put
 * back, since the head always had it.
 *
 * Drives the popover from the task detail's "+ Prerequisite" button rather than
 * the Improve toolbar button: same `TaskDraftPopover`, but a plain
 * always-mounted trigger instead of one behind the floating action bar's
 * hover-disclosure animation.
 *
 *   ./singularity run plugins/tasks/plugins/task-draft-form/e2e/card-actions-verify.ts \
 *     --task <taskId> [--headed]
 */
import {
  arg,
  boot,
  clearToasts,
  pathUrl,
  report,
  requireArg,
  snap,
  withBrowser,
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";

const out = arg("out") ?? "/tmp/draft-card-actions";
/**
 * The picker's accessible name. It is deliberately the SAME whether or not an
 * element is attached, so this locator cannot go stale by someone picking one.
 */
const PICKER = "Attach UI element";
const taskId = requireArg(
  "task",
  "card-actions-verify.ts --task <taskId> [--out <prefix>] [--headed]",
);

const r = report("draft card actions on every card");

await withBrowser(async (h) => {
  const { page } = await h.session();
  await boot(page, pathUrl(`/agents/tasks/t/${taskId}`), { settleMs: 3000 });

  await page
    .getByRole("button", { name: "+ Prerequisite" })
    .click({ timeout: 15_000 });
  // Wait on Submit, NOT on the editor placeholder: the editor is Lexical, whose
  // placeholder is an overlay element and not a `placeholder` attribute — so
  // `getByPlaceholder` never matches and would look like the popover never
  // opened.
  const submit = page.getByRole("button", { name: "Submit", exact: true });
  await submit.waitFor({ state: "visible", timeout: 15_000 });
  await page.waitForTimeout(800);
  await snap(page, out, "one-card");

  const pickers = page.getByRole("button", { name: PICKER, exact: true });
  r.eq("the head card carries the picker", await pickers.count(), 1);

  // A toast lands in the same corner as the controls below, and Playwright's
  // retry holds the pointer over it so it never expires — see `clearToasts`.
  await clearToasts(page);
  await page.getByRole("button", { name: "+ task" }).click({ timeout: 15_000 });
  await page.waitForTimeout(800);
  await snap(page, out, "two-cards");

  // The claim: the second card got one too. Under the old head-only gate this
  // is still 1.
  r.eq("adding a card adds a picker", await pickers.count(), 2);
});

await r.finish();
