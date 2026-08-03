// SCRATCH repro driver (not a gate): hunt the "typed text vanishes from the
// block Enter just created, but is still there after a reload" report.
//
// Sweeps the delay between the Enter and the first keystroke after it, since the
// suspected race is between the split's confirming push / doc-init handshake and
// the new block's Lexical binding attaching to its content doc.
//
// Usage: bun plugins/page/plugins/editor/e2e/split-empty-repro.ts [--rounds 40] [--headed]
import {
  baseUrl,
  numArg,
  report,
  withBrowser,
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";
import { blockText, editableBlocks, openBlankPage } from "./support/blank-page";

const base = baseUrl();
const r = report();
const ROUNDS = numArg("rounds", 40);
const DELAYS = [0, 4, 12, 25, 50, 90, 160, 300];

interface Failure {
  round: number;
  delayMs: number;
  want: [string, string];
  got: string[];
  afterReload: string[];
}

await withBrowser(async (h) => {
  const { page, captured } = await h.session({ capture: false });

  // The report is from a loaded box (agents + builds), where every React commit,
  // the confirming push and the doc-init handshake all stretch. Throttling the
  // renderer is the cheapest way to widen the same windows here.
  const cpu = numArg("cpu", 1);
  if (cpu > 1) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
  }

  await openBlankPage(page, base, { settleMs: 3000 });
  const failures: Failure[] = [];

  for (let i = 0; i < ROUNDS; i++) {
    const delayMs = DELAYS[i % DELAYS.length]!;
    const head = `a${i}`;
    const tail = `b${i}`;

    // Start every round in a fresh block, so `head` never appends to the tail
    // the previous round left the caret in.
    if (i > 0) await page.keyboard.press("Enter");
    await page.keyboard.type(head);
    await page.keyboard.press("Enter");
    if (delayMs > 0) await page.waitForTimeout(delayMs);
    await page.keyboard.type(tail);

    // The report is "the text shows, then suddenly vanishes" — so watch the two
    // blocks for a while instead of reading once. Samples span the ~1s
    // projection, the confirming push and the doc-init/doc-update round trips.
    let got: string[] = [];
    let sawTail = false;
    let vanished = false;
    for (let s = 0; s < 30; s++) {
      await page.waitForTimeout(200);
      const texts = await Promise.all(
        (await editableBlocks(page).all()).map(blockText),
      );
      got = texts.slice(-2);
      if (got[1] === tail) sawTail = true;
      else if (sawTail) vanished = true;
      if (vanished) break;
    }
    if (!vanished && got[0] === head && got[1] === tail) continue;
    if (vanished) r.note(`round ${i}: tail rendered, then VANISHED`);

    // Reproduced. Does a reload bring the text back (invisible) or not (lost)?
    await page.reload({ waitUntil: "domcontentloaded" });
    await editableBlocks(page).first().waitFor({ state: "visible" });
    await page.waitForTimeout(2500);
    const reloaded = await Promise.all(
      (await editableBlocks(page).all()).map(blockText),
    );
    failures.push({
      round: i,
      delayMs,
      want: [head, tail],
      got,
      afterReload: reloaded.slice(-2),
    });
    r.note(
      `round ${i} (delay ${delayMs}ms): want ${JSON.stringify([head, tail])} got ${JSON.stringify(got)} after-reload ${JSON.stringify(reloaded.slice(-2))}`,
    );
    // Put the caret back at the end of the document for the next round.
    const last = editableBlocks(page).last();
    await last.click();
    await page.keyboard.press("End");
  }

  r.ok(
    `${ROUNDS} Enter-then-type rounds all landed`,
    failures.length === 0,
    `${failures.length} failed: ${JSON.stringify(failures, null, 2)}`,
  );
  if (captured.consoleErrors.length > 0) {
    r.note(`console errors: ${JSON.stringify(captured.consoleErrors.slice(0, 10))}`);
  }
  r.finish();
});
