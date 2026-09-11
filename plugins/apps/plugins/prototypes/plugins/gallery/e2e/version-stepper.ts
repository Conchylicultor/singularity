// Verifies the detail pane's version stepper on a prototype with at least two
// recorded versions: ‹ puts the Focus frame on a recorded version's frozen URL,
// the past-version pill (Restore, Back to latest) appears over the stage,
// `]` steps forward, Present's new browser
// tab opens the same version, the label opens the version list, and Back to
// latest returns every frame to the live folder. Throughout, the ‹ and › stay
// exactly where they were — the regression test for the arrows sliding out
// from under the pointer when Restore appeared or the label changed width.
// Read-only — it never restores. Manual only — nothing runs this automatically.
//
// Usage:
//   ./singularity run plugins/apps/plugins/prototypes/plugins/gallery/e2e/version-stepper.ts \
//     [--name <prototype id>] [--out <prefix>] [--headed]

import type { Page } from "playwright";
import {
  agentFetch,
  arg,
  boot,
  pathUrl,
  report,
  snap,
  waitFor,
  withBrowser,
  ELEMENT_TIMEOUT_MS,
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";
import type { PrototypeMeta } from "@plugins/apps/plugins/prototypes/plugins/files/core";

const out = arg("out", "/tmp/version-stepper");

async function pickName(): Promise<string> {
  const wanted = arg("name");
  if (wanted) return wanted;
  const res = await agentFetch(`/api/prototypes`);
  if (!res.ok) throw new Error(`GET /api/prototypes → ${res.status}`);
  const rows = (await res.json()) as PrototypeMeta[];
  const first = rows[0];
  if (!first) throw new Error("no prototypes exist to open");
  return first.name;
}

const name = await pickName();

/** The Focus frame's `src`, as the pane set it. */
async function frameSrc(page: Page): Promise<string> {
  const src = await page.locator("iframe").first().getAttribute("src");
  if (src === null) throw new Error("the stage iframe has no src");
  return src;
}

const isVersionSrc = (src: string) => src.includes("/versions/");

type Box = { x: number; y: number; width: number; height: number };

/** Where the ‹ and › are right now, as one comparable string. */
async function arrowBoxes(page: Page): Promise<string> {
  const box = async (label: string): Promise<Box> => {
    const b = await page.getByRole("button", { name: label }).boundingBox();
    if (b === null) throw new Error(`the ${label} button is not on screen`);
    return b;
  };
  return JSON.stringify([
    await box("Previous version"),
    await box("Next version"),
  ]);
}

await withBrowser(async (h) => {
  const r = report(`version stepper — ${name}`);
  const { page, captured } = await h.session();
  await boot(page, pathUrl(`/prototypes/proto/${name}`), {
    marker: "iframe",
    settleMs: 1000,
  });

  const prev = page.getByRole("button", { name: "Previous version" });
  await prev.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT_MS });
  // Pending history renders the arrows disabled too, so wait for the label to
  // name a version before reading whether ‹ can move at all.
  const label = page.getByRole("button", {
    name: /^(v\d+ (of \d+|· Latest)|Live · unsaved)$/,
  });
  await label.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT_MS });
  if (await prev.isDisabled()) {
    throw new Error(
      `${name} has a single version — let an agent turn edit it, or run \`./singularity prototype checkpoint ${name}\` after a hand edit, then re-run`,
    );
  }

  r.ok("opens on the live folder", !isVersionSrc(await frameSrc(page)));
  await snap(page, out, "live");
  const home = await arrowBoxes(page);
  const arrowsStay = async (when: string) => {
    const now = await arrowBoxes(page);
    r.ok(`the ‹ and › have not moved ${when}`, now === home, now);
  };

  // The Focus frame keeps the document on screen until the next one has
  // loaded, so its first iframe's src changing IS the new version showing.
  await prev.click();
  const moved = await waitFor(() => frameSrc(page), isVersionSrc);
  const versionSrc = moved.value;
  r.ok("‹ shows a recorded version", moved.ok, versionSrc);
  r.ok(
    "…with no picks or cache-bust on it",
    !versionSrc.includes("?"),
    versionSrc,
  );
  // Restore / Back to latest float over the stage in the past-version pill —
  // never in the header, whose width must not change as the stepper steps.
  const pill = page.getByRole("group", { name: "Past version" });
  const restore = pill.getByRole("button", { name: "Restore" });
  const back = pill.getByRole("button", { name: "Back to latest" });
  await pill.waitFor({ state: "visible", timeout: ELEMENT_TIMEOUT_MS });
  r.ok("the past-version pill is over the stage", await pill.isVisible());
  r.ok("Restore is offered", await restore.isVisible());
  r.ok("Back to latest is offered", await back.isVisible());
  await arrowsStay("after stepping back to a past version");
  await snap(page, out, "past-version");

  // A second step back, past → past, when the history is long enough.
  if (await prev.isEnabled()) {
    await prev.click();
    const older = await waitFor(
      () => frameSrc(page),
      (src) => isVersionSrc(src) && src !== versionSrc,
    );
    r.ok("‹ again shows an older version", older.ok, older.value);
    await arrowsStay("after stepping to an older version");
    await page.keyboard.press("]");
    const again = await waitFor(
      () => frameSrc(page),
      (src) => src === versionSrc,
    );
    r.ok("`]` steps forward to the version before", again.ok, again.value);
  }

  // Present's last destination opens the pane's own URL in a new tab.
  await page.getByRole("button", { name: "Present" }).click();
  const [tab] = await Promise.all([
    page.context().waitForEvent("page"),
    page.getByRole("menuitem", { name: /New browser tab/ }).click(),
  ]);
  r.ok(
    "Present's new tab opens that version",
    tab.url().includes("/versions/"),
    tab.url(),
  );
  await tab.close();

  // The label opens the version list.
  await label.click();
  await snap(page, out, "version-list");
  await page.keyboard.press("Escape");

  // Back to latest → the live folder, and the arrows are still where they were.
  await back.click();
  const live = await waitFor(
    () => frameSrc(page),
    (src) => !isVersionSrc(src),
  );
  r.ok("Back to latest shows the live folder", live.ok, live.value);
  r.ok("…and hides the past-version pill", !(await pill.isVisible()));
  await arrowsStay("after going back to latest");
  await snap(page, out, "back-to-latest");

  r.ok(
    "no page errors",
    captured.pageErrors.length === 0,
    captured.pageErrors.join(" | "),
  );
  await r.finish();
});
