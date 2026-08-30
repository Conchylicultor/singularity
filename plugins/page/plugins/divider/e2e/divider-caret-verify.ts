// Visual verification of the void-block caret cue (`VoidCaretBox`,
// `page/editor/web/components/void-caret.tsx`): a divider shows "the editor's
// caret is on me" as a `bg-accent` tint, layered with the app's canonical
// `focus-ring` utility for real DOM keyboard focus — the two conditions are
// separate and only the second requires genuine `:focus-visible`.
//
// This script only CAPTURES screenshots for human review; it makes no visual
// assertions (a pixel-color check would be a second, weaker implementation of
// the same CSS this change ships). It does assert the mechanical setup steps
// succeeded (divider present, focus really moved), so a broken flow fails loudly
// instead of silently producing three identical screenshots.
//
// Usage: bun plugins/page/plugins/divider/e2e/divider-caret-verify.ts [--base <url>] [--out /tmp/divider-caret]
import {
  arg,
  baseUrl,
  report,
  snap,
  withBrowser,
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";
import type { Page } from "playwright";
import { openBlankPage } from "@plugins/page/plugins/editor/e2e";

const base = baseUrl();
const out = arg("out", "/tmp/divider-caret");
const r = report("divider-caret");

/**
 * Is `document.activeElement` the divider's OWN `VoidCaretBox` (`aria-label
 * "Divider"`), inside the given block? Scoping to `[tabindex="0"]` alone is not
 * enough — the hover-revealed drag handle in the same row also carries a literal
 * `tabindex="0"` attribute, so a plain attribute-selector match can pick that up
 * instead of the box that is actually focused.
 */
async function dividerIsActive(page: Page, blockId: string): Promise<boolean> {
  return page.evaluate((id: string) => {
    const active = document.activeElement;
    return (
      !!active &&
      active.getAttribute("aria-label") === "Divider" &&
      active.closest("[data-block-id]")?.getAttribute("data-block-id") === id
    );
  }, blockId);
}

/** A tight, zoomed-in crop around a block's row, for a close visual read. */
async function snapCloseUp(
  page: Page,
  outPrefix: string,
  name: string,
  blockId: string,
): Promise<void> {
  const rect = await page.evaluate((id: string) => {
    const el = document.querySelector(`[data-block-id="${id}"]`);
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { x: b.x, y: b.y, width: b.width, height: b.height };
  }, blockId);
  if (!rect) return;
  const pad = 12;
  await page.screenshot({
    path: `${outPrefix}-${name}.png`,
    clip: {
      x: Math.max(0, rect.x - pad),
      y: Math.max(0, rect.y - pad),
      width: Math.min(700, rect.width + pad * 2),
      height: rect.height + pad * 2,
    },
  });
  console.log(`wrote ${outPrefix}-${name}.png (close-up)`);
}

await withBrowser(async (h) => {
  const { page } = await h.session({ label: "A" });

  // --- divider caret cue: focused right after conversion, unfocused, then
  // refocused by keyboard --------------------------------------------------
  const doc = await openBlankPage(page, base, { settleMs: 3000 });
  r.note(`page ${doc.pageId}, first block ${doc.blockId}`);

  // A paragraph ABOVE the divider, so ArrowUp/ArrowDown have somewhere to go.
  await page.keyboard.type("A paragraph above the divider", { delay: 20 });
  await page.waitForTimeout(300);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);

  // Typing "---" is a `typingPrefixes` conversion (divider/core/divider-block.ts)
  // — it fires the moment the third "-" lands, converting the (empty) new block
  // in place. No trailing space/Enter needed.
  await page.keyboard.type("---", { delay: 40 });
  await page.waitForTimeout(800);

  const dividerBox = page.locator('[aria-label="Divider"]').first();
  // No `.catch(() => false)` on any `isVisible()` here: it already answers
  // false for a missing locator, so a catch could only ever absorb a REAL
  // failure (a crashed page, a closed context) into a legitimate-looking
  // "not visible" — which is the bug `no-absorbed-failure` names.
  const dividerVisible = await dividerBox.isVisible();
  r.ok("divider block appeared after typing '---'", dividerVisible);
  if (!dividerVisible) {
    r.fail(
      "cannot continue without a divider on screen",
      "stopping this phase",
    );
  } else {
    // Read the block id off the currently-focused element itself (the
    // conversion is in-place, so right after typing "---" the editor's focus
    // model — and therefore the DOM — should already point at the divider).
    // Resolving it this way, rather than by walking up from the `aria-label`
    // locator, is what's actually being verified in the next assertion.
    const dividerBlockId = await page.evaluate(
      () =>
        document.activeElement
          ?.closest("[data-block-id]")
          ?.getAttribute("data-block-id") ?? null,
    );
    if (!dividerBlockId) {
      r.fail("divider block id resolvable", "no ancestor [data-block-id]");
    } else {
      // 1. Focused right after conversion — the editor's focus model already
      // points here (the conversion is in-place), so this should show the cue.
      const activeAfterConvert = await dividerIsActive(page, dividerBlockId);
      r.ok(
        "divider box holds DOM focus right after conversion",
        activeAfterConvert,
      );
      await snap(page, out, "1-divider-focused-after-conversion");
      await snapCloseUp(page, out, "1-close-up", dividerBlockId);

      // 2. ArrowUp leaves the divider for the paragraph above — unfocused.
      await page.keyboard.press("ArrowUp");
      await page.waitForTimeout(400);
      const activeAfterUp = await dividerIsActive(page, dividerBlockId);
      r.ok("ArrowUp moved focus OFF the divider", !activeAfterUp);
      await snap(page, out, "2-divider-unfocused");
      await snapCloseUp(page, out, "2-close-up", dividerBlockId);

      // 3. ArrowDown returns to the divider BY KEYBOARD — programmatic focus
      // from a keydown, which should still satisfy `:focus-visible` and so show
      // both the tint (`bg-accent`) and the `focus-ring`.
      await page.keyboard.press("ArrowDown");
      await page.waitForTimeout(400);
      const activeAfterDown = await dividerIsActive(page, dividerBlockId);
      r.ok("ArrowDown moved focus BACK onto the divider", activeAfterDown);
      await snap(page, out, "3-divider-focused-via-keyboard");
      await snapCloseUp(page, out, "3-close-up", dividerBlockId);
    }
  }

  // --- sub-page row, for a tint comparison ---------------------------------
  // Turn the paragraph above into a sub-page ("Turn into" -> "Page"): its Row
  // paints the same fact via `selected` + `hover="accent"`, which resolves to
  // the same `bg-accent`.
  {
    const paraBlock = page
      .getByText("A paragraph above the divider", { exact: true })
      .first();
    const paraBox = await paraBlock.evaluate((el) => {
      const row = el.closest("[data-block-id]");
      if (!row) return null;
      const b = row.getBoundingClientRect();
      return {
        x: b.left + b.width * 0.6,
        y: b.top + Math.min(12, b.height / 2),
      };
    });
    if (!paraBox) {
      r.fail(
        "paragraph row locatable for hover",
        "closest [data-block-id] missing",
      );
    } else {
      await page.mouse.move(paraBox.x, paraBox.y);
      await page.waitForTimeout(300);
      const handle = page
        .locator('button[aria-label="Reorder or open block actions"]')
        .first();
      const handleVisible = await handle.isVisible();
      r.ok("block-actions handle revealed on hover", handleVisible);
      if (handleVisible) {
        await handle.click();
        await page.waitForTimeout(400);
        const popover = page.locator('[data-slot="popover-content"]');
        const pageEntry = popover.getByText("Page", { exact: true }).first();
        const entryVisible = await pageEntry.isVisible();
        r.ok('"Turn into → Page" entry reachable', entryVisible);
        if (entryVisible) {
          await pageEntry.click();
          await page.waitForTimeout(1500);
          // The block keeps its own id across the conversion (its text becomes
          // the new page's title) — scope by that id rather than by role or
          // text, since a sub-page row is a plain `Row`, not an ARIA button.
          const subPageRow = page.locator(`[data-block-id="${doc.blockId}"]`);
          const subPageVisible = await subPageRow.first().isVisible();
          r.ok("sub-page row rendered after Turn into → Page", subPageVisible);
          if (subPageVisible) {
            r.note(
              `sub-page row text: ${await subPageRow.first().innerText()}`,
            );
            // Focus it BY KEYBOARD rather than clicking it — a click on a
            // sub-page row navigates into the referenced page (its own
            // onClick), which is not what this capture wants. The divider is
            // still the block right below it, so clicking there and arrowing
            // up lands the caret on the sub-page row without opening it.
            const dividerBoxAgain = page
              .locator('[aria-label="Divider"]')
              .first();
            if (await dividerBoxAgain.isVisible()) {
              await dividerBoxAgain.click();
              await page.waitForTimeout(300);
              await page.keyboard.press("ArrowUp");
              await page.waitForTimeout(400);
              await snap(page, out, "4-subpage-row-focused");
              await snapCloseUp(page, out, "4-close-up", doc.blockId);
            } else {
              r.fail(
                "divider still present below the new sub-page row",
                "cannot reach the sub-page row by keyboard for this capture",
              );
            }
          }
        }
      }
    }
  }
});

await r.finish();
