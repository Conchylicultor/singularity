// End-to-end regression test for SharedWebSocket.
//
// Exercises the multi-tab live-update behavior that `NotificationsClient`
// relies on. The bug this test guards against: followers failing to subscribe
// on the leader's socket, so tabs on pages whose resources the leader isn't
// already observing stop receiving live updates and only catch up on reload.
//
// Usage:
//   1. `./singularity build` (to deploy the current worktree)
//   2. `bun plugins/primitives/plugins/networking/e2e/shared-websocket.ts [--base <url>]`
//
// Exits non-zero on any failure.
import {
  baseUrl,
  capture,
  report,
  withBrowser,
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";
import type { Page } from "playwright";

const base = baseUrl();

const post = async (page: Page): Promise<unknown> =>
  page.evaluate(() =>
    fetch("/api/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ folderId: null }),
    }),
  );

const r = report();

await withBrowser(async (h) => {
  // ── scenario 1: single tab, live updates from a cross-tab POST ─────────────
  {
    const { context: ctx, page } = await h.session({ label: "s1" });
    await page.goto(`${base}/tasks`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    const before = await page.locator("input").count();
    await post(page);
    await page.waitForTimeout(1500);
    const after = await page.locator("input").count();
    r.ok(
      "single tab — POST delivers a live update",
      after === before + 1,
      `${before} -> ${after}`,
    );
    await ctx.close();
  }

  // ── scenario 2: leader on a page that doesn't sub `tasks`, follower on /tasks.
  //    The original bug reproduces here: follower never subscribes through the
  //    leader, so its list doesn't update until reload.
  {
    // Both tabs must share ONE BrowserContext — leader election runs over
    // BroadcastChannel + navigator.locks, which are per-origin-per-context. A
    // second `h.session()` would be a separate context and elect its own leader.
    const { context: ctx, page: leader } = await h.session({ label: "leader" });
    await leader.goto(`${base}/`, { waitUntil: "domcontentloaded" });
    await leader.waitForTimeout(1500);
    const follower = await ctx.newPage();
    capture(follower, "follower");
    await follower.goto(`${base}/tasks`, { waitUntil: "domcontentloaded" });
    await follower.waitForTimeout(2000);
    const before = await follower.locator("input").count();
    await post(follower);
    await follower.waitForTimeout(2500);
    const after = await follower.locator("input").count();
    r.ok(
      "follower tab receives live update when leader isn't subscribed",
      after === before + 1,
      `${before} -> ${after}`,
    );
    await ctx.close();
  }

  // ── scenario 3: leader handoff — close the leader, surviving tab takes over
  //    and replays its subs on `onopen` of the new socket.
  {
    const { context: ctx, page: a } = await h.session({ label: "a" });
    await a.goto(`${base}/tasks`, { waitUntil: "domcontentloaded" });
    await a.waitForTimeout(1500);
    const b = await ctx.newPage();
    capture(b, "b");
    await b.goto(`${base}/tasks`, { waitUntil: "domcontentloaded" });
    await b.waitForTimeout(1500);
    await a.close();
    await b.waitForTimeout(1500);
    const before = await b.locator("input").count();
    await post(b);
    await b.waitForTimeout(2500);
    const after = await b.locator("input").count();
    r.ok(
      "leader handoff — new leader replays subs and stays live",
      after === before + 1,
      `${before} -> ${after}`,
    );
    await ctx.close();
  }

  r.finish();
});
