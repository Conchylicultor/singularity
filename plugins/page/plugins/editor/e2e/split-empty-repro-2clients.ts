// SCRATCH repro driver #2: same page open in TWO clients, then the Enter-then-type
// sequence in client A. Two simultaneous bindings per block is the configuration
// the per-binding replicas exist for (research/2026-07-23-page-collab-binding-replicas.md),
// and the reported symptom — the tail renders, then goes empty while a reload
// brings it back — is that doc's failure class.
//
// Usage: bun plugins/page/plugins/editor/e2e/split-empty-repro-2clients.ts [--rounds 15] [--cpu 4]
import {
  baseUrl,
  numArg,
  report,
  withBrowser,
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";
import { blockText, editableBlocks, openBlankPage } from "./support/blank-page";

const base = baseUrl();
const r = report();
const ROUNDS = numArg("rounds", 15);
const DELAYS = [0, 8, 20, 45, 90, 200];

await withBrowser(async (h) => {
  const a = await h.session({ capture: false, label: "A" });
  const b = await h.session({ capture: false, label: "B" });

  const cpu = numArg("cpu", 1);
  if (cpu > 1) {
    for (const s of [a, b]) {
      const cdp = await s.page.context().newCDPSession(s.page);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
    }
  }

  const doc = await openBlankPage(a.page, base, { settleMs: 2500 });
  await b.page.goto(doc.pageUrl, { waitUntil: "domcontentloaded" });
  await editableBlocks(b.page).first().waitFor({ state: "visible" });
  await b.page.waitForTimeout(2500);

  const failures: string[] = [];

  for (let i = 0; i < ROUNDS; i++) {
    const delayMs = DELAYS[i % DELAYS.length]!;
    const head = `a${i}`;
    const tail = `b${i}`;

    await a.page.keyboard.press("Enter");
    await a.page.keyboard.type(head);
    await a.page.keyboard.press("Enter");
    if (delayMs > 0) await a.page.waitForTimeout(delayMs);
    await a.page.keyboard.type(tail);

    let got: string[] = [];
    let sawTail = false;
    let vanished = false;
    for (let s = 0; s < 25; s++) {
      await a.page.waitForTimeout(200);
      got = (
        await Promise.all((await editableBlocks(a.page).all()).map(blockText))
      ).slice(-2);
      if (got[1] === tail) sawTail = true;
      else if (sawTail) vanished = true;
      if (vanished) break;
    }
    const bTexts = (
      await Promise.all((await editableBlocks(b.page).all()).map(blockText))
    ).slice(-2);
    if (!vanished && got[0] === head && got[1] === tail) {
      if (bTexts[0] !== head || bTexts[1] !== tail) {
        // Does the hydration guard recover it in place? The starvation arm
        // waits out its settle window before acting, so give it that plus a
        // doc-init round trip before concluding anything.
        await b.page.waitForTimeout(9000);
        const bHealed = (
          await Promise.all((await editableBlocks(b.page).all()).map(blockText))
        ).slice(-2);
        if (bHealed[0] === head && bHealed[1] === tail) {
          r.note(
            `round ${i} (delay ${delayMs}ms): B diverged (${JSON.stringify(bTexts)}) and SELF-HEALED without a reload`,
          );
          continue;
        }
        // View-only breakage or real loss? A reload rebuilds B's bindings from
        // scratch against the same server state, so it separates the two.
        const badId = await editableBlocks(b.page)
          .last()
          .evaluate((el) =>
            el.closest("[data-block-id]")?.getAttribute("data-block-id"),
          );
        await b.page.reload({ waitUntil: "domcontentloaded" });
        await editableBlocks(b.page).first().waitFor({ state: "visible" });
        await b.page.waitForTimeout(2500);
        const bAfter = (
          await Promise.all((await editableBlocks(b.page).all()).map(blockText))
        ).slice(-2);
        failures.push(
          `round ${i} (delay ${delayMs}ms): A ok, B diverged — B=${JSON.stringify(bTexts)} B-after-reload=${JSON.stringify(bAfter)} block=${badId} page=${doc.pageId}`,
        );
        r.note(failures.at(-1)!);
      }
      continue;
    }
    failures.push(
      `round ${i} (delay ${delayMs}ms)${vanished ? " VANISHED" : ""}: A=${JSON.stringify(got)} B=${JSON.stringify(bTexts)} want ${JSON.stringify([head, tail])}`,
    );
    r.note(failures.at(-1)!);
    // Re-anchor A's caret at the end of the document for the next round.
    await editableBlocks(a.page).last().click();
    await a.page.keyboard.press("End");
  }

  r.ok(
    `${ROUNDS} two-client rounds converged`,
    failures.length === 0,
    failures.join("\n"),
  );
  await r.finish();
});
