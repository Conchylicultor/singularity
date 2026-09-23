// Verifies the canvas's one URL part: `proto/<id>/compare` opens frame A beside
// the real app (the frame source compare contributes, which appears once its
// plugin has loaded); on the bare URL, `+ Real app` adds that frame and writes
// `/compare` into the address, and closing the frame takes it back out — both
// without remounting the canvas. Needs a prototype that declares a `mocks`
// counterpart this deploy resolves.
// Manual only — nothing runs this automatically.
//
// Usage:
//   ./singularity run plugins/apps/plugins/prototypes/plugins/canvas/e2e/canvas-url.ts \
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
  frameAction,
  listFrames,
  openCanvas,
  pickPrototype,
  screen,
} from "./driver";

const out = arg("out", "/tmp/canvas-url");
const meta = await pickPrototype();
const bare = `/prototypes/proto/${meta.name}`;

await withBrowser(async (h) => {
  const r = report(`canvas url — ${meta.title} (${meta.name})`);
  const { page, captured } = await h.session({
    viewport: { width: 1600, height: 1000 },
  });
  const kinds = async () =>
    (await listFrames(page)).map((f) => `${f.letter}:${f.kind}`).join(" ");
  const pathname = () => new URL(page.url()).pathname;

  // The /compare URL opens A beside the real app.
  await openCanvas(page, meta.name, "compare");
  const opened = await waitFor(
    kinds,
    (v) => /^A:prototype B:(?!prototype)\S+$/.test(v),
    { timeoutMs: 20_000 },
  );
  r.ok("/compare opens A beside a source frame", opened.ok, opened.value);
  const source = opened.value.split(" ")[1]?.split(":")[1] ?? "";
  r.eq("…the real app", source, "real-app");
  const found = await page
    .locator(canvasFrameSelector({ letter: "B", status: "found" }))
    .waitFor({ state: "attached", timeout: 30_000 })
    .then(
      () => true,
      async () => (await screen(page, "B").innerText()).replace(/\s+/g, " "),
    );
  r.ok(
    "the real-app frame resolves on this deploy",
    found === true,
    typeof found === "string" ? found : undefined,
  );
  await page.mouse.move(2, 2);
  await snap(page, out, "compare");

  // The bare URL: A alone; + Real app writes /compare.
  await openCanvas(page, meta.name);
  r.eq(
    "the bare URL opens A alone",
    await kinds(),
    `A:${PROTOTYPE_FRAME_KIND}`,
  );
  // Tag A's screen: if the URL write remounted the canvas, it would be gone.
  await screen(page, "A").evaluate((el) => {
    (window as unknown as { __canvasA?: Element }).__canvasA = el;
  });
  const addReal = page.getByRole("button", { name: "Real app", exact: true });
  await addReal.click();
  await page.waitForURL((u) => u.pathname === `${bare}/compare`, {
    timeout: 5000,
  });
  r.eq("+ Real app writes /compare", pathname(), `${bare}/compare`);
  r.eq("…and adds the real-app frame", await kinds(), "A:prototype B:real-app");
  r.ok(
    "…and is disabled while it is on the canvas",
    await addReal.isDisabled(),
  );

  // Closing the real-app frame takes /compare back out.
  await frameAction(page, "B", "Remove from canvas");
  await page.waitForURL((u) => u.pathname === bare, { timeout: 5000 });
  r.eq("closing it returns to the bare URL", pathname(), bare);
  r.eq("…with A alone", await kinds(), "A:prototype");
  r.ok(
    "the canvas was not remounted by either URL write",
    await page.evaluate(
      () =>
        (window as unknown as { __canvasA?: Element }).__canvasA
          ?.isConnected === true,
    ),
  );

  r.ok(
    "no page errors",
    captured.pageErrors.length === 0,
    captured.pageErrors.join(" | "),
  );
  await r.finish();
});
