/**
 * Screenshot writing. ~20 of the pre-move scripts hand-wrote
 * `${out}-before.png` plus a `console.log("wrote …")` on every capture.
 */
import type { Page } from "playwright";
import { pushDiagnostic } from "./diagnostics";

/**
 * Cap on a single capture. Playwright's own default is 30s, and it awaits
 * `document.fonts.ready` before every screenshot — so a font that never
 * finishes loading turns a cosmetic capture into a half-minute stall and then a
 * TimeoutError. Ten seconds is far longer than a healthy capture needs.
 */
export const DEFAULT_SNAP_TIMEOUT_MS = 10_000;

export type SnapResult =
  | { ok: true; path: string }
  | { ok: false; path: string; error: string };

/**
 * Write `${outPrefix}-${name}.png` and log the path (the transcript is how an
 * agent finds the image afterwards).
 *
 * A screenshot is a diagnostic, not an assertion, so this never throws: a
 * failure is reported loudly (here and again in `report().finish()`) but leaves
 * the run's verdict to the actual checks. The result is a discriminated union
 * rather than a nullable path so a caller that *does* care cannot mistake a
 * failure for a success.
 */
export async function snap(
  page: Page,
  outPrefix: string,
  name: string,
  opts: { timeoutMs?: number } = {},
): Promise<SnapResult> {
  const path = `${outPrefix}-${name}.png`;
  try {
    await page.screenshot({ path, timeout: opts.timeoutMs ?? DEFAULT_SNAP_TIMEOUT_MS });
    console.log(`wrote ${path}`);
    return { ok: true, path };
  } catch (err) {
    const error = err instanceof Error ? err.message.split("\n")[0]! : String(err);
    console.log(`SNAP-FAIL ${path} — ${error}`);
    pushDiagnostic(`screenshot ${path} — ${error}`);
    return { ok: false, path, error };
  }
}
