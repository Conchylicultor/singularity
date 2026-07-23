/**
 * Screenshot writing. ~20 of the pre-move scripts hand-wrote
 * `${out}-before.png` plus a `console.log("wrote …")` on every capture.
 */
import type { Page } from "playwright";

/**
 * Write `${outPrefix}-${name}.png` and log the path (the transcript is how an
 * agent finds the image afterwards). Returns the path written.
 */
export async function snap(
  page: Page,
  outPrefix: string,
  name: string,
): Promise<string> {
  const path = `${outPrefix}-${name}.png`;
  await page.screenshot({ path });
  console.log(`wrote ${path}`);
  return path;
}
