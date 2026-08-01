/**
 * Typing a multi-line fixture into the editor.
 *
 * Every script that needs more than one block used to hand-roll
 * `type(line); press("Enter")`, and each copy was free to sleep around the Enter
 * — which is how the same 150ms workaround ended up duplicated into three
 * scripts and missing from two others. One helper is one typing policy.
 *
 * The policy is: **no artificial settles**. Enter-then-keystroke with zero delay
 * is a supported sequence — the editor's caret authority takes the keyboard on a
 * split, buffers input while the caret is in flight to the new block, and
 * replays it there (research/2026-07-31-page-caret-authority.md).
 * Before that, a keystroke landing in the gap was delivered to the ORIGIN's
 * contenteditable (already truncated, caret at the cut point), so "alpha" Enter
 * "bravo" typed back-to-back produced `["alphab", "ravo"]`. `split-typing-verify.ts`
 * is the gate that keeps this honest; a settle re-added here would silence it.
 */
import type { Page } from "playwright";

/**
 * One visible line. `indent` presses Tab (`"in"`) or Shift+Tab (`"out"`) before
 * typing it, so the line sits one level deeper / shallower than the one above.
 * The block type is inherited across the Enter, so an indented continuation of a
 * list must NOT re-type its markdown prefix.
 */
export type TypedLine = string | { text: string; indent?: "in" | "out" };

export interface TypeLinesOptions {
  /**
   * Press Enter BEFORE the first line, continuing into a fresh block below the
   * one the caret is standing in (rather than typing into it).
   */
  leadingEnter?: boolean;
  /**
   * Press Enter AFTER the last line, leaving the trailing empty block that the
   * flows asserting on a trailing `""` expect.
   */
  trailingEnter?: boolean;
}

/**
 * Type `lines` from the caret's current block, pressing Enter between them.
 *
 * No `delay`, and deliberately nothing to settle either side of an Enter — see
 * the module comment.
 */
export async function typeLines(
  page: Page,
  lines: readonly TypedLine[],
  opts: TypeLinesOptions = {},
): Promise<void> {
  if (opts.leadingEnter) await page.keyboard.press("Enter");
  for (const [i, line] of lines.entries()) {
    if (i > 0) await page.keyboard.press("Enter");
    const { text, indent } =
      typeof line === "string" ? { text: line, indent: undefined } : line;
    if (indent === "in") await page.keyboard.press("Tab");
    if (indent === "out") await page.keyboard.press("Shift+Tab");
    await page.keyboard.type(text);
  }
  if (opts.trailingEnter) await page.keyboard.press("Enter");
}
