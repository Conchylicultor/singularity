// Verifies the options picker's Size row on a prototype's Focus stage: Fixed
// sizes the frame to the declared viewport, Mobile to a phone, Full to the
// whole stage at scale 1; and presenting opens at Full.
// Manual only — nothing runs this automatically.
//
// Usage:
//   ./singularity run plugins/apps/plugins/prototypes/plugins/gallery/e2e/frame-size.ts \
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
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";
import type { PrototypeMeta } from "@plugins/apps/plugins/prototypes/plugins/files/core";

const out = arg("out", "/tmp/frame-size");

const res = await agentFetch(`/api/prototypes`);
if (!res.ok) throw new Error(`GET /api/prototypes → ${res.status}`);
const rows = (await res.json()) as PrototypeMeta[];
const wanted = arg("name");
const found = wanted ? rows.find((p) => p.name === wanted) : rows[0];
if (!found) throw new Error(wanted ? `no prototype ${wanted}` : "no prototypes");
const meta = found;

/** The inner document's own viewport width/height, as the page sees it. */
async function frameViewport(page: Page): Promise<string | null> {
  const frame = page
    .frames()
    .find((f) => f.url().includes(`/api/prototypes/${meta.name}/index.html`));
  if (!frame) return null;
  return frame
    .evaluate(() => `${window.innerWidth}x${window.innerHeight}`)
    .catch((err: unknown) => {
      if (err instanceof Error && /navigat|detached|destroyed/i.test(err.message)) {
        return null;
      }
      throw err;
    });
}

async function pickSize(page: Page, label: string) {
  await page.getByLabel("Prototype options").hover();
  const group = page.getByRole("radiogroup", { name: "Size" });
  await group.waitFor({ state: "visible", timeout: 5000 });
  await group.getByRole("radio", { name: label }).click();
  await page.mouse.move(5, 5);
}

await withBrowser(async (h) => {
  const r = report(`frame size — ${meta.name}`);
  const { page } = await h.session({
    colorScheme: "dark",
    viewport: { width: 1600, height: 1000 },
  });
  await boot(page, pathUrl(`/prototypes/proto/${meta.name}`), {
    marker: "iframe",
    settleMs: 1500,
  });

  const fixed = `${meta.viewport.w}x${meta.viewport.h}`;
  const atFixed = await waitFor(() => frameViewport(page), (v) => v === fixed, {
    timeoutMs: 10_000,
  });
  r.ok("opens at the declared viewport", atFixed.ok, String(atFixed.value));
  await snap(page, out, "fixed");

  await pickSize(page, "Mobile");
  const atMobile = await waitFor(() => frameViewport(page), (v) => v === "390x844", {
    timeoutMs: 10_000,
  });
  r.ok("Mobile renders a 390×844 page", atMobile.ok, String(atMobile.value));
  await page.waitForTimeout(500);
  await snap(page, out, "mobile");

  await pickSize(page, "Full");
  const stage = await page.locator("iframe").first().boundingBox();
  const atFull = await waitFor(
    () => frameViewport(page),
    (v) => v !== null && v !== fixed && v !== "390x844",
    { timeoutMs: 10_000 },
  );
  r.ok(
    "Full renders the page at the stage's own size",
    atFull.ok && stage !== null && Math.abs(stage.width - Number(atFull.value?.split("x")[0])) <= 1,
    `${String(atFull.value)} frame box ${JSON.stringify(stage)}`,
  );
  await page.waitForTimeout(500);
  await snap(page, out, "full");

  // Back to Fixed, then present: presenting opens at Full.
  await pickSize(page, "Fixed");
  await page.getByRole("button", { name: "Present" }).click();
  await page.getByRole("menuitem", { name: /In this browser tab/ }).click();
  const presented = await waitFor(
    () => frameViewport(page),
    (v) => v === "1600x1000",
    { timeoutMs: 10_000 },
  );
  r.ok("presenting opens at Full", presented.ok, String(presented.value));
  await page.waitForTimeout(500);
  await snap(page, out, "presented");
  await page.keyboard.press("Escape");
  const back = await waitFor(() => frameViewport(page), (v) => v === fixed, {
    timeoutMs: 10_000,
  });
  r.ok("the pane keeps its own size after presenting", back.ok, String(back.value));
  await r.finish();
});
