// Verifies prototype options end to end on a prototype that declares some:
// the picker pill is on the stage, hovering it reveals the options, Reset
// returns the page to its defaults, picking a value lands on the frame's
// <html data-*>, the pick is stored on the server (a fresh browser with empty
// storage opens on it), it survives the reload an edit causes, the Compare mock
// shows the same variant, and a URL naming an undeclared value is refused.
// Manual only — nothing runs this automatically.
//
// The picks are ONE shared record per prototype, so this run changes what the
// user sees while it runs. Its writes are agent-origin (the harness marks every
// request), so the agent-write ledger puts the record back when the run ends —
// the harness's end-of-run line names "Prototype option picks".
//
// Usage:
//   ./singularity run plugins/apps/plugins/prototypes/plugins/gallery/e2e/options-picker.ts \
//     [--name <prototype id>] [--out <prefix>] [--headed]

import type { Frame, Page } from "playwright";
import {
  agentFetch,
  arg,
  boot,
  pathUrl,
  report,
  snap,
  waitFor,
  withBrowser,
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";
import {
  humanizeToken,
  type PrototypeMeta,
} from "@plugins/apps/plugins/prototypes/plugins/files/core";
import { touchPrototype } from "@plugins/apps/plugins/prototypes/plugins/files/e2e";

const out = arg("out", "/tmp/options-picker");

async function pickTarget(): Promise<PrototypeMeta> {
  const res = await agentFetch(`/api/prototypes`);
  if (!res.ok) throw new Error(`GET /api/prototypes → ${res.status}`);
  const rows = (await res.json()) as PrototypeMeta[];
  const wanted = arg("name");
  const meta = wanted
    ? rows.find((p) => p.name === wanted)
    : rows.find((p) => p.options.length > 0);
  if (!meta) {
    throw new Error(
      wanted
        ? `no prototype ${wanted}`
        : 'no prototype declares <meta name="prototype-option">',
    );
  }
  if (meta.options.length === 0)
    throw new Error(`${meta.name} declares no options`);
  return meta;
}

const meta = await pickTarget();
const [firstOption] = meta.options;
if (!firstOption) throw new Error(`${meta.name} declares no options`);
const option = firstOption;
const nonDefault = option.values.find((v) => v !== option.default);
if (nonDefault === undefined) {
  throw new Error(`${option.name} has no non-default value`);
}
const value = nonDefault;

/** The prototype's document frame (Focus's, or Compare's mock half). */
function prototypeFrame(page: Page): Frame | undefined {
  return page
    .frames()
    .find((f) => f.url().includes(`/api/prototypes/${meta.name}/index.html`));
}

async function frameAttr(page: Page): Promise<string | null> {
  const frame = prototypeFrame(page);
  if (!frame) return null;
  return frame
    .evaluate(
      (n) => document.documentElement.getAttribute(`data-${n}`),
      option.name,
    )
    .catch((err: unknown) => {
      // A frame mid-navigation has no document to ask; the caller polls.
      if (
        err instanceof Error &&
        /navigat|detached|destroyed/i.test(err.message)
      ) {
        return null;
      }
      throw err;
    });
}

const detailUrl = pathUrl(`/prototypes/proto/${meta.name}`);

await withBrowser(async (h) => {
  const r = report(`options — ${meta.name} (${option.name})`);
  const { page } = await h.session({ colorScheme: "dark" });
  await boot(page, detailUrl, { marker: "iframe", settleMs: 1000 });

  // --- the pill, at rest --------------------------------------------------
  const pill = page.getByLabel("Prototype options");
  r.ok("the options pill is on the stage", await pill.isVisible());
  await snap(page, out, "collapsed");

  // --- hover reveals; Reset returns to the defaults -------------------------
  // The page opens on whatever the user picked — the record is shared — so
  // reset it first when anything is picked. Reset is offered only then.
  await pill.hover();
  const group = page.getByRole("radiogroup", {
    name: humanizeToken(option.name),
  });
  await group.waitFor({ state: "visible", timeout: 5000 });
  await snap(page, out, "expanded");
  const reset = page.getByRole("button", { name: "Reset to defaults" });
  if (await reset.isVisible()) await reset.click();
  const atDefault = await waitFor(
    () => frameAttr(page),
    (v) => v === option.default,
    { timeoutMs: 15_000 },
  );
  r.ok(
    "the page is on its authored default (reset if anything was picked)",
    atDefault.ok,
    `data-${option.name}=${String(atDefault.value)}`,
  );

  // --- a chip picks ---------------------------------------------------------
  await pill.hover();
  await group.waitFor({ state: "visible", timeout: 5000 });
  await group.getByRole("radio", { name: humanizeToken(value) }).click();

  const picked = await waitFor(
    () => frameAttr(page),
    (v) => v === value,
    {
      timeoutMs: 15_000,
    },
  );
  r.ok(
    `picking "${value}" lands on the frame's <html data-${option.name}>`,
    picked.ok,
    `data-${option.name}=${String(picked.value)}`,
  );
  r.ok(
    "the frame URL carries the pick",
    (prototypeFrame(page)?.url() ?? "").includes(`${option.name}=${value}`),
    prototypeFrame(page)?.url(),
  );
  await page.mouse.move(5, 5);
  await snap(page, out, "picked");

  // --- the pick is the server's, not this browser's -------------------------
  // A second session has its own, empty storage: if it opens on the pick, the
  // pick was stored on the server, where every surface reads it.
  const fresh = await h.session({ colorScheme: "dark" });
  await boot(fresh.page, detailUrl, { marker: "iframe", settleMs: 1000 });
  const persisted = await waitFor(
    () => frameAttr(fresh.page),
    (v) => v === value,
    { timeoutMs: 15_000 },
  );
  r.ok(
    "a fresh browser (empty storage) opens on the pick",
    persisted.ok,
    `data-${option.name}=${String(persisted.value)}`,
  );
  await fresh.context.close();

  // --- an edit reloads the frame; the pick stays ---------------------------
  const before = prototypeFrame(page)?.url() ?? "";
  await touchPrototype(meta.name);
  const reloaded = await waitFor(
    () => Promise.resolve(prototypeFrame(page)?.url()),
    (now) => now !== undefined && now !== before,
    { timeoutMs: 15_000 },
  );
  r.ok("an edit reloads the frame", reloaded.ok, reloaded.value);
  const kept = await waitFor(
    () => frameAttr(page),
    (v) => v === value,
    {
      timeoutMs: 15_000,
    },
  );
  r.ok(
    "the pick survives the reload",
    kept.ok,
    `data-${option.name}=${String(kept.value)}`,
  );

  // --- Compare's mock half shows the same variant --------------------------
  await page.getByRole("radio", { name: "Compare" }).click();
  const compared = await waitFor(
    async () => ({
      url: prototypeFrame(page)?.url() ?? "",
      attr: await frameAttr(page),
    }),
    (v) => v.url.includes(`${option.name}=${value}`) && v.attr === value,
    { timeoutMs: 15_000 },
  );
  r.ok(
    "Compare's mock frame carries the pick",
    compared.ok,
    JSON.stringify(compared.value),
  );
  await snap(page, out, "compare");

  // --- a broken variant link is refused, not defaulted ---------------------
  const bad = await agentFetch(
    `/api/prototypes/${meta.name}/index.html?${option.name}=not-a-value`,
  );
  r.ok(
    "an undeclared value is a 400",
    bad.status === 400,
    `${bad.status}: ${(await bad.text()).slice(0, 160)}`,
  );
});
