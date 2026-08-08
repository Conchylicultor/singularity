/**
 * Bound an await that carries no timeout option of its own.
 *
 * Every other step of a render (`chromium.launch`, `page.goto`,
 * `waitForLoadState`) takes a `timeout` and enforces it itself, so the plugin's
 * "a timeout throws, a partial page is never returned" contract is theirs to
 * keep. Exactly one step could not express that — `await import("playwright")`,
 * which takes no options — and being the one unbounded `await` in the chain is
 * what let a live backend park a refresh job for hours behind a promise that
 * never settled, with the 30 s launch bound and the 45 s whole-op budget both
 * sitting *after* it and therefore never armed.
 *
 * A separate file rather than an inline `Promise.race`, because this is the half
 * that has to be TESTED: the wedge it exists to prevent cannot be reproduced
 * through the real module loader, so the bound is proven here instead.
 */

/**
 * Await `work`, for at most `budgetMs`.
 *
 * On expiry it rejects with `onTimeout()` — the caller supplies the error so
 * this helper never invents a classification it cannot justify.
 *
 * What it deliberately does NOT do is cancel `work`. There is nothing to cancel
 * (a module import has no abort), and pretending otherwise would be the lie.
 * The caller therefore keeps its own handle on `work` and decides what a
 * still-in-flight promise means — see `loadPlaywright`, which keeps the memo so
 * the abandoned import is never orphaned and never started twice.
 */
export async function withDeadline<T>(
  work: Promise<T>,
  budgetMs: number,
  onTimeout: () => Error,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(onTimeout()), budgetMs);
      }),
    ]);
  } finally {
    // Always cleared, on every path: a live timer would hold the event loop open
    // for the rest of the budget after a fast success.
    clearTimeout(timer);
  }
}
