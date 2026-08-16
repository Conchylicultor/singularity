/**
 * Verifies the page-detail "Open in Pages" expand action end to end:
 *
 *   1. it is ABSENT inside the Pages app (expanding to where you already are is
 *      a no-op, and a dead button is worse than none);
 *   2. it is PRESENT when the same pane is opened from another app;
 *   3. a plain click takes THIS tab to Pages, on the same page;
 *   4. a middle click opens a SECOND tab on the page and leaves the first alone.
 *
 * Run: bun plugins/apps/plugins/pages/plugins/open-in-app/e2e/open-in-app-verify.ts
 */
import {
  withBrowser,
  pathUrl,
  report,
  snap,
  arg,
  type Harness,
  type Session,
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";

// Located by ROLE, never by a CSS attribute selector. Every one of these lives
// in an overflow row, which renders a second, `aria-hidden` copy of each child
// off-screen to measure it — so a plain `button[aria-label=…]` matches twice.
// The accessibility tree skips aria-hidden subtrees, so a role query sees only
// the real control.
const expand = (p: Session["page"]) =>
  p.getByRole("button", { name: "Open in Pages", exact: true });
// A header action every page has, in both apps: the signal that the page-detail
// header has finished rendering. Without it, "no expand button" is ambiguous
// between "correctly hidden" and "the pane hasn't painted yet". Deliberately
// NOT the star — that label is also on every sidebar tree row, so it is already
// satisfied on the landing surface before any page is even open.
const headerReady = (p: Session["page"]) =>
  p.getByRole("button", { name: "Version history", exact: true });
// Each open tab carries exactly one close button, labelled with its own title —
// the only stable per-tab handle the tab strip exposes.
const tabCloses = (p: Session["page"]) =>
  p.getByRole("button", { name: /^Close / });

const out = arg("out") ?? "/tmp/open-in-app";
const r = report("pages/open-in-app");

/**
 * Open `path` in a BRAND-NEW browser context and wait for the page-detail
 * header to paint.
 *
 * Fresh per phase, deliberately: a cross-document load in a context that
 * already holds a tab set *adopts* it, so the same URL can boot with one tab or
 * two depending on what the previous phase left behind. An empty context boots
 * exactly one tab seeded from the URL, every time.
 */
async function openPage(h: Harness, path: string): Promise<Session> {
  const s = await h.session();
  await s.page.goto(pathUrl(path));
  await headerReady(s.page)
    .first()
    .waitFor({ state: "visible", timeout: 60_000 });
  return s;
}

/**
 * The page to drive the checks against, made by the Pages landing surface's own
 * "Blank page" tile. Minting one beats picking an existing row: no hardcoded
 * block id to rot when this worktree's DB is re-forked, and no dependence on
 * the tree holding any particular page. The harness stamps every request as
 * agent-origin, so the page lands in the segregated `[Agent]` section and its
 * 24h sweep reclaims it.
 */
async function mintPage(h: Harness): Promise<string | undefined> {
  const s = await h.session();
  await s.page.goto(pathUrl("/pages"));
  await s.page
    .getByText("Blank page", { exact: true })
    .first()
    .click({ timeout: 60_000 });
  await s.page.waitForURL(/\/page\/[^/]+$/, { timeout: 60_000 });
  await headerReady(s.page)
    .first()
    .waitFor({ state: "visible", timeout: 60_000 });
  const id = new URL(s.page.url()).pathname.match(/\/page\/([^/]+)/)?.[1];
  await s.context.close();
  return id;
}

/**
 * Wait for the address bar to reach `path`, reporting a timeout as `false`
 * rather than throwing. The caller asserts on the result, so "the click did not
 * navigate" fails ONE check with the URL it was actually left on, instead of
 * aborting the run and skipping every check after it.
 */
async function reachedPath(s: Session, path: string): Promise<boolean> {
  try {
    await s.page.waitForURL(`**${path}`, { timeout: 30_000 });
    return true;
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") return false;
    throw err;
  }
}

await withBrowser(async (h) => {
  const pageId = await mintPage(h);
  if (!pageId) {
    r.fail("mint a page", "the Blank page tile did not land on /page/<id>");
    r.finish();
  }
  r.note(`page ${pageId}`);
  const outside = `/agents/page/${pageId}`;
  const inside = `/pages/page/${pageId}`;

  // 1. Inside Pages — the header painted, and the button is not in it.
  {
    const s = await openPage(h, inside);
    r.eq("absent inside Pages", await expand(s.page).count(), 0);
    await s.context.close();
  }

  // 2 + 3. The same pane hosted by the agent manager; a plain click takes this
  // very tab to Pages, without spawning another.
  {
    const s = await openPage(h, outside);
    r.eq("present outside Pages", await expand(s.page).count(), 1);
    await snap(s.page, out, "outside");
    const tabsBefore = await tabCloses(s.page).count();

    await expand(s.page).click();
    r.ok(
      "click lands on the page in Pages",
      await reachedPath(s, inside),
      `left on ${s.page.url()}`,
    );
    r.eq("click adds no tab", await tabCloses(s.page).count(), tabsBefore);
    r.eq("button gone once inside Pages", await expand(s.page).count(), 0);
    await s.context.close();
  }

  // 4. Middle click — a NEW tab on the page, the original left untouched.
  {
    const s = await openPage(h, outside);
    const tabsBefore = await tabCloses(s.page).count();

    await expand(s.page).click({ button: "middle" });
    r.ok(
      "the new tab shows the page in Pages",
      await reachedPath(s, inside),
      `left on ${s.page.url()}`,
    );
    r.eq(
      "middle click adds a tab",
      await tabCloses(s.page).count(),
      tabsBefore + 1,
    );
    await snap(s.page, out, "new-tab");

    r.ok(
      "no page errors",
      s.captured.pageErrors.length === 0,
      s.captured.pageErrors.join("; "),
    );
    await s.context.close();
  }
});

r.finish();
