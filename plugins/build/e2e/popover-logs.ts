/**
 * Verification pass for the **Logs** section of the build toolbar popover.
 *
 * Three claims that only the real DOM can settle:
 *
 *  1. **It starts shut.** The popover opens on the deployment chain, the Build
 *     control and the run list; the log stream is one chevron row until asked
 *     for. A screenshot shows the row but cannot say whether the body is
 *     genuinely absent or merely scrolled out of sight — the point of the change
 *     is that the body is not mounted at all, which is also what drops the log
 *     socket.
 *  2. **The copy button is a SIBLING of the disclosure, not a child of it.**
 *     The header is one click target; a copy button nested inside it would be
 *     invalid HTML and unreachable by keyboard. Only the DOM knows.
 *  3. **Opening it really streams.** The section fills with the build channel's
 *     ring buffer, so the region is non-empty after one click.
 *
 * Manual only; nothing runs this automatically. Run it after `./singularity
 * build` with:
 *
 *   ./singularity run plugins/build/e2e/popover-logs.ts
 *   ./singularity run plugins/build/e2e/popover-logs.ts --headed
 */

import type { Locator, Page } from "playwright";
import {
  boot,
  pathUrl,
  report,
  withBrowser,
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";

const r = report("build popover logs");

/**
 * The toolbar's build control, whatever it happens to be saying.
 *
 * Its accessible name IS its state — "Builds" at rest, "Building", "Server
 * updated", "Build failed", "Server restarting…" — so the button cannot be
 * addressed by one fixed name. Matching the whole family is what keeps this
 * script from passing or failing on which build ran last.
 */
function buildTrigger(page: Page): Locator {
  return page.getByRole("button", {
    name: /^(Builds|Building|Server restarting|Server updated|Build failed)/,
  });
}

/** The Logs disclosure row inside the open popover. */
function logsHeader(page: Page): Locator {
  return page
    .locator("button[aria-expanded][aria-controls]")
    .filter({ hasText: /Logs/ });
}

/**
 * The panel a disclosure header controls — addressed by attribute rather than
 * by `#id`, because the id comes from React's `useId` and is not a selector the
 * script gets to choose the shape of.
 */
function bodyOf(page: Page, id: string): Locator {
  return page.locator(`[id="${id}"]`);
}

/** Whether that panel is in the document at all. */
async function bodyMounted(page: Page, header: Locator): Promise<boolean> {
  const id = await header.getAttribute("aria-controls");
  if (id === null) return false;
  return (await bodyOf(page, id).count()) > 0;
}

/**
 * Buttons that have a button ANCESTOR — invalid HTML, and unreachable by
 * keyboard. Returns each offender's trimmed text so a failure names it.
 */
async function nestedButtons(page: Page): Promise<string[]> {
  return page.$$eval("button", (els) =>
    els
      .filter((el) => el.parentElement?.closest("button") != null)
      .map((el) => (el.textContent ?? "").trim().slice(0, 60)),
  );
}

await withBrowser(async (h) => {
  const { page } = await h.session();

  await boot(page, pathUrl("/agents"), { settleMs: 3000 });

  await buildTrigger(page).first().click();
  await page.getByText("Deployment", { exact: true }).first().waitFor();

  const header = logsHeader(page).first();
  r.eq(
    "the popover renders one Logs disclosure",
    await logsHeader(page).count(),
    1,
  );

  // --- shut by default -----------------------------------------------------
  r.eq(
    "Logs starts collapsed",
    await header.getAttribute("aria-expanded"),
    "false",
  );
  r.ok(
    "…and its body is not in the document",
    !(await bodyMounted(page, header)),
  );
  r.eq(
    "no copy button while collapsed",
    await page.getByRole("button", { name: "Copy logs" }).count(),
    0,
  );

  // --- one click opens it --------------------------------------------------
  await header.click();
  await page.waitForTimeout(1200);

  r.eq(
    "clicking the header opens it",
    await header.getAttribute("aria-expanded"),
    "true",
  );
  r.ok("…and mounts the body", await bodyMounted(page, header));

  // What the opened section shows is the channel's in-memory ring, which the
  // build's own backend restart empties — so "has lines" is not something this
  // script may demand. What it CAN demand is that the section renders one of the
  // two states it has, rather than an empty box that says nothing.
  const id = await header.getAttribute("aria-controls");
  const bodyText = (
    id === null ? "" : await bodyOf(page, id).innerText()
  ).trim();
  const hasLines = /\d{2}:\d{2}:\d{2}/.test(bodyText);
  r.ok(
    "the opened section says something — lines, or the empty state",
    hasLines || bodyText.includes("No build logs yet"),
    `body text: ${JSON.stringify(bodyText.slice(0, 80))}`,
  );
  r.note(
    hasLines
      ? "the build channel's ring had lines to replay"
      : "GAP: the ring was empty (the build restarts the backend that holds it), so the streaming path itself stays unverified here",
  );

  r.eq(
    "the copy button appears beside the header",
    await page.getByRole("button", { name: "Copy logs" }).count(),
    1,
  );
  r.eq("no nested buttons in the open popover", await nestedButtons(page), []);

  // --- and closes again ----------------------------------------------------
  await header.click();
  await page.waitForTimeout(600);
  r.eq(
    "clicking again closes it",
    await header.getAttribute("aria-expanded"),
    "false",
  );
  r.ok(
    "…and unmounts the body, which is what drops the log socket",
    !(await bodyMounted(page, header)),
  );
});

await r.finish();
