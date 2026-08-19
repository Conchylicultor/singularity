// Verifies the Present menu on a prototype's detail pane: each of the four
// destinations actually takes the prototype somewhere, and Escape brings it
// back. Manual only — nothing runs this automatically.
//
// Usage:
//   bun plugins/apps/plugins/prototypes/plugins/present/e2e/present-verify.ts \
//     [--name <prototype>] [--out <prefix>] [--headed]

import {
  arg,
  baseUrl,
  boot,
  pathUrl,
  report,
  snap,
  withBrowser,
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";

const out = arg("out", "/tmp/present-verify");

async function firstPrototypeName(): Promise<string> {
  const res = await fetch(`${baseUrl()}/api/prototypes`);
  if (!res.ok) throw new Error(`GET /api/prototypes → ${res.status}`);
  const rows = (await res.json()) as { name: string }[];
  const first = rows[0];
  if (!first) throw new Error("no prototypes exist to present");
  return first.name;
}

const name = arg("name") ?? (await firstPrototypeName());

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
  r.finish();
});
