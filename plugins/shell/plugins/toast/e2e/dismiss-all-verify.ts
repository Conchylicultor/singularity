// Verifies the toast stack's "Dismiss all" affordance end-to-end: seeds a
// pile-up of real toasts, asserts the button appears (and only once the stack
// is plural), asserts it never overlaps the front toast, and asserts one click
// clears the whole stack.
//
// The toasts are real ones: the script POSTs notifications through the app's own
// `POST /api/notifications` endpoint from the page context, and the bell plugin
// turns each arrival into a toast. Nothing is stubbed. Each seeded notification
// is dismissed by id at the end, so the run leaves the worktree as it found it.
//
// Usage:
//   bun plugins/shell/plugins/toast/e2e/dismiss-all-verify.ts [--headed] [--base http://<worktree>.localhost:9000]

import {
  boot,
  pathUrl,
  report,
  snap,
  withBrowser,
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";

const OUT = "/tmp/toast-dismiss-all";
const SEEDED = 3;

const r = report("toast — dismiss all");

await withBrowser(async (h) => {
  const { page, captured } = await h.session();
  await boot(page, pathUrl("/agents"), { marker: "[data-app-tab]" });

  // Sonner keeps an exiting toast in the DOM for its 400ms animation, so an
  // element count that includes `data-removed` ones reads high — high enough to
  // wait for a stack that sonner itself no longer considers plural.
  const LIVE = '[data-sonner-toast]:not([data-removed="true"])';
  const toasts = page.locator(LIVE);
  const dismissAll = page.getByRole("button", { name: /Dismiss all/ });
  const seededIds: string[] = [];

  // Best effort: start from an empty stack. A live worktree files notifications
  // of its own (monitor reports, build completions) and each one toasts on
  // arrival, so a quiet screen is a preference here, not a preconditionthe
  // assertions below are written to hold either way. Waiting them out rather
  // than bulk-dismissing is deliberate: `dismiss-all` empties the notification
  // list, which surfaces older stored rows the bell then toasts as fresh
  // arrivals — the cure would be worse than the disease.
  await emptyStack(15_000);

  // A single toast is already one click away from gone, so the affordance stays
  // out of the way until a *stack* forms. Asserted as the invariant it really is
  // — visible ⟺ plural — which holds whatever ambient traffic is on screen.
  await seed(1);
  await toasts.first().waitFor({ state: "visible", timeout: 10_000 });
  await assertVisibleIffPlural("with one seeded toast");

  await seed(SEEDED);
  await page.waitForFunction(
    ({ sel, n }) => document.querySelectorAll(sel).length >= n,
    { sel: LIVE, n: SEEDED },
    { timeout: 10_000 },
  );
  await dismissAll.waitFor({ state: "visible", timeout: 10_000 });
  await assertVisibleIffPlural("with a seeded stack");
  r.note(`label: ${await dismissAll.innerText()}`);
  await snap(page, OUT, "before");

  // The strip is a reserved band, not an overlay: the toast stack's own bottom
  // offset grows by the strip's height, so the button can never paint over the
  // front toast. Assert the geometry rather than trusting the CSS.
  const buttonTop = (await dismissAll.boundingBox())?.y ?? -1;
  const lowestToastBottom = Math.max(
    ...(await toasts.evaluateAll((els) =>
      els.map((e) => e.getBoundingClientRect().bottom),
    )),
  );
  r.ok(
    "button clears the front toast",
    buttonTop >= lowestToastBottom,
    `button top ${buttonTop} < lowest toast bottom ${lowestToastBottom}`,
  );

  await dismissAll.click();
  await page.waitForFunction(
    (sel) => document.querySelectorAll(sel).length === 0,
    LIVE,
    { timeout: 5_000 },
  );
  r.eq("one click clears the whole stack", await toasts.count(), 0);
  await dismissAll.waitFor({ state: "hidden", timeout: 5_000 });
  r.ok("button retires with the stack", true);
  await snap(page, OUT, "after");

  // Clean up exactly what we created — by id, never the bulk endpoint.
  await page.evaluate(async (ids) => {
    for (const id of ids) {
      const res = await fetch(`/api/notifications/${id}/dismiss`, { method: "POST" });
      if (!res.ok) throw new Error(`dismiss ${id} failed: ${res.status}`);
    }
  }, seededIds);

  r.ok("no page errors", captured.pageErrors.length === 0, captured.pageErrors.join("; "));

  /**
   * The contract, as one instantaneous check: the affordance is on screen
   * exactly when the live stack is plural. Reading the count and the visibility
   * together makes it immune to whatever the worktree toasts on its own.
   */
  async function assertVisibleIffPlural(when: string): Promise<void> {
    const live = await toasts.count();
    const visible = await dismissAll.isVisible();
    r.eq(`${when}: visible ⟺ plural (${live} up)`, visible, live >= 2);
  }

  /** Wait until nothing is on screen — in-flight toasts expire on their own. */
  async function emptyStack(timeout: number): Promise<void> {
    await page
      .waitForFunction(
        (sel) => document.querySelectorAll(sel).length === 0,
        LIVE,
        { timeout },
      )
      .catch((err: unknown) => {
        // A worktree that keeps filing notifications may never go quiet. That
        // is not a failure here — every assertion below reads the live count.
        if (!(err instanceof Error) || err.name !== "TimeoutError") throw err;
        r.note("stack never went quiet — proceeding against ambient toasts");
      });
  }

  /**
   * Fire `n` notifications; the bell plugin toasts one per arrival. Ids AND
   * titles carry a run-wide index — a repeated title across batches is exactly
   * what the notification store would fold into one row.
   */
  async function seed(n: number): Promise<void> {
    const ids = Array.from(
      { length: n },
      (_, i) => `e2e-toast-${Date.now()}-${seededIds.length + i}`,
    );
    const offset = seededIds.length;
    seededIds.push(...ids);
    await page.evaluate(
      async ({ batch, offset: from }) => {
        for (const [i, id] of batch.entries()) {
          const res = await fetch("/api/notifications", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              id,
              type: "e2e",
              title: `Seeded toast ${from + i + 1}`,
              description: "Fired by the dismiss-all e2e script.",
              variant: "info",
            }),
          });
          if (!res.ok) throw new Error(`seed failed: ${res.status}`);
        }
      },
      { batch: ids, offset },
    );
  }
});

r.finish();
