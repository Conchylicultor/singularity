/**
 * Page-error / console-error / failed-request capture.
 *
 * `page.on("pageerror", …)` appeared in ~12 of the pre-move scripts, console-error
 * collection in 4 more, and failed-request collection in one — each with its own
 * array shape. One shape here, with live arrays a script can assert on at the end
 * ("no page errors during the run") without threading state through the flow.
 */
import type { Page } from "playwright";

export interface Captured {
  pageErrors: string[];
  consoleErrors: string[];
  /** `<method> <url> — <failure text>` for requests the browser never completed. */
  failedRequests: string[];
}

/**
 * Attach the three listeners and return the arrays they fill. Each line is also
 * echoed to stdout as it happens (prefixed with `label` when several contexts are
 * in play, e.g. the A/B pages of a convergence test) so a failing run is
 * diagnosable from the transcript alone, not just from the final assertion.
 */
export function capture(page: Page, label?: string): Captured {
  const tag = label ? `(${label})` : "";
  const captured: Captured = {
    pageErrors: [],
    consoleErrors: [],
    failedRequests: [],
  };

  page.on("pageerror", (err) => {
    captured.pageErrors.push(err.message);
    console.log(`PAGEERROR${tag}:`, err.message);
  });

  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    captured.consoleErrors.push(msg.text());
    console.log(`CONSOLE-ERROR${tag}:`, msg.text());
  });

  page.on("requestfailed", (req) => {
    const line = `${req.method()} ${req.url()} — ${req.failure()?.errorText ?? "unknown"}`;
    captured.failedRequests.push(line);
    console.log(`REQUESTFAILED${tag}:`, line);
  });

  return captured;
}
