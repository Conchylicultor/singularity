/**
 * Both surfaces render the SAME launch-option registry.
 *
 * The point of the registry is that an option is one plugin folder and shows up
 * on the task detail's Prompt card AND in the task-draft popover with no host
 * edit. A type-check cannot catch a host that silently renders a subset — it
 * still compiles — so it is asserted here.
 *
 * Drives the draft popover from the task detail's "+ Prerequisite" button
 * rather than the Improve toolbar button: same `TaskDraftPopover`, but a plain
 * always-mounted trigger instead of one behind the floating action bar's
 * hover-disclosure animation.
 *
 *   ./singularity run plugins/tasks/plugins/launch-options/e2e/launch-options-verify.ts \
 *     --task <taskId> [--headed]
 */
import {
  arg,
  boot,
  pathUrl,
  report,
  requireArg,
  snap,
  withBrowser,
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";

const out = arg("out") ?? "/tmp/launch-options";
/**
 * Each option's control, by the `ariaLabel` its contribution passes. Asserting
 * on the CONTROL rather than the row label is what makes this a real check: a
 * host that painted the labels but dropped the controls would still pass a
 * text-only assertion.
 */
const CONTROLS = ["Auto-start model", "Task preprompt", "Task thinking mode"];
/** A task to open the Prompt card on. Any id in this worktree's DB will do. */
const taskId = requireArg(
  "task",
  "launch-options-verify.ts --task <taskId> [--out <prefix>] [--headed]",
);

const r = report("launch options on both surfaces");

await withBrowser(async (h) => {
  const { page } = await h.session();
  await boot(page, pathUrl(`/agents/tasks/t/${taskId}`), { settleMs: 3000 });
  await snap(page, out, "task-detail");

  // --- task detail Prompt card ---
  // Only the detail is mounted here, so one control each.
  for (const label of CONTROLS) {
    r.eq(
      `task detail renders "${label}"`,
      await page.getByLabel(label).count(),
      1,
    );
  }

  // --- task-draft popover ---
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
  await snap(page, out, "draft-popover");

  // The popover's own card adds a second instance of every control — which is
  // the whole claim: one registry, both surfaces, nothing option-specific in
  // either host.
  for (const label of CONTROLS) {
    r.eq(
      `draft popover adds "${label}"`,
      await page.getByLabel(label).count(),
      2,
    );
  }
});

await r.finish();
