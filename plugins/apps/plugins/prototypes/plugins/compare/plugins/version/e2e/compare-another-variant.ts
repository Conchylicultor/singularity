// Verifies Compare's "Another variant" counterpart: on a prototype declaring
// options, picking it frames the version on screen on both halves; picking a
// different value in the right half's Variant popover changes the right frame's
// URL only — the mock half (and the prototype's shared picks) stay as they were.
// Read-only: the right half's picks are held in the page, never written.
// Manual only — nothing runs this automatically.
//
// Usage:
//   ./singularity run plugins/apps/plugins/prototypes/plugins/compare/plugins/version/e2e/compare-another-variant.ts \
//     [--name <prototype id with options>] [--out <prefix>] [--headed]

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

const name = arg("name", "proto-1786908009-rgy6");
const out = arg("out", "/tmp/compare-another-variant");

await withBrowser(async (h) => {
  const r = report(`compare another variant — ${name}`);
  const { page, captured } = await h.session();
  await boot(page, pathUrl(`/prototypes/proto/${name}/compare`), {
    marker: "[role=radio]",
    settleMs: 1000,
  });

  const choice = page.getByRole("radio", { name: "Another variant" });
  await choice.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT_MS });
  await choice.click();

  const mock = page.locator(`${compareHalfSelector("mock")} iframe`);
  const counterpart = page.locator(
    `${compareHalfSelector("counterpart", "found")} iframe`,
  );
  const srcs = async () => ({
    mock: await mock.getAttribute("src", { timeout: 1000 }),
    counterpart: await counterpart.getAttribute("src", { timeout: 1000 }),
  });
  const before = await waitFor(
    srcs,
    (v) => v.mock !== null && v.counterpart !== null,
  );
  r.ok("both halves framed", before.ok, JSON.stringify(before.value));
  r.ok(
    "the halves open on the same variant",
    stripBust(before.value.mock) === stripBust(before.value.counterpart),
    JSON.stringify(before.value),
  );
  await snap(page, out, "opened");

  await page.getByRole("button", { name: /^Variant: / }).click();
  // The popover's own chips — the pane's options picker has the same rows.
  const other = page
    .getByText("The right half only.")
    .locator("..")
    .locator('[role="radio"][aria-checked="false"]')
    .first();
  await other.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT_MS });
  const picked = await other.textContent();
  await other.click();
  const chip = page
    .getByText("The right half only.")
    .locator("..")
    .getByRole("radio", { name: picked ?? "", exact: true });
  const on = await waitFor(
    async () => chip.getAttribute("aria-checked"),
    (v) => v === "true",
  );
  r.ok("the picked chip is on", on.ok, String(on.value));
  await snap(page, out, "picked");

  const after = await waitFor(
    srcs,
    (v) => v.counterpart !== null && v.counterpart !== before.value.counterpart,
  );
  r.ok(
    "the right half reloaded on another variant",
    after.ok,
    JSON.stringify(after.value),
  );
  r.ok(
    "the mock half did not change",
    after.value.mock === before.value.mock,
    JSON.stringify(after.value),
  );

  r.ok(
    "no page errors",
    captured.pageErrors.length === 0,
    captured.pageErrors.join(" | "),
  );
  await r.finish();
});

/** A frame URL without its live cache-bust, which the two halves may not share. */
function stripBust(src: string | null): string | null {
  if (src === null) return null;
  const url = new URL(src, "http://x");
  url.searchParams.delete("v");
  return `${url.pathname}?${url.searchParams.toString()}`;
}
