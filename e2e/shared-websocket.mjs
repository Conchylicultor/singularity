// End-to-end regression test for SharedWebSocket.
//
// Exercises the multi-tab live-update behavior that `NotificationsClient`
// relies on. The bug this test guards against: followers failing to subscribe
// on the leader's socket, so tabs on pages whose resources the leader isn't
// already observing stop receiving live updates and only catch up on reload.
//
// Usage:
//   1. `./singularity build` (to deploy the current worktree)
//   2. `bun e2e/shared-websocket.mjs <worktree-host>`
//      e.g. `bun e2e/shared-websocket.mjs claude-1776294129.localhost:9000`
//
// Exits non-zero on any failure.

import { chromium } from "playwright";

const host = process.argv[2];
if (!host) {
  console.error("Usage: bun e2e/shared-websocket.mjs <host:port>");
  process.exit(2);
}
const base = `http://${host}`;

const post = async (page) =>
  page.evaluate(() =>
    fetch("/api/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ parentId: null }),
    }),
  );

const failures = [];
const check = (name, ok, detail = "") => {
  if (ok) {
    console.log(`  PASS  ${name}`);
  } else {
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ""}`);
    failures.push(name);
  }
};

const browser = await chromium.launch();

// ── scenario 1: single tab, live updates from a cross-tab POST ─────────────
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${base}/tasks`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  const before = await page.locator("input").count();
  await post(page);
  await page.waitForTimeout(1500);
  const after = await page.locator("input").count();
  check("single tab — POST delivers a live update", after === before + 1, `${before} -> ${after}`);
  await ctx.close();
}

// ── scenario 2: leader on a page that doesn't sub `tasks`, follower on /tasks.
//    The original bug reproduces here: follower never subscribes through the
//    leader, so its list doesn't update until reload.
{
  const ctx = await browser.newContext();
  const leader = await ctx.newPage();
  await leader.goto(`${base}/`, { waitUntil: "domcontentloaded" });
  await leader.waitForTimeout(1500);
  const follower = await ctx.newPage();
  await follower.goto(`${base}/tasks`, { waitUntil: "domcontentloaded" });
  await follower.waitForTimeout(2000);
  const before = await follower.locator("input").count();
  await post(follower);
  await follower.waitForTimeout(2500);
  const after = await follower.locator("input").count();
  check(
    "follower tab receives live update when leader isn't subscribed",
    after === before + 1,
    `${before} -> ${after}`,
  );
  await ctx.close();
}

// ── scenario 3: leader handoff — close the leader, surviving tab takes over
//    and replays its subs on `onopen` of the new socket.
{
  const ctx = await browser.newContext();
  const a = await ctx.newPage();
  await a.goto(`${base}/tasks`, { waitUntil: "domcontentloaded" });
  await a.waitForTimeout(1500);
  const b = await ctx.newPage();
  await b.goto(`${base}/tasks`, { waitUntil: "domcontentloaded" });
  await b.waitForTimeout(1500);
  await a.close();
  await b.waitForTimeout(1500);
  const before = await b.locator("input").count();
  await post(b);
  await b.waitForTimeout(2500);
  const after = await b.locator("input").count();
  check(
    "leader handoff — new leader replays subs and stays live",
    after === before + 1,
    `${before} -> ${after}`,
  );
  await ctx.close();
}

await browser.close();

if (failures.length > 0) {
  console.error(`\n${failures.length} failure(s)`);
  process.exit(1);
}
console.log("\nall passed");
