/**
 * Hold a request at the server boundary, so a script can prove the UI rendered
 * something BEFORE the server could possibly have answered.
 *
 * Latency alone is a weak assertion — on a fast localhost a round-trip can beat
 * a slow poll — so an optimistic-rendering script stalls the write endpoint and
 * asserts the change is on screen well inside the stall. Only a genuine
 * optimistic overlay passes that.
 *
 * ## Why this exists rather than a hand-rolled `page.route`
 *
 * The obvious hand-rolled shape is "route, sleep in the handler, then `unroute`
 * when you're done stalling". That shape is silently broken, and the failure is
 * the worst kind: it makes a verification script go GREEN without exercising
 * the server.
 *
 * `page.unroute()` does NOT wait for handlers that are already running. When it
 * removes the last handler, Playwright clears the network-interception patterns,
 * which drives `Page.removeRequestInterceptor` →
 * `notifyRoutesInFlightAboutRemovedHandler` → the paused request is CONTINUED
 * right then, as a plain fallback. Two consequences:
 *
 *   1. The stall is silently cut short at the `unroute` — a script that meant to
 *      hold the server for 4s held it for however long it took to reach the
 *      teardown. Any assertion that depends on the request still being in flight
 *      is measuring nothing.
 *   2. The sleeping handler's eventual `route.continue()` hits the server-side
 *      `assert(!this._handled)` and throws `Route is already handled!`. That
 *      throw has nowhere to land — it propagates out of Playwright's internal
 *      `_onRoute` as an unhandled rejection. (`report()` now turns those into
 *      failures; before that it printed to stderr and the run still exited 0.)
 *
 * So this primitive never unroutes. The stall ends on a resolvable signal — an
 * elapsed timer or an explicit `release()` — and the handler that continues the
 * route is the same one that paused it. There is no teardown to race, and no
 * `unroute` in the API to reach for.
 *
 * ```ts
 * const op = await stallRoute(page, "**​/api/pages/*​/blocks/op", { ms: 4000 });
 * await page.keyboard.press("Meta+v");
 * // … assert the rows are on screen well inside the 4s …
 * r.eq("the gesture was ONE op POST", op.count, 1);
 * await op.release();          // continue now; resolves once it really landed
 * ```
 */
import type { BrowserContext, Page } from "playwright";

export interface StalledRoute {
  /**
   * Every request that has matched the pattern so far — stalled and
   * passed-through alike. This is the "how many POSTs did that gesture make"
   * counter scripts would otherwise hand-roll beside the route.
   */
  readonly count: number;
  /**
   * End the stall now: any paused request is continued immediately and nothing
   * is stalled again (later matches pass straight through). Resolves once the
   * paused requests have actually been continued, so the next line can wait on
   * the server's answer rather than on a guessed timeout.
   *
   * Total and idempotent: calling it when nothing is paused — or twice —
   * resolves immediately.
   */
  release(): Promise<void>;
}

export interface StallRouteOptions {
  /** How long a stalled request is held before it continues on its own. */
  ms: number;
  /**
   * How many matching requests to stall, defaulting to the FIRST one only.
   *
   * One is almost always what a script wants: it isolates "did the UI wait for
   * the server" for the gesture under test, while every later request — the
   * confirming write, a reload's fetches — flows at full speed. Raise it only
   * when the behavior under test genuinely spans several requests.
   */
  times?: number;
}

/**
 * A target-closed rejection during teardown is not a finding.
 *
 * If the browser closes while a request is still paused (a script that throws
 * before it releases), the pending `route.continue()` rejects. That is an
 * artifact of the shutdown, not a defect in the app — and surfacing it would
 * replace the script's real error with a confusing one.
 */
function isTargetClosed(err: unknown): boolean {
  return err instanceof Error && err.name === "TargetClosedError";
}

/** Wait for `ms`, or for `releaseSignal`, whichever comes first. */
async function holdFor(ms: number, releaseSignal: Promise<void>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, ms);
      }),
      releaseSignal,
    ]);
  } finally {
    // Leaving the timer armed would hold the event loop open past the stall.
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Register a route that holds the first `times` matching requests for `ms`.
 *
 * The handler stays registered for the life of the page — deliberately. Once
 * the stall budget is spent, matching requests are continued the moment they
 * arrive, so leaving it in place costs nothing and removes the only unsafe
 * teardown from the API.
 */
export async function stallRoute(
  target: Page | BrowserContext,
  pattern: string,
  opts: StallRouteOptions,
): Promise<StalledRoute> {
  const { ms, times = 1 } = opts;
  let count = 0;
  let released = false;
  let signalRelease!: () => void;
  const releaseSignal = new Promise<void>((resolve) => {
    signalRelease = resolve;
  });
  const inFlight = new Set<Promise<void>>();

  await target.route(pattern, async (route) => {
    count++;
    if (released || count > times) {
      await route.continue();
      return;
    }
    const held = (async () => {
      await holdFor(ms, releaseSignal);
      await route.continue();
    })();
    inFlight.add(held);
    try {
      await held;
    } catch (err) {
      if (!isTargetClosed(err)) throw err;
    } finally {
      inFlight.delete(held);
    }
  });

  return {
    get count() {
      return count;
    },
    async release() {
      released = true;
      signalRelease();
      await Promise.all([...inFlight]);
    },
  };
}
