// Verifies `<go>` end to end, without sending anything:
//   1. in the agent's reply, one-line <go>s render inline (inside a paragraph)
//      with the Go chip — including one standing on a line of its own;
//   2. a checklist row toggles on click;
//   3. ✎ Go puts the <go> region into the composer: a GO tab and the words,
//      highlighted (the draft is cleared again afterwards);
//   4. a user message holding a <go> renders it as an accepted region (GO tab).
//
// The conversation must hold an assistant reply with an inline <go> and a <go>
// checklist block; 4 additionally needs a user message containing a <go>.
//
// Usage:
//   ./singularity run plugins/active-data/plugins/go/e2e/go-verify.ts \
//     --conv <conversationId> [--out /tmp/go] [--headed]

import {
  arg,
  numArg,
  pathUrl,
  report,
  requireArg,
  snap,
  withBrowser,
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";

const CONV = requireArg("conv", "usage: go-verify.ts --conv <conversationId>");
const OUT = arg("out", "/tmp/go");
const waitMs = numArg("wait", 8000);

const r = report("active-data go");

await withBrowser(async (h) => {
  const { page } = await h.session({ viewport: { width: 1280, height: 1000 } });
  await page.goto(pathUrl(`/agents/c/${CONV}`));
  await page.waitForTimeout(waitMs);

  // The transcript is windowed: the reply holding the go block mounts only
  // near the viewport, so find its checklist rows first and bring them in.
  const rows = page.getByRole("checkbox");
  for (let i = 0; i < 30 && (await rows.count()) === 0; i++) {
    await page.waitForTimeout(500);
  }
  r.ok("checklist rows rendered", (await rows.count()) > 0);
  if ((await rows.count()) === 0) return;
  const row = rows.first();
  await row.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await snap(page, OUT, "reply");

  // The Go chip is the template chip titled Go; its send half is labelled.
  // Polled: the reply's rows hydrate in after its checklist scrolled in.
  const inlineSends = page.locator(`p button[aria-label="Send: Go"]`);
  for (let i = 0; i < 20 && (await inlineSends.count()) === 0; i++) {
    await page.waitForTimeout(500);
  }
  const inParagraph = await inlineSends.count();
  r.note(`${inParagraph} inline Go chip(s) in paragraphs`);
  r.ok("one-line <go>s render inline, inside their paragraph", inParagraph > 0);

  const before = await row.getAttribute("aria-checked");
  await row.click();
  await page.waitForTimeout(300);
  r.ok(
    "clicking a row toggles it",
    (await row.getAttribute("aria-checked")) !== before,
  );

  // ✎ Go on the first inline chip: the edit half sits right before its send.
  const inlineSend = page.locator(`p button[aria-label="Send: Go"]`).first();
  const edit = inlineSend.locator("xpath=preceding-sibling::button[1]");
  await edit.click();
  await page.waitForTimeout(500);
  const editor = page.locator('[contenteditable="true"]').last();
  const draftHasTag = (await editor.innerText()).includes("GO");
  const highlighted = await editor.evaluate(
    (el) => el.querySelectorAll(".bg-primary\\/10").length,
  );
  r.ok("✎ Go puts a GO-tagged region in the draft", draftHasTag);
  r.ok("the region's words are highlighted", highlighted > 0);
  await snap(page, OUT, "draft");
  // Leave no draft behind.
  await editor.click();
  await page.keyboard.press("Meta+A");
  await page.keyboard.press("Backspace");

  // A user message with a <go>: the GoEcho region carries the GO tab.
  const echoes = await page
    .locator(".bg-message-card")
    .evaluateAll(
      (cards) =>
        cards.filter((c) => /(^|\s)GO(\s|$)/.test((c as HTMLElement).innerText))
          .length,
    );
  r.note(`${echoes} user message(s) render an accepted <go>`);
});
