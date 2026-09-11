// Drives the image viewer in a real conversation: open a transcript image, click
// it to zoom, drag, fit again, step to the next image, close — and checks each
// step's visible state (zoom readout, counter, focus) plus no page errors.
//
// Usage:
//   ./singularity run plugins/primitives/plugins/overlay/plugins/image-viewer/e2e/viewer-verify.ts \
//     --conv <conversation id with ≥ 2 transcript images> [--out /tmp/image-viewer]

import {
  pathUrl,
  report,
  requireArg,
  arg,
  snap,
  withBrowser,
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";

const conv = requireArg(
  "conv",
  "viewer-verify.ts --conv <conversation id with ≥ 2 transcript images> [--out <dir>]",
);
const OUT = arg("out", "/tmp/image-viewer");
const r = report("image viewer");

await withBrowser(async (h) => {
  const { page, captured } = await h.session({
    viewport: { width: 1400, height: 900 },
  });
  await page.goto(pathUrl(`/agents/c/${conv}`));

  const thumbs = page.getByRole("button", { name: /^View image / });
  await thumbs.first().waitFor({ timeout: 30_000 });
  // Let the transcript finish rendering its images.
  await page.waitForTimeout(2000);
  const count = await thumbs.count();
  r.ok(
    "transcript shows at least two image thumbnails",
    count >= 2,
    `found ${count}`,
  );

  const dialog = page.getByRole("dialog", { name: /^Image viewer/ });
  const zoom = async () => {
    const text = await dialog.getByText(/^\d+%$/).textContent();
    return Number(text?.replace("%", ""));
  };
  const counter = () => dialog.getByText(/^\d+ \/ \d+$/).textContent();
  // The viewer's own image: the first <img> in the dialog (the minimap's comes later).
  const stageImg = dialog.locator("img").first();
  // "At fit" is the Fit button pressed — wait for it rather than a fixed delay:
  // the readout passes through the thumbnail's scale while the image grows out
  // of it, and on a loaded host that animation can outlast any sleep.
  const atFit = () =>
    dialog
      .locator('button[aria-pressed="true"]', { hasText: "Fit" })
      .waitFor({ timeout: 10_000 });

  const first = thumbs.first();
  await first.scrollIntoViewIfNeeded();
  const urlBefore = page.url();
  await first.click();
  await dialog.waitFor({ timeout: 5000 });
  await atFit();
  await page.waitForTimeout(400);
  const fit = await zoom();
  r.ok("opens fitted, never above 100%", fit > 0 && fit <= 100, `fit=${fit}%`);
  r.eq("counter starts at the clicked image", await counter(), `1 / ${count}`);
  await snap(page, OUT, "1-fit");

  // Click the image: fit → closer view at that spot.
  const box = await stageImg.boundingBox();
  if (!box) r.fail("viewer image has a box");
  else {
    await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.3);
    await page.waitForTimeout(700);
    const detail = await zoom();
    r.ok("click zooms in past fit", detail > fit, `fit=${fit}% → ${detail}%`);
    if (fit < 80) r.eq("a shrunk image zooms to 100%", detail, 100);
    else
      r.ok(
        "a near-full-size image zooms to a whole-number 2–8×",
        [200, 300, 400, 500, 600, 700, 800].includes(detail),
        `fit=${fit}% → ${detail}%`,
      );
    await snap(page, OUT, "2-zoomed");

    // Drag pans the zoomed image.
    const before = await stageImg.boundingBox();
    await page.mouse.move(700, 450);
    await page.mouse.down();
    await page.mouse.move(500, 350, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    const after = await stageImg.boundingBox();
    const moved =
      !!before && !!after && (before.x !== after.x || before.y !== after.y);
    r.ok(
      "drag pans the zoomed image",
      moved,
      `before=${JSON.stringify(before)} after=${JSON.stringify(after)}`,
    );
  }

  await page.keyboard.press("0");
  await atFit();
  r.eq("0 returns to fit", await zoom(), fit);

  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(600);
  r.eq("→ steps to the next image", await counter(), `2 / ${count}`);
  await snap(page, OUT, "3-next");

  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
  r.eq("Esc closes the viewer", await dialog.count(), 0);
  r.eq("Esc changes nothing else (same URL)", page.url(), urlBefore);
  const focused = await page.evaluate(
    () => document.activeElement?.getAttribute("aria-label") ?? "",
  );
  r.ok(
    "focus returns to a thumbnail",
    focused.startsWith("View image "),
    `focused=${focused}`,
  );

  r.eq("no page errors", captured.pageErrors, []);
  await r.finish();
});
