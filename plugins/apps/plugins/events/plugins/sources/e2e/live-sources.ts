/**
 * The `events.sources` live collection, end to end on a deployed build:
 *
 *   1. the source detail pane resolves a real source by id through the `:rows`
 *      point read — found, its name on screen;
 *   2. an unknown id lands on the explicit "no longer exists" state, never an
 *      endless spinner;
 *   3. the Source filter's options are every source sorted by name — read from
 *      the exact window tuple `source-field` subscribes to
 *      (`{ limit: 500, order: [["name","asc"]] }`) and, in the UI, from the
 *      events list's Source filter value picker.
 *
 * Read-only: nothing is written.
 *
 * Usage:
 *   ./singularity run plugins/apps/plugins/events/plugins/sources/e2e/live-sources.ts [--headed]
 */

import {
  boot,
  pathUrl,
  report,
  snap,
  withBrowser,
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";

const OUT = "/tmp/claude-501/live-sources";
const r = report("Events · live sources collection");

interface SourceRow {
  id: string;
  name: string;
}

/** Code-point order — the cluster collates `C`, so this is what SQL returns. */
const byCodePoint = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0;

await withBrowser(async (h) => {
  const { page, captured } = await h.session();

  const getJson = async <T>(path: string): Promise<T> => {
    const res = await page.request.get(pathUrl(path));
    if (!res.ok()) throw new Error(`GET ${path} — ${res.status()}`);
    return (await res.json()) as T;
  };
  /** A live resource's value over its HTTP read (`{ value, version }`). */
  const resource = async <T>(
    key: string,
    params: Record<string, string>,
  ): Promise<T> => {
    const qs = new URLSearchParams(params).toString();
    const body = await getJson<{ value: T }>(
      `/api/resources/${encodeURIComponent(key)}?${qs}`,
    );
    return body.value;
  };

  const sources = await getJson<SourceRow[]>("/api/events/sources");
  r.note(`${sources.length} source(s) in this worktree`);
  r.ok("the worktree has sources to look at", sources.length > 0);
  const target = sources[sources.length - 1]!;
  r.note(`target "${target.name}" (${target.id})`);

  // 1 — found, by id.
  const point = await resource<SourceRow[]>("events.sources:rows", {
    ids: target.id,
  });
  r.eq(
    "the :rows point read returns the target",
    point.map((s) => s.id),
    [target.id],
  );
  await boot(page, pathUrl(`/events/sources/source/${target.id}`), {
    marker: `[data-pane-id="event-source-detail"]`,
    settleMs: 1500,
  });
  await snap(page, OUT, "1-found");
  const detail = page.locator('[data-pane-id="event-source-detail"]');
  r.ok(
    "the detail pane shows the source's name",
    (await detail.getByText(target.name, { exact: true }).count()) > 0,
  );
  r.ok(
    "the detail pane is not the missing state",
    (await detail.getByText("This source no longer exists.").count()) === 0,
  );

  // 2 — an unknown id: determinately missing.
  const unknown = "evs-does-not-exist-e2e";
  const none = await resource<SourceRow[]>("events.sources:rows", {
    ids: unknown,
  });
  r.eq("the :rows point read returns nothing for an unknown id", none, []);
  await page.goto(pathUrl(`/events/sources/source/${unknown}`));
  // Either missing surface is the explicit dead end: the pane's own resolver
  // (`useResolveSource` → found: false) renders the router's not-found, and the
  // body renders its placeholder if it is ever reached with a missing id.
  const missing = page.getByText(
    /This source no longer exists\.|This resource couldn't be found\./,
  );
  await missing
    .first()
    .waitFor({ timeout: 10_000 })
    .catch((err: unknown) => {
      if (err instanceof Error && err.name === "TimeoutError") return;
      throw err;
    });
  await snap(page, OUT, "2-missing");
  r.ok(
    "an unknown id shows the explicit missing state",
    (await missing.count()) > 0,
  );

  // 3 — the Source filter's options: every source, sorted by name.
  const expected = sources.map((s) => s.name).sort(byCodePoint);
  const byName = await resource<SourceRow[]>("events.sources", {
    limit: "500",
    order: '[["name","asc"]]',
  });
  r.eq(
    "the name-sorted window holds every source in name order",
    byName.map((s) => s.name),
    expected,
  );

  await boot(page, pathUrl("/events/list"), { settleMs: 2000 });
  const filterTrigger = page.getByRole("button", { name: /^Filter/ });
  if ((await filterTrigger.count()) > 0) {
    await filterTrigger.first().click();
    await page.waitForTimeout(700);
  }
  const addFilter = page.getByRole("button", {
    name: "Add filter",
    exact: true,
  });
  if ((await addFilter.count()) > 0) {
    await addFilter.first().click();
    await page.waitForTimeout(600);
  }
  const fieldSearch = page.getByPlaceholder("Filter by…");
  if ((await fieldSearch.count()) > 0) await fieldSearch.first().fill("Source");
  await page.waitForTimeout(400);
  await page.getByText("Source", { exact: true }).last().click();
  await page.waitForTimeout(700);
  // The new Source rule's value picker.
  await page
    .getByRole("button", { name: /^Select/ })
    .last()
    .click();
  await page.waitForTimeout(900);
  await snap(page, OUT, "3-source-filter");
  // The value picker lists the options in field order. From its last-rendered
  // option (the picker is the newest popover), climb to the smallest ancestor holding every source name, then read its
  // leaf texts in DOM order (deduped: a chip and its label can both carry one).
  const names = new Set(expected);
  const leafTexts: string[] = await page
    .getByText(expected[expected.length - 1]!, { exact: true })
    .last()
    .evaluate((input, want: string[]) => {
      let box: Element | null = input;
      while (box && !want.every((n) => (box!.textContent ?? "").includes(n))) {
        box = box.parentElement;
      }
      if (!box) return [];
      return [...box.querySelectorAll("*")]
        .filter((e) => e.children.length === 0)
        .map((e) => (e.textContent ?? "").trim());
    }, expected);
  const shown = [...new Set(leafTexts.filter((t) => names.has(t)))];
  r.note(`picker shows ${shown.length} source option(s)`);
  r.eq("the Source filter's options are sorted by name", shown, expected);

  r.ok(
    "no uncaught page errors",
    captured.pageErrors.length === 0,
    captured.pageErrors.join(" | "),
  );
});

await r.finish();
