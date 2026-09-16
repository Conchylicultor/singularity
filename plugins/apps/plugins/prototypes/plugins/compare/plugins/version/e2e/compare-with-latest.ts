// Verifies the version list's "Compare with latest" hover action: on a prototype
// with at least two recorded versions, hovering an older row in the list and
// clicking the action closes the list, switches the pane to Compare, puts the
// mock half on that recorded version and the counterpart half on the live
// folder, and selects "Latest version" in the stage's Against control. Then
// "Declared" goes back to what the prototype declares.
// Read-only. Manual only — nothing runs this automatically.
//
// Usage:
//   ./singularity run plugins/apps/plugins/prototypes/plugins/compare/plugins/version/e2e/compare-with-latest.ts \
//     [--name <prototype id>] [--out <prefix>] [--headed]

import {
  arg,
  boot,
  pathUrl,
  report,
  snap,
  waitFor,
  withBrowser,
  ELEMENT_TIMEOUT_MS,
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";
import { compareHalfSelector } from "@plugins/apps/plugins/prototypes/plugins/compare/core";

const name = arg("name", "proto-1788797350-gqju");
const out = arg("out", "/tmp/compare-with-latest");

await withBrowser(async (h) => {
  const r = report(`compare with latest — ${name}`);
  const { page, captured } = await h.session();
  await boot(page, pathUrl(`/prototypes/proto/${name}`), {
    marker: "iframe",
    settleMs: 1000,
  });

  const label = page.getByRole("button", {
    name: /^(v\d+ (of \d+|· Latest)|Live · unsaved)$/,
  });
  await label.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT_MS });
  await label.click();

  const action = page.getByRole("button", { name: "Compare with latest" });
  // Rows are newest first, and the latest row offers no action, so the first
  // action belongs to the newest past version. Hover-revealed: hover it as a
  // person would, which reveals it.
  await page.waitForTimeout(1500);
  await snap(page, out, "list");
  r.ok("past versions offer Compare with latest", (await action.count()) > 0);
  await action.first().hover({ force: true });
  await snap(page, out, "hover-row");
  await action.first().click();

  const mock = page.locator(`${compareHalfSelector("mock")} iframe`);
  const counterpart = page.locator(
    `${compareHalfSelector("counterpart", "found")} iframe`,
  );
  const both = await waitFor(
    async () => ({
      mock: await mock.getAttribute("src", { timeout: 1000 }),
      counterpart: await counterpart.getAttribute("src", { timeout: 1000 }),
    }),
    (v) => v.mock !== null && v.counterpart !== null,
  );
  r.ok("the pane switched to Compare", both.ok, JSON.stringify(both.value));
  r.ok("the list closed", (await action.count()) === 0);
  r.ok(
    "the mock half shows a recorded version",
    both.value.mock?.includes("/versions/") === true,
    both.value.mock ?? "",
  );
  r.ok(
    "the counterpart half shows the live folder",
    both.value.counterpart?.includes("/index.html") === true &&
      !both.value.counterpart.includes("/versions/"),
    both.value.counterpart ?? "",
  );
  r.ok(
    "Against reads Latest version",
    await page
      .getByRole("radio", { name: "Latest version", checked: true })
      .isVisible(),
  );
  r.ok(
    "the URL names the compare stage",
    page.url().includes("/compare"),
    page.url(),
  );
  await snap(page, out, "compare");

  await page.getByRole("radio", { name: "Declared" }).click();
  await page.waitForTimeout(500);
  await snap(page, out, "declared");
  r.ok(
    "Declared is selected after clicking it",
    await page
      .getByRole("radio", { name: "Declared", checked: true })
      .isVisible(),
  );

  r.ok(
    "no page errors",
    captured.pageErrors.length === 0,
    captured.pageErrors.join(" | "),
  );
  await r.finish();
});
