/**
 * Verifies the pane Expand (promote) button's cross-app behavior, using the
 * page-detail pane — which declares Pages as its home app — hosted by the agent
 * manager:
 *
 *   1. inside its OWN app at the route root, Expand is absent (nothing to
 *      expand to);
 *   2. hosted by another app it is present even at the route root, because
 *      "stranded in the wrong app" is the case worth fixing;
 *   3. a plain click takes THIS tab to the home app;
 *   4. a middle click and a ⌘-click each open a NEW tab there instead.
 *
 * Run: bun plugins/primitives/plugins/pane/e2e/expand-verify.ts
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

// "Expand pane", not "Expand": bare "Expand" is already the accessible name of
// every tree-row chevron, collapsible header and span lane, so a pane action
// sharing it would be ambiguous to a screen reader (and would collide with the
// page-tree's own e2e, which matches chevrons by that exact name).
//
// Located by ROLE, never by a CSS attribute selector: these all sit in an
// overflow row, which renders a second, `aria-hidden` copy of each child
// off-screen to measure it — so `button[aria-label=…]` matches twice. The
// accessibility tree skips aria-hidden subtrees.
const expand = (p: Session["page"]) =>
  p.getByRole("button", { name: "Expand pane", exact: true });
// A page-detail header action that exists in both apps: the signal the pane has
// painted, so "no Expand button" cannot be confused with "not rendered yet".
// Deliberately not the star — that label is on every sidebar tree row too, so
// it is already satisfied on the landing surface before any page is open.
const headerReady = (p: Session["page"]) =>
  p.getByRole("button", { name: "Version history", exact: true });
// Each open tab carries exactly one close button, labelled with its own title.
const tabCloses = (p: Session["page"]) =>
  p.getByRole("button", { name: /^Close / });

const out = arg("out") ?? "/tmp/pane-expand";
const r = report("pane/expand");

/**
 * Open `path` in a BRAND-NEW browser context and wait for the pane to paint.
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
 * Wait for the address bar to reach `path`, reporting a timeout as `false`
 * rather than throwing, so a click that fails to navigate fails ONE check with
 * the URL it was left on instead of aborting the run.
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

/**
 * A page to drive the checks against, made by the Pages landing surface's own
 * "Blank page" tile — no hardcoded block id to rot when this worktree's DB is
 * re-forked. The harness stamps every request agent-origin, so the page lands
 * in the segregated `[Agent]` section and its 24h sweep reclaims it.
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
 * The conversation pane declares the agent manager as its home, so hosting it
 * anywhere else must offer the way back.
 *
 * This is a REGRESSION GUARD with a specific history: the navigator sink was
 * once read imperatively inside a memo, so a pane that mounted in the same
 * commit as the tab provider cached "nowhere to go" for its whole life. The
 * page-detail pane loads in the deferred tier and happened to mount after, so
 * it passed while this pane was silently broken in every foreign app. Two apps
 * are checked because the bug was in the PANE, not in any one host.
 */
async function checkConversationLeavesForeignApps(h: Harness): Promise<void> {
  const convId = arg("conv");
  if (!convId) {
    r.note(
      "skipped the conversation direction — pass --conv <id> to include it",
    );
    return;
  }
  for (const host of ["/pages", "/debug"]) {
    const s = await h.session();
    await s.page.goto(pathUrl(`${host}/c/${convId}`));
    await s.page
      .getByRole("button", { name: "Expand pane", exact: true })
      .first()
      .waitFor({ state: "visible", timeout: 60_000 })
      .then(
        () => r.ok(`conversation offers Expand while ${host} hosts it`, true),
        () =>
          r.fail(
            `conversation offers Expand while ${host} hosts it`,
            s.page.url(),
          ),
      );
    await s.context.close();
  }
}

await withBrowser(async (h) => {
  const pageId = await mintPage(h);
  if (!pageId) {
    r.fail("mint a page", "the Blank page tile did not land on /page/<id>");
    r.finish();
  }
  const outside = `/agents/page/${pageId}`;
  const home = `/pages/page/${pageId}`;
  r.note(`page ${pageId}`);

  // 1. At the root of its OWN app there is nothing to expand to.
  {
    const s = await openPage(h, home);
    r.eq("absent at the root of its own app", await expand(s.page).count(), 0);
    await s.context.close();
  }

  // 2 + 3. Hosted by the agent manager: present even at the route root, and a
  // plain click takes this very tab home without spawning another.
  {
    const s = await openPage(h, outside);
    r.eq("present when another app hosts it", await expand(s.page).count(), 1);
    await snap(s.page, out, "hosted-elsewhere");
    const tabsBefore = await tabCloses(s.page).count();

    await expand(s.page).click();
    r.ok(
      "click lands on the pane in its home app",
      await reachedPath(s, home),
      `left on ${s.page.url()}`,
    );
    r.eq("click adds no tab", await tabCloses(s.page).count(), tabsBefore);
    r.eq("gone once home", await expand(s.page).count(), 0);
    await s.context.close();
  }

  // 4. Middle click and ⌘-click each open a new tab instead.
  const newTabGestures: Array<
    [string, Parameters<ReturnType<typeof expand>["click"]>[0]]
  > = [
    ["middle click", { button: "middle" }],
    ["⌘-click", { modifiers: ["Meta"] }],
  ];
  for (const [name, click] of newTabGestures) {
    const s = await openPage(h, outside);
    const tabsBefore = await tabCloses(s.page).count();

    await expand(s.page).click(click);
    r.ok(
      `${name} shows the pane in its home app`,
      await reachedPath(s, home),
      `left on ${s.page.url()}`,
    );
    r.eq(`${name} adds a tab`, await tabCloses(s.page).count(), tabsBefore + 1);
    r.ok(
      `${name}: no page errors`,
      s.captured.pageErrors.length === 0,
      s.captured.pageErrors.join("; "),
    );
    await s.context.close();
  }

  await checkConversationLeavesForeignApps(h);
});

r.finish();
