// Verifies the canvas is remembered: a fresh browser opens frame A alone; after
// adding the real app and a second prototype frame, picking a size preset and a
// zoom, reopening the prototype brings the same canvas back — and the URL never
// changes (it names only the prototype). Closing a frame is remembered too.
// Needs a prototype that declares a `mocks` counterpart this deploy resolves.
// Manual only — nothing runs this automatically.
//
// Usage:
//   ./singularity run plugins/apps/plugins/prototypes/plugins/canvas/e2e/canvas-remember.ts \
//     [--name <prototype id>] [--out <prefix>] [--headed]

import {
  arg,
  report,
  snap,
  waitFor,
  withBrowser,
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";
import { PROTOTYPE_FRAME_KIND } from "@plugins/apps/plugins/prototypes/plugins/canvas/core";
import {
  addSource,
  frameAction,
  listFrames,
  openCanvas,
  openSizeMenu,
  pickPrototype,
  pickSize,
  sizeChip,
} from "./driver";

const out = arg("out", "/tmp/canvas-remember");
const meta = await pickPrototype();
const bare = `/prototypes/proto/${meta.name}`;

await withBrowser(async (h) => {
  const r = report(`canvas remember — ${meta.title} (${meta.name})`);
  const { page, captured } = await h.session({
    viewport: { width: 1600, height: 1000 },
  });
  const kinds = async () =>
    (await listFrames(page)).map((f) => `${f.letter}:${f.kind}`).join(" ");
  const chip = async () =>
    (await sizeChip(page).innerText()).replace(/\s+/g, " ").trim();
  const pathname = () => new URL(page.url()).pathname;

  await openCanvas(page, meta.name);
  r.eq(
    "a fresh browser opens A alone",
    await kinds(),
    `A:${PROTOTYPE_FRAME_KIND}`,
  );

  // Work the canvas: the real app, a copy of A, a preset, a fixed zoom.
  await addSource(page, "Real app");
  await page.getByRole("button", { name: "Frame", exact: true }).click();
  await pickSize(page, "Phone");
  await openSizeMenu(page);
  await page.getByRole("button", { name: "Actual size" }).click();
  await page.keyboard.press("Escape");
  const worked = await kinds();
  const workedChip = await chip();
  r.eq("the worked canvas", worked, "A:prototype B:real-app C:prototype");
  r.eq("…with the URL untouched", pathname(), bare);

  // Reopen: the same canvas comes back.
  await openCanvas(page, meta.name);
  const back = await waitFor(kinds, (v) => v === worked, { timeoutMs: 20_000 });
  r.ok("reopening brings the frames back", back.ok, back.value);
  r.eq("…and the size and zoom", await chip(), workedChip);
  await page.mouse.move(2, 2);
  await snap(page, out, "reopened");

  // A closed frame stays closed.
  await frameAction(page, "C", "Remove from canvas");
  await openCanvas(page, meta.name);
  const closed = await waitFor(kinds, (v) => v === "A:prototype B:real-app", {
    timeoutMs: 20_000,
  });
  r.ok("a closed frame stays closed after reopening", closed.ok, closed.value);

  r.ok(
    "no page errors",
    captured.pageErrors.length === 0,
    captured.pageErrors.join(" | "),
  );
  await r.finish();
});
