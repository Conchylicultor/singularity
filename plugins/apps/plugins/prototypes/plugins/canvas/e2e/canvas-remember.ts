// Verifies the canvas is remembered for its pane, within the browser tab: a
// fresh browser opens frame A alone; after adding the real app and a second
// prototype frame, picking a size preset and a zoom, a RELOAD brings the same
// canvas back — and the URL never changes (it names only the prototype).
// Closing a frame is remembered too. Opening the prototype anew (a navigation
// from the address bar, i.e. a new pane) starts fresh at frame A alone.
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
import {
  canvasFrameSelector,
  PROTOTYPE_FRAME_KIND,
} from "@plugins/apps/plugins/prototypes/plugins/canvas/core";
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
  const reload = async () => {
    await page.reload({ waitUntil: "domcontentloaded" });
    await page
      .locator(canvasFrameSelector({ letter: "A", status: "found" }))
      .waitFor({ state: "visible", timeout: 30_000 });
  };

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

  // Reload: the same canvas comes back.
  await reload();
  const back = await waitFor(kinds, (v) => v === worked, { timeoutMs: 20_000 });
  r.ok("a reload brings the frames back", back.ok, back.value);
  r.eq("…and the size and zoom", await chip(), workedChip);
  await page.mouse.move(2, 2);
  await snap(page, out, "reopened");

  // A closed frame stays closed.
  await frameAction(page, "C", "Remove from canvas");
  await reload();
  const closed = await waitFor(kinds, (v) => v === "A:prototype B:real-app", {
    timeoutMs: 20_000,
  });
  r.ok("a closed frame stays closed after a reload", closed.ok, closed.value);

  // A new pane (opened from the address bar) is a new comparison: fresh.
  await openCanvas(page, meta.name);
  r.eq(
    "opening the prototype anew starts at A alone",
    await kinds(),
    `A:${PROTOTYPE_FRAME_KIND}`,
  );
  r.eq("…at the default size", (await chip()).startsWith("Responsive"), true);

  r.ok(
    "no page errors",
    captured.pageErrors.length === 0,
    captured.pageErrors.join(" | "),
  );
  await r.finish();
});
