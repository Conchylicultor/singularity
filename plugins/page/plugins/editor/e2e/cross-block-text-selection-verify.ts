// Cross-block text drag-select, verified in a real browser.
//
// Every text-bearing block mounts its OWN Lexical instance, i.e. its own
// contenteditable EDITING HOST — and a browser clamps a mouse selection to the host
// it started in. So a drag out of a block never extended the selection; it COLLAPSED
// it back to a bare caret. Measured on the unfixed build (Chromium, commit bdbae71e5):
//
//   intra-block control drag  -> {collapsed: false, text: " heading"}   (fine)
//   block 1 -> block 3 drag   -> {collapsed: true,  text: ""}           (nothing)
//   selection bar             -> 0 selected, 0 highlighted rows
//   clipboard after Cmd+C     -> "" (empty)
//
// The fix promotes the gesture at the boundary: the browser keeps the drag while it
// stays inside the origin block, and the moment the pointer leaves that row the
// editor takes over and applies a whole-BLOCK range (Notion's model), which the
// existing block-selection clipboard path already serializes as indented markdown.
//
// Usage: bun plugins/page/plugins/editor/e2e/cross-block-text-selection-verify.ts [--base <url>]
import {
  baseUrl,
  report,
  withBrowser,
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";
import { editableBlocks, openBlankPage } from "./support/blank-page";

const base = baseUrl();
const r = report();

await withBrowser(async (h) => {
  const { context, page } = await h.session();
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);

  await openBlankPage(page, base, { settleMs: 3000 });

  // A heading, a bullet, and a bullet indented under it — so the clipboard assertion
  // covers per-type markdown prefixes AND nesting, not just line breaks.
  const type = async (line: string, indent = false) => {
    if (indent) await page.keyboard.press("Tab");
    await page.keyboard.type(line);
    await page.waitForTimeout(150);
  };
  // Settle either side of each Enter: a keystroke landing within ~20ms of a split can
  // be dropped (see the pre-seed note in the editor's CLAUDE.md), and back-to-back
  // typing loses each line's first character under host load. A setup flake, but it
  // scrambles every assertion downstream.
  await type("# Alpha heading");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(150);
  await type("- Bravo bullet");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(150);
  // Enter on a bullet already mints a bullet, so this line must NOT re-type the
  // "- " shortcut — the type is inherited and the marker would stay literal text.
  await type("Charlie nested", true);
  await page.waitForTimeout(2000);

  const block = (i: number) => editableBlocks(page).nth(i);
  r.eq("setup: three blocks", await editableBlocks(page).count(), 3);

  const readSelection = () =>
    page.evaluate(() => {
      const s = window.getSelection();
      const blockOf = (n: Node | null): string | null => {
        const el = n instanceof Element ? n : (n?.parentElement ?? null);
        return el?.closest("[data-block-id]")?.getAttribute("data-block-id") ?? null;
      };
      return {
        collapsed: s?.isCollapsed ?? true,
        anchorBlock: blockOf(s?.anchorNode ?? null),
        focusBlock: blockOf(s?.focusNode ?? null),
        text: s?.toString() ?? "",
      };
    });

  const selectedCount = (): Promise<number | null> =>
    page.evaluate(() => {
      const el = [...document.querySelectorAll("span")].find((s) =>
        /^\d+ selected$/.test(s.textContent ?? ""),
      );
      const n = el?.textContent?.split(" ")[0];
      return n === undefined ? null : Number(n);
    });

  const highlightedRows = (): Promise<number> =>
    page.evaluate(
      () => document.querySelectorAll("[data-block-id] .bg-primary\\/10").length,
    );

  const a = await block(0).boundingBox();
  const c = await block(2).boundingBox();
  if (!a || !c) throw new Error("no bounding boxes for the fixture blocks");

  // 1. CONTROL — the same gesture WITHIN one block must still be a plain text
  //    selection. This is the half of the feature the promotion must not eat.
  await page.mouse.move(a.x + a.width * 0.1, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width * 0.5, a.y + a.height / 2, { steps: 15 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const control = await readSelection();
  r.eq("intra-block drag still selects text", control.text.length > 0, true);
  r.eq("intra-block drag stays in ONE block", control.anchorBlock, control.focusBlock);
  r.eq("intra-block drag does NOT enter block-selection", (await selectedCount()) ?? 0, 0);

  // 2. Crossing a block boundary promotes to a full block range.
  await page.mouse.move(a.x + a.width * 0.4, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width * 0.6, a.y + a.height / 2, { steps: 5 });
  await page.mouse.move(c.x + c.width * 0.5, c.y + c.height / 2, { steps: 20 });
  await page.mouse.up();
  await page.waitForTimeout(500);

  r.eq("crossing blocks selects all three", await selectedCount(), 3);
  r.eq("all three rows are highlighted", await highlightedRows(), 3);
  const promoted = await readSelection();
  r.eq("no text caret is left parked in a block", promoted.text, "");

  // 3. The promoted range copies as markdown, prefixes and nesting intact — the
  //    already-built block-selection clipboard path, reached by the new gesture.
  await page.keyboard.press("ControlOrMeta+c");
  await page.waitForTimeout(500);
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  console.log("clipboard text/plain:\n---\n" + clip + "\n---");
  r.eq("clipboard is non-empty", clip.trim().length > 0, true);
  r.eq("clipboard kept the heading prefix", /(^|\n)#\s+Alpha heading/.test(clip), true);
  // `bulleted-list.markdownPrefixes` is ["* ", "- ", "+ "]; the serializer emits the
  // FIRST entry and the rest are parse-only aliases, so the round-trip is "* ".
  r.eq("clipboard kept the bullet prefix", /(^|\n)\*\s+Bravo bullet/.test(clip), true);
  r.eq("clipboard kept the nesting indent", /\n\s{2,}\*\s+Charlie nested/.test(clip), true);

  // 4. An upward drag promotes the same way (setRange slices either direction).
  await page.mouse.move(c.x + c.width * 0.5, c.y + c.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width * 0.4, a.y + a.height / 2, { steps: 20 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  r.eq("an upward cross-block drag selects all three", await selectedCount(), 3);
});
