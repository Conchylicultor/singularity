// E2E verification for the page-editor image block.
// Flow: open Pages → create a page → /image → upload a file →
// assert <img> renders → drag the resize handle → report the persisted width.
//
// Usage: bun plugins/page/plugins/image/e2e/image-block.ts [--base <url>] [--image <path>]
import {
  arg,
  baseUrl,
  snap,
  withBrowser,
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";

const BASE = baseUrl();
const IMG = arg("image", "/tmp/test-image.png");
const OUT = "/tmp/imgblock";

await withBrowser(async (h) => {
  const { page } = await h.session();
  // Broader than the harness capture (which logs errors only): this flow is a
  // probe, and the block's upload path chatters at log/warn level too.
  page.on("console", (m) => console.log("  [page]", m.type(), m.text()));

  await page.goto(`${BASE}/pages`);
  await page.waitForTimeout(2500);

  // 1. Create a new page.
  await page.getByRole("button", { name: "New Page" }).first().click();
  await page.waitForTimeout(1500);

  // 2. Land the caret in the (empty) body, then convert via the inline `/` menu.
  await page.getByRole("listbox", { name: "Page blocks" }).click();
  await page.waitForTimeout(500);
  await page.keyboard.type("/image");
  await page.waitForTimeout(400);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(800);

  // 3. Confirm the empty placeholder rendered.
  const placeholder = page.getByText("Add an image", { exact: false });
  console.log("placeholder visible:", await placeholder.count());
  await snap(page, OUT, "empty");

  // 4. Upload via the hidden file input.
  await page.setInputFiles('input[type="file"]', IMG);

  // 5. Wait for the rendered image.
  const img = page.locator('img[src^="/api/attachments/"]');
  await img.first().waitFor({ state: "visible", timeout: 15000 });
  const src = await img.first().getAttribute("src");
  if (!src) throw new Error("rendered image has no src attribute");
  const attachmentId = src.replace("/api/attachments/", "");
  await page.waitForTimeout(800);
  await snap(page, OUT, "filled");
  console.log("attachmentId:", attachmentId);

  // Identify the owning block id from the data-block-id ancestor.
  const blockId = await img.first().evaluate((el) => {
    const row = el.closest("[data-block-id]");
    return row?.getAttribute("data-block-id") ?? null;
  });
  console.log("blockId:", blockId);

  // 6. Resize: drag the handle left by 80px (shrink), commit on pointerup.
  const wrapper = page.locator('[aria-label="Resize image"]').first();
  const box = await wrapper.boundingBox();
  if (!box) throw new Error("resize handle has no bounding box");
  const startW = await img.first().evaluate((el) => el.getBoundingClientRect().width);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x - 80, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(1000);
  const endW = await img.first().evaluate((el) => el.getBoundingClientRect().width);
  await snap(page, OUT, "resized");
  console.log("width before resize:", Math.round(startW), "after:", Math.round(endW));

  console.log(
    JSON.stringify({
      attachmentId,
      blockId,
      startW: Math.round(startW),
      endW: Math.round(endW),
    }),
  );
});
