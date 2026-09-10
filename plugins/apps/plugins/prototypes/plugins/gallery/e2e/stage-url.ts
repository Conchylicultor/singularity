// Verifies that every stage of a prototype's detail pane has its own URL:
// picking a stage writes it into the address without remounting the pane, Back
// returns to the previous stage, and a stage URL opens on that stage. Manual
// only — nothing runs this automatically.
//
// Usage:
//   ./singularity run plugins/apps/plugins/prototypes/plugins/gallery/e2e/stage-url.ts \
//     [--name <prototype>] [--out <prefix>] [--headed]

import {
  agentFetch,
  arg,
  boot,
  pathUrl,
  report,
  snap,
  withBrowser,
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";

const out = arg("out", "/tmp/stage-url");

async function firstPrototypeName(): Promise<string> {
  const res = await agentFetch(`/api/prototypes`);
  if (!res.ok) throw new Error(`GET /api/prototypes → ${res.status}`);
  const rows = (await res.json()) as { name: string }[];
  const first = rows[0];
  if (!first) throw new Error("no prototypes exist to open");
  return first.name;
}

const name = arg("name") ?? (await firstPrototypeName());
const bare = `/prototypes/proto/${name}`;

await withBrowser(async (h) => {
  const r = report(`stage url — ${name}`);
  const { page, captured } = await h.session();
  await boot(page, pathUrl(bare), { marker: "iframe", settleMs: 1000 });

  const chip = (label: string) => page.getByRole("radio", { name: label });
  const checked = async (label: string) =>
    (await chip(label).getAttribute("aria-checked")) === "true";
  const pathname = () => new URL(page.url()).pathname;

  r.ok("the bare URL opens on Focus", await checked("Focus"));

  // Tag the switcher's DOM node: if picking a stage remounted the pane, the
  // tagged node would be gone from the document afterwards.
  await page.evaluate(() => {
    const el = document.querySelector('[role="radiogroup"]');
    (window as unknown as { __stageMarker?: Element | null }).__stageMarker =
      el;
  });

  await chip("Compare").click();
  await page.waitForURL((u) => u.pathname === `${bare}/compare`, {
    timeout: 5000,
  });
  r.ok("Compare writes its URL", pathname() === `${bare}/compare`, pathname());
  r.ok("Compare is the picked stage", await checked("Compare"));
  r.ok(
    "the pane was not remounted",
    await page.evaluate(
      () =>
        (window as unknown as { __stageMarker?: Element | null }).__stageMarker
          ?.isConnected === true,
    ),
  );
  await snap(page, out, "compare");

  await page.goBack();
  await page.waitForURL((u) => u.pathname === bare, { timeout: 5000 });
  r.ok("Back returns to the bare URL", pathname() === bare, pathname());
  r.ok("…and to Focus", await checked("Focus"));

  await boot(page, pathUrl(`${bare}/compare`), {
    marker: "iframe",
    settleMs: 1000,
  });
  r.ok("the Compare URL opens on Compare", await checked("Compare"));

  r.ok(
    "no page errors",
    captured.pageErrors.length === 0,
    captured.pageErrors.join(" | "),
  );
  await r.finish();
});
