// Verifies the Present menu on a prototype's detail pane: each of the four
// destinations actually takes the prototype somewhere, the options picker comes
// along (and still switches the variant while fullscreen), and Escape brings it
// back. Manual only — nothing runs this automatically.
//
// Usage:
//   ./singularity run plugins/apps/plugins/prototypes/plugins/present/e2e/present-verify.ts \
//     [--name <prototype>] [--out <prefix>] [--headed]

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
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";
import {
  humanizeToken,
  type PrototypeMeta,
} from "@plugins/apps/plugins/prototypes/plugins/files/core";

const out = arg("out", "/tmp/present-verify");

/**
 * The prototype to present: the named one, else the first that declares options
 * (a theme, a palette) — those are what the picker assertions need. Falls back
 * to the first prototype at all, and the picker assertions then skip.
 */
async function target(): Promise<PrototypeMeta> {
  const res = await agentFetch(`/api/prototypes`);
  if (!res.ok) throw new Error(`GET /api/prototypes → ${res.status}`);
  const rows = (await res.json()) as PrototypeMeta[];
  const wanted = arg("name");
  const meta = wanted
    ? rows.find((p) => p.name === wanted)
    : (rows.find((p) => p.options.length > 0) ?? rows[0]);
  if (!meta)
    throw new Error(
      wanted ? `no prototype ${wanted}` : "no prototypes exist to present",
    );
  return meta;
}

const meta = await target();
const name = meta.name;
// The option a chip will switch while fullscreen, and a value that is not the
// one already on screen. Absent when the prototype declares no options.
const option = meta.options.find((o) => o.values.some((v) => v !== o.default));
const otherValue = option?.values.find((v) => v !== option.default);

/** The prototype document's frame URL, wherever it is mounted. */
function frameUrl(page: Page): string | undefined {
  return page
    .frames()
    .find((f) => f.url().includes(`/api/prototypes/${name}/index.html`))
    ?.url();
}

await withBrowser(async (h) => {
  const r = report(`present — ${name}`);
  const { page, context, captured } = await h.session();
  await boot(page, pathUrl(`/prototypes/proto/${name}`), {
    marker: "iframe",
    settleMs: 1000,
  });

  const present = page.getByRole("button", { name: "Present" });
  const dialog = page.getByRole("dialog");
  // One chip of the app tab strip — the thing "In this app tab" must NOT
  // cover, and the thing every other destination does cover.
  const tabChip = page.locator("[data-app-tab]").first();
  const picker = dialog.getByLabel("Prototype options");

  /** The picker travels with the presentation — the only way to switch variant
      once the pane header is gone. Skipped on a prototype declaring none. */
  async function pickerIsPresent(where: string) {
    if (!option) return;
    r.ok(
      `the options picker is on the ${where} presentation`,
      (await picker.count()) === 1,
    );
  }

  // --- In this app tab ---------------------------------------------------
  await present.click();
  await page.getByRole("menuitem", { name: "In this app tab" }).click();
  await dialog.waitFor({ state: "visible", timeout: 5000 });
  const surfaceBox = await dialog.boundingBox();
  const viewport = page.viewportSize();
  r.ok(
    "in-this-app-tab fills the surface, not the viewport",
    surfaceBox != null &&
      viewport != null &&
      // Starts strictly below the top of the page: the tab bar is still on
      // screen above it. Width may legitimately equal the viewport's (the rail
      // can be hidden), so height/top is the load-bearing assertion.
      surfaceBox.y > 1 &&
      surfaceBox.height < viewport.height - 1,
    `dialog ${JSON.stringify(surfaceBox)} viewport ${JSON.stringify(viewport)}`,
  );
  r.ok(
    "presented stage shows the prototype",
    (await dialog.locator("iframe").count()) === 1,
  );
  r.ok("the app tab bar is still visible", await tabChip.isVisible());
  await pickerIsPresent("in-this-app-tab");
  await snap(page, out, "in-this-app-tab");

  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached", timeout: 5000 });
  r.ok("Escape leaves the surface presentation", (await dialog.count()) === 0);

  // --- In this browser tab -----------------------------------------------
  await present.click();
  await page.getByRole("menuitem", { name: "In this browser tab" }).click();
  await dialog.waitFor({ state: "visible", timeout: 5000 });
  const box = await dialog.boundingBox();
  r.ok(
    "in-this-browser-tab fills the viewport",
    box != null &&
      viewport != null &&
      box.width >= viewport.width - 1 &&
      box.height >= viewport.height - 1,
    `dialog ${JSON.stringify(box)} viewport ${JSON.stringify(viewport)}`,
  );
  await pickerIsPresent("in-this-browser-tab");
  await snap(page, out, "in-this-browser-tab");

  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached", timeout: 5000 });
  r.ok("Escape leaves the presentation", (await dialog.count()) === 0);

  // --- Fullscreen --------------------------------------------------------
  await present.click();
  await page.getByRole("menuitem", { name: "Fullscreen" }).click();
  await dialog.waitFor({ state: "visible", timeout: 5000 });
  // The fullscreen transition is async — poll rather than sampling once.
  const fullscreened = await page
    .waitForFunction(() => document.fullscreenElement !== null, null, {
      timeout: 5000,
    })
    .then(
      () => true,
      () => false,
    );
  r.ok("fullscreen hands the stage to the browser", fullscreened);
  await pickerIsPresent("fullscreen");
  // The load-bearing one: the picker still WORKS inside the fullscreened
  // element — hovering opens its chips, and a chip reloads the frame on the
  // picked variant, with no pane header to go back to.
  if (option && otherValue !== undefined) {
    await picker.hover();
    const group = dialog.getByRole("radiogroup", {
      name: humanizeToken(option.name),
    });
    await group.waitFor({ state: "visible", timeout: 5000 });
    await group.getByRole("radio", { name: humanizeToken(otherValue) }).click();
    const switched = await waitFor(
      () => Promise.resolve(frameUrl(page)),
      (url) =>
        url !== undefined && url.includes(`${option.name}=${otherValue}`),
      { timeoutMs: 15_000 },
    );
    r.ok(
      `a chip switches ${option.name} to "${otherValue}" while fullscreen`,
      switched.ok,
      switched.value,
    );
    await page.mouse.move(5, 5);
  }
  await snap(page, out, "fullscreen");
  await page.evaluate(async () => {
    if (document.fullscreenElement) await document.exitFullscreen();
  });
  await dialog.waitFor({ state: "detached", timeout: 5000 });
  r.ok(
    "leaving fullscreen closes the presentation",
    (await dialog.count()) === 0,
  );

  // --- New browser tab ---------------------------------------------------
  await present.click();
  const opened = context.waitForEvent("page", { timeout: 5000 });
  await page.getByRole("menuitem", { name: "New browser tab" }).click();
  const tab = await opened;
  await tab.waitForLoadState("domcontentloaded");
  r.ok(
    "new tab opens the raw prototype document",
    new URL(tab.url()).pathname === `/api/prototypes/${name}/index.html`,
    tab.url(),
  );
  r.ok(
    "new tab carries the cache-bust",
    new URL(tab.url()).searchParams.has("v"),
  );
  await tab.close();

  r.ok(
    "no page errors",
    captured.pageErrors.length === 0,
    captured.pageErrors.join(" | "),
  );
  await r.finish();
});
