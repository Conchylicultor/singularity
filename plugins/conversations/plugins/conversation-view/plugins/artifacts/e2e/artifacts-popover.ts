/**
 * Drives the conversation toolbar's **Artifacts** button against the deployed
 * app — the "Verification" step of
 * `research/2026-09-19-conversations-artifacts-popover.md`.
 *
 * Four claims, none of which a unit test over the extractors can make, because
 * each one is about the HOST rather than about any one kind:
 *
 *   1. the closed button carries a count, and that count is the number of
 *      artifacts the popover then actually lists — a host that counted from the
 *      merged hits but dropped a kind while rendering would still show "12";
 *   2. every heading in the panel is a registered kind, and they appear in
 *      registry order — the popover names no kind, so a heading it invented, or
 *      an order of its own, is a bug in the host;
 *   3. the prototype and research sections are among them, which is what makes
 *      this conversation a meaningful subject at all;
 *   4. clicking a research row opens the doc in a file pane BESIDE the
 *      conversation (`mode: "push"`), and the transcript is still on screen.
 *
 * Manual only — nothing runs this. After `./singularity build`:
 *
 *   ./singularity run \
 *     plugins/conversations/plugins/conversation-view/plugins/artifacts/e2e/artifacts-popover.ts \
 *     [--conv <conversationId>] [--out <prefix>] [--headed]
 */
import { errors, type Locator, type Page } from "playwright";
import {
  arg,
  boot,
  pathUrl,
  report,
  snap,
  waitFor,
  withBrowser,
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";

/**
 * A conversation with a rich artifact set — three prototypes, a research doc,
 * five screenshots and two skills. Overridable because the default is a
 * transcript on THIS machine: another checkout drives a conversation of its own.
 */
const CONV = arg("conv", "conv-1789731158-lxie");
const out = arg("out", "/tmp/artifacts-popover");

/** The toolbar button, by the aria-label its three states all share. */
const BUTTON = "Artifacts";

/**
 * Every registered kind's heading, in the order the registry hands them to the
 * popover — the reorder config `config/conversations/conversation-view/
 * artifacts/kind.jsonc`, which is what decides slot order once a slot has one.
 *
 * The script asserts the panel's headings are a SUBSET of this list in this
 * relative order, not that all five are present: a conversation that touched no
 * page has no Pages section, and that is correct. A new kind is one line here,
 * and a kind the popover shows that is NOT here fails the run — which is the
 * point, since the host is supposed to name no kind of its own.
 */
const KIND_LABELS = [
  "Prototypes",
  "Pages",
  "Research",
  "Screenshots",
  "Skills",
] as const;

/** Sections this conversation must have, or it is the wrong subject. */
const REQUIRED = ["Prototypes", "Research"];

/** The open popover panel. */
function panelOf(page: Page): Locator {
  return page.locator('[data-slot="popover-content"]');
}

/**
 * The section headings the panel is showing, top to bottom.
 *
 * `SectionLabel` is the only uppercase text in the panel — rows, chips and the
 * panel's own "Artifacts" title are all sentence case — so this reads the
 * headings without the host having to label itself for the test. It is read as
 * TEXT CONTENT, not as rendered text: the heading is small-caps by stylesheet,
 * so `innerText` hands back "RESEARCH" and every comparison with the kind's
 * real label fails.
 */
async function headings(page: Page): Promise<string[]> {
  const labels = await panelOf(page).locator(".uppercase").allTextContents();
  return labels.map((t) => t.trim()).filter((t) => t.length > 0);
}

/**
 * One kind's block, by its position among the headings: the heading's parent,
 * which `ArtifactSection` renders as a stack of exactly two children — the
 * heading, then whatever the kind drew.
 *
 * Addressed by index rather than by label so nothing here depends on how the
 * heading's letters are cased on screen.
 */
function sectionAt(page: Page, index: number): Locator {
  return panelOf(page).locator(".uppercase").nth(index).locator("xpath=..");
}

/**
 * The entries one section is showing.
 *
 * The rule is structural, and it is the one thing every kind's layout has in
 * common: a section's body is a container whose CHILDREN are its entries — a
 * stack of rows, a grid of thumbnails, a cluster of chips. Counting them is
 * what turns the button's number into a claim about what the reader can see.
 */
function entriesAt(page: Page, index: number): Locator {
  return sectionAt(page, index).locator("xpath=./*[2]/*");
}

/** Everything the panel is listing right now, across every section. */
async function listedCount(page: Page): Promise<number> {
  const sections = await panelOf(page).locator(".uppercase").count();
  let listed = 0;
  for (let i = 0; i < sections; i += 1) {
    listed += await entriesAt(page, i).count();
  }
  return listed;
}

/** Whether `locator` reaches `state` in time — a miss is a FAIL, not a throw. */
async function reaches(
  locator: Locator,
  state: "visible" | "hidden" | "detached",
  timeoutMs = 15_000,
): Promise<boolean> {
  try {
    await locator.waitFor({ state, timeout: timeoutMs });
    return true;
  } catch (err) {
    if (err instanceof errors.TimeoutError) return false;
    throw err;
  }
}

const r = report("conversation artifacts popover");

await withBrowser(async (h) => {
  const { page } = await h.session();
  const button = page.getByRole("button", { name: BUTTON, exact: true });

  await boot(page, pathUrl(`/agents/c/${CONV}`), {
    marker: `button[aria-label="${BUTTON}"]`,
  });

  // --- 1. the closed button, once the transcript has arrived -----------------
  // While the events are still coming the button is a disabled glyph with no
  // count on purpose, so the count is waited FOR rather than read immediately.
  const settled = await waitFor(
    async () => (await button.innerText()).trim(),
    (text) => /^\d+$/.test(text),
    { timeoutMs: 60_000 },
  );
  await snap(page, out, "before");

  const total = Number(settled.value);
  r.ok(
    `the button shows a count (${JSON.stringify(settled.value)} after ${settled.waitedMs}ms)`,
    settled.ok,
  );
  r.ok(`the count is not zero (${total})`, total > 0);
  r.ok("the button is enabled once it has a count", await button.isEnabled());

  // --- 2. open it -----------------------------------------------------------
  await button.click();
  const panel = panelOf(page);
  r.ok("clicking opens the popover", await reaches(panel, "visible"));

  // Two kinds resolve their titles from a live list and draw a skeleton per
  // item until it lands, so the panel is only done when what it lists adds up
  // to what the button claimed.
  const loaded = await waitFor(
    async () => await listedCount(page),
    (n) => n === total,
    { timeoutMs: 30_000 },
  );
  await snap(page, out, "popover");

  // --- 3. the headings are the registry's, in the registry's order ----------
  const present = await headings(page);
  r.note(`sections: ${present.join(", ")}`);

  const unknown = present.filter(
    (label) => !KIND_LABELS.includes(label as (typeof KIND_LABELS)[number]),
  );
  r.ok(
    "every heading is a registered kind",
    unknown.length === 0,
    unknown.join(", "),
  );
  r.eq(
    "the headings are in registry order",
    present.join(" › "),
    KIND_LABELS.filter((label) => present.includes(label)).join(" › "),
  );
  for (const label of REQUIRED) {
    r.ok(`the "${label}" section is present`, present.includes(label));
  }

  // --- 4. the count is the number of things actually listed -----------------
  for (const [index, label] of present.entries()) {
    const n = await entriesAt(page, index).count();
    r.ok(`"${label}" lists something (${n})`, n > 0);
  }
  r.eq("the button's count is what the popover lists", loaded.value, total);

  // --- 5. a research row opens the doc beside the conversation --------------
  const row = entriesAt(page, present.indexOf("Research")).first();
  // Every row's tooltip opens with the artifact's own key, which for a research
  // doc is its repo-relative path — the one the pane is asked to open.
  const tooltip = (await row.getAttribute("title")) ?? "";
  const docPath = tooltip.split("\n")[0] ?? "";
  const docName = docPath.split("/").at(-1) ?? "";
  r.ok(
    `the first research row names a doc (${JSON.stringify(docPath)})`,
    /^(?:sidequests\/[^/]+\/)?research\/.+\.md$/.test(docPath),
  );

  await row.click();
  r.ok(
    "activating a row dismisses the popover",
    await reaches(panel, "hidden"),
  );

  const opened = await waitFor(
    async () => decodeURIComponent(page.url()),
    (url) => url.includes("/file/") && url.includes(docPath),
    { timeoutMs: 15_000 },
  );
  r.ok("the URL now carries a file pane for that doc", opened.ok, opened.value);
  r.ok(
    "the file pane shows the doc",
    await reaches(page.getByText(docName, { exact: true }).first(), "visible"),
  );
  // `mode: "push"` — a column to the RIGHT of the conversation, not over it.
  r.ok(
    "the conversation is still on screen beside it",
    await button.isVisible(),
  );
  await snap(page, out, "after");
});

await r.finish();
