/**
 * The bell's server-side filters, end to end on a deployed build:
 *
 *   1. the boot snapshot carries `notifications` at its default window — the
 *      newest 200 — and a fresh page whose live socket never connects still
 *      paints a settled bell (its unread badge), so the preload alone is enough;
 *   2. a type that appears ONLY outside the newest 200 still has a chip (the
 *      chips are the server's grouping of the whole collection), and picking it
 *      lists every one of its rows (a server-filtered window);
 *   3. scrolling the list to its end grows the window past 200;
 *   4. dismissing a row removes it live, and its chip's count follows.
 *
 * WRITES: dismisses every notification in this worktree first (the table is
 * excluded from fork, so these are this worktree's own), seeds 250, and a
 * `finally` dismisses all of them again.
 *
 * Usage:
 *   ./singularity run plugins/shell/plugins/notifications/e2e/bell-filter.ts [--headed]
 */

import {
  boot,
  pathUrl,
  report,
  snap,
  withBrowser,
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";
import type { Page } from "playwright";

const OUT = "/tmp/claude-501/bell-filter";
const r = report("Notifications · bell filters, grouping, boot preload");

const OLD_TYPE = "e2e-old";
const OLD_COUNT = 5;
const BULK_TYPE = "e2e-bulk";
const BULK_COUNT = 245;
const LIVE_TIMEOUT_MS = 10_000;

const bell = (page: Page) =>
  page.getByRole("button", { name: "Notifications", exact: true });
const rows = (page: Page) =>
  page.locator('[data-testid="notification-list"] li');
const chip = (page: Page, type: string) =>
  page.locator(`[data-testid="notification-chips"] [data-type="${type}"]`);

/** Poll a read to a deadline — pushes land asynchronously. */
async function settle<T>(
  page: Page,
  read: () => Promise<T>,
  done: (v: T) => boolean,
): Promise<T> {
  const deadline = Date.now() + LIVE_TIMEOUT_MS;
  let got = await read();
  while (!done(got) && Date.now() < deadline) {
    await page.waitForTimeout(250);
    got = await read();
  }
  return got;
}

await withBrowser(async (h) => {
  const { page, captured } = await h.session();

  const post = async (path: string, data?: unknown) => {
    const res = await page.request.post(pathUrl(path), { data: data ?? {} });
    if (!res.ok()) throw new Error(`POST ${path} — ${res.status()}`);
  };

  try {
    await post("/api/notifications/dismiss-all");
    // Oldest first, one at a time: `createdAt` is the server's now(), so the
    // old type ends up strictly outside the newest 200.
    const stamp = Date.now();
    for (let i = 0; i < OLD_COUNT; i++) {
      await post("/api/notifications", {
        id: `e2e-bell-old-${stamp}-${i}`,
        type: OLD_TYPE,
        title: `${OLD_TYPE} #${i}`,
        description: "seeded by bell-filter.ts",
        variant: "info",
      });
    }
    for (let i = 0; i < BULK_COUNT; i++) {
      await post("/api/notifications", {
        id: `e2e-bell-bulk-${stamp}-${i}`,
        type: BULK_TYPE,
        title: `${BULK_TYPE} #${i}`,
        description: "seeded by bell-filter.ts",
        // A few unread warnings/errors so the badge (a settled-only paint) shows.
        variant: i % 50 === 0 ? "error" : i % 10 === 0 ? "warning" : "info",
      });
    }
    r.note(
      `seeded ${OLD_COUNT} × ${OLD_TYPE} then ${BULK_COUNT} × ${BULK_TYPE}`,
    );

    // 1 — the boot snapshot holds the default window.
    const snapRes = await page.request.get(
      pathUrl("/api/resources/boot-snapshot"),
    );
    r.ok("boot snapshot answers", snapRes.ok(), `HTTP ${snapRes.status()}`);
    const snapshot = (await snapRes.json()) as {
      resources: Record<string, unknown>;
    };
    const booted = snapshot.resources["notifications"] as
      { type: string }[] | undefined;
    r.ok("boot snapshot includes `notifications`", Array.isArray(booted));
    r.eq("…at the default window's 200 rows", booted?.length, 200);
    r.ok(
      "…which holds none of the old type (it is outside the newest 200)",
      (booted ?? []).every((n) => n.type !== OLD_TYPE),
    );
    r.ok(
      "the :rows / :groups siblings are not preloaded",
      !("notifications:rows" in snapshot.resources) &&
        !("notifications:groups" in snapshot.resources),
    );

    // A page whose live socket never connects: only the preload can settle the bell.
    const offline = await h.session({ label: "no-ws", capture: false });
    await offline.page.routeWebSocket(/\/ws\//, () => {
      // Accept nothing and forward nothing: no sub-ack ever arrives.
    });
    await boot(offline.page, pathUrl("/"), { settleMs: 1500 });
    const badge = await bell(offline.page)
      .locator("xpath=..")
      .innerText()
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "TimeoutError") return "";
        throw err;
      });
    r.eq(
      "with no live socket the bell still paints settled (unread badge from the boot snapshot)",
      badge.trim(),
      "9+",
    );
    await snap(offline.page, OUT, "1-bell-no-ws");
    await offline.context.close();

    // 2 — the old type's chip, and its full list.
    await boot(page, pathUrl("/"), { settleMs: 1500 });
    await page.evaluate(() => {
      Object.assign(window, { __e2eBell: true });
    });
    await bell(page).click();
    await page
      .locator('[data-testid="notification-chips"] button')
      .first()
      .waitFor({ timeout: LIVE_TIMEOUT_MS });
    r.eq("the All window lists the newest 200", await rows(page).count(), 200);
    r.ok("the old type has a chip", (await chip(page, OLD_TYPE).count()) === 1);
    r.eq(
      "…showing its whole-collection count",
      (await chip(page, OLD_TYPE).innerText()).replace(/\s+/g, ""),
      `E2e-old${OLD_COUNT}`,
    );
    await chip(page, OLD_TYPE).click();
    const oldCount = await settle(
      page,
      () => rows(page).count(),
      (n) => n === OLD_COUNT,
    );
    r.eq("picking it lists every one of its rows", oldCount, OLD_COUNT);
    await snap(page, OUT, "2-old-type-chip");

    // 4 — dismiss one: it leaves the list and the chip count follows.
    await rows(page).first().getByRole("button", { name: "Dismiss" }).click();
    r.eq(
      "a dismissed row leaves the filtered list live",
      await settle(
        page,
        () => rows(page).count(),
        (n) => n === OLD_COUNT - 1,
      ),
      OLD_COUNT - 1,
    );
    r.ok(
      "…and the chip's count drops",
      (
        await settle(
          page,
          () => chip(page, OLD_TYPE).innerText(),
          (t) => t.includes(String(OLD_COUNT - 1)),
        )
      ).includes(String(OLD_COUNT - 1)),
    );

    // 3 — the bulk type's window grows past 200 on scroll.
    await chip(page, BULK_TYPE).click();
    r.eq(
      "the bulk filter opens at its default 200",
      await settle(
        page,
        () => rows(page).count(),
        (n) => n === 200,
      ),
      200,
    );
    const scrollToEnd = () =>
      page.locator('[data-testid="notification-list"]').evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
    await scrollToEnd();
    const grown = await settle(
      page,
      async () => {
        await scrollToEnd();
        return rows(page).count();
      },
      (n) => n === BULK_COUNT,
    );
    r.eq(
      "scrolling to the end grows the window to every row",
      grown,
      BULK_COUNT,
    );
    await snap(page, OUT, "3-grown");

    r.ok(
      "nothing reloaded the page",
      await page.evaluate(() => Reflect.get(window, "__e2eBell") === true),
    );
  } finally {
    const res = await page.request.post(
      pathUrl("/api/notifications/dismiss-all"),
      { data: {} },
    );
    r.ok(
      "cleanup dismissed every notification",
      res.ok(),
      `HTTP ${res.status()}`,
    );
  }

  r.ok(
    "no uncaught page errors",
    captured.pageErrors.length === 0,
    captured.pageErrors.join(" | "),
  );
});

await r.finish();
