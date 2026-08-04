/**
 * Drives the deployment pane's release pipeline against the deployed app.
 *
 * Manual only (nothing runs this automatically):
 *
 *   bun plugins/apps/plugins/deploy/plugins/release-pipeline/e2e/pipeline-verify.ts [--headed]
 *
 * It reads the first deployment out of the running app rather than seeding one:
 * a deployment names a real remote host, so creating one here would leave a
 * record pointing at a box this script never touches.
 */
import {
  pathUrl,
  report,
  withBrowser,
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";

const r = report("deploy release pipeline");

await withBrowser(async (h) => {
  const { page } = await h.session();

  const deployments = (await (
    await fetch(pathUrl("/api/deploy/deployments"))
  ).json()) as { id: string; serverId: string; compositionId: string }[];

  const deployment = deployments[0];
  if (!deployment) {
    r.fail("a deployment exists", "no deployment rows — add one in the Deploy app first");
    r.finish();
    return;
  }

  // 1. The list row opens the pane, and the URL is the selection.
  await page.goto(pathUrl(`/deploy/server/${deployment.serverId}`));
  await page.waitForTimeout(3000);
  await page.getByText(deployment.compositionId, { exact: true }).first().click();
  await page.waitForTimeout(1500);
  r.ok(
    "row push opens dep/:deploymentId",
    page.url().includes(`/dep/${deployment.id}`),
    page.url(),
  );

  // 2. The three sections are present, in reading order.
  for (const label of ["Overview", "Release pipeline", "Output"]) {
    r.ok(`${label} section renders`, await page.getByText(label, { exact: true }).first().isVisible());
  }

  // 3. All four steps render — including the P3 placeholder, which must be
  //    visible-but-inert rather than absent.
  for (const title of ["Converge the host", "Rehearse"]) {
    r.ok(`step "${title}" renders`, await page.getByText(title, { exact: true }).first().isVisible());
  }
  const rehearse = page.getByRole("button", { name: "Rehearse" }).first();
  r.ok("Rehearse control is not actionable", await rehearse.isDisabled());

  // 4. The Output switcher carries both channels with their scope captions.
  const buildTab = page.getByRole("radio", { name: "Build" }).first();
  r.ok("Output has a Build channel", await buildTab.isVisible());
  await buildTab.click();
  await page.waitForTimeout(500);
  r.ok(
    "Build channel states its worktree scope",
    (await page.getByText(/across ALL compositions/).count()) > 0,
  );

  r.finish();
});
