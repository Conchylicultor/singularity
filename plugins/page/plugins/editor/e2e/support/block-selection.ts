/**
 * Entering block-selection mode from a script — and proving it stuck.
 *
 * Extracted from `copy-paste-verify.ts`, where the comments below were written.
 * Every script that drives the selection container needs the same click →
 * settle → Escape → extend dance, and every one of them then has to prove the
 * mode actually held: the settle is a workaround for a real async race, not
 * ceremony, and the check is what keeps a diverted keystroke from passing for
 * the wrong reason.
 *
 * Lives beside `blank-page.ts` rather than inside it: that module is "open a
 * document and read blocks out of it", this one is "drive the selection mode".
 */
import type { Report } from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";
import type { Page } from "playwright";
import { editableBlocks } from "./blank-page";

/**
 * How many visible LINES the block-selection highlight covers.
 *
 * The highlight is ONE element per run of consecutive selected lines, not one
 * per row (`web/components/selection-bands.tsx`), so counting elements
 * under-reports a multi-block selection. Each band publishes the number of lines
 * it spans on `data-selection-band`; sum them. Deliberately not a CSS-class
 * match: the scripts used to count `.bg-primary\/10`, which any restyle of the
 * highlight silently broke.
 */
export async function highlightedLines(page: Page): Promise<number> {
  return page.evaluate(() =>
    [...document.querySelectorAll("[data-selection-band]")].reduce(
      (total, el) => total + Number(el.getAttribute("data-selection-band")),
      0,
    ),
  );
}

export interface BlockSelectionDriver {
  /** Assert the selection container — not a block's editor — holds focus. */
  checkSelectionOwnsFocus(label: string): Promise<void>;
  /**
   * The selection bar's live "N selected" count (0 when nothing is selected —
   * the bar stays mounted, faded, so an empty selection reads as 0 rather than
   * as a missing element).
   *
   * This is the DIRECT measurement of whether a selection survived a gesture,
   * not a proxy for it. The alternative — inferring the selection from the
   * gesture's OUTCOME ("did two blocks move?") — reads the same number through
   * everything the gesture also touches, so it can move for a dozen unrelated
   * reasons and cannot say WHEN the selection was lost. Read it mid-gesture and
   * it says exactly that.
   */
  selectedCount(): Promise<number>;
  /**
   * Click block `blockIndex`, enter selection mode, and extend the range once
   * per `extendKeys` entry (none = the single clicked block).
   */
  enterBlockSelection(
    label: string,
    blockIndex: number,
    ...extendKeys: string[]
  ): Promise<void>;
}

export function blockSelectionDriver(
  page: Page,
  r: Report,
): BlockSelectionDriver {
  const block = (i: number) => editableBlocks(page).nth(i);

  // Entering block-selection mode is RACY, and losing the race silently swaps the
  // code path under test. ~300-500ms after a click lands in a block, an async
  // Lexical/@lexical/yjs focus steal drags DOM focus BACK into that block's
  // contenteditable with no user input (task-1784221574192-phh891). That fires
  // `useBlockSelection`'s onFocusCapture -> clearSelection(), destroying the block
  // selection without a trace.
  //
  // Every clipboard handler in block-editor.tsx opens with
  // `if (document.activeElement !== containerRef.current) return;`. Once the steal
  // wins, that guard returns early and Cmd+V falls through to the per-block Lexical
  // caret paste (block-forest-paste-plugin.tsx), which anchors on the caret's OWN
  // block — so the assertion after it measures the caret path while claiming to
  // measure block-selection mode, and can pass or fail for entirely the wrong
  // reason. Hence: assert ownership immediately before EACH clipboard op. The steal
  // is a wall-clock timer off the CLICK, so it can land between the Cmd+C and the
  // Cmd+V — empirically it does, which makes a single check before the copy vacuous
  // (the copy succeeds, only the paste is diverted).
  //
  // The container's `onKeyDown` origin guard makes this true of the KEYBOARD
  // actions too, not only the clipboard ones: Cmd+D reaches `actions.duplicate`
  // only while `e.target` is the container itself.
  async function checkSelectionOwnsFocus(label: string): Promise<void> {
    const focusStolen = await page.evaluate(
      () => document.activeElement?.getAttribute("contenteditable") === "true",
    );
    r.eq(
      `${label}: block selection owns focus (not stolen back into a block — task-1784221574192-phh891)`,
      focusStolen,
      false,
    );
  }

  /** The selection bar's live count ("N selected"). The bar stays mounted (faded) at 0. */
  async function selectedCount(): Promise<number> {
    return page.evaluate(() => {
      const el = [...document.querySelectorAll("span")].find((s) =>
        /^\d+ selected$/.test(s.textContent ?? ""),
      );
      return Number(el?.textContent?.split(" ")[0] ?? 0);
    });
  }

  // Settle past the steal BEFORE Escape (measured: click -> Escape -> Shift+Arrow
  // back-to-back reliably loses the selection; ~200ms+ makes it stick), then prove
  // focus actually stuck rather than trusting the sleep.
  async function enterBlockSelection(
    label: string,
    blockIndex: number,
    ...extendKeys: string[]
  ): Promise<void> {
    // A LIVE selection bar is pinned over the top of the document and swallows
    // pointer events — it is `pointer-events-none` only while inactive — so a
    // second `enterBlockSelection` in the same script cannot click a block near
    // the top of the page; the click retries until it times out. Drop the old
    // selection first, through the bar's own Clear button rather than Escape:
    // it is the one affordance guaranteed to be hittable while the bar is up,
    // and it assumes nothing about who currently holds focus (Escape clears only
    // when the container does, and ENTERS selection mode when a block does).
    if ((await selectedCount()) > 0) {
      await page.getByRole("button", { name: "Clear", exact: true }).click();
      await page.waitForTimeout(400); // the bar's 200ms fade-out
    }
    await block(blockIndex).click(); // caret in the block
    await page.waitForTimeout(500); // outlast the async focus steal before Escape
    await page.keyboard.press("Escape"); // -> selection mode, container focused
    for (const key of extendKeys) await page.keyboard.press(key); // extend the range
    await checkSelectionOwnsFocus(`${label} (entry)`);
  }

  return { checkSelectionOwnsFocus, selectedCount, enterBlockSelection };
}
