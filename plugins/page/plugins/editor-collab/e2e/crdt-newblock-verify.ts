// Stage-4a doc-init ordering-race verification
// (research/2026-07-07-page-per-block-crdt-plan-b.md, Task 1).
//
// With per-block CRDT text (now unconditional — the flag is deleted):
//  1. create a blank page and drive FAST create-block + split-block sequences —
//     Enter immediately followed by typing in the freshly-minted block, i.e.
//     the editor mounts from the optimistic overlay BEFORE the structural op's
//     POST has created the `_blocks` row (the exact doc-init FK race);
//  2. assert NO doc-init / doc-update / blocks request ever returns >= 400
//     (previously: FK violation → 500 → wedged initStarted latch);
//  3. assert EVERY block ends up with a `page_block_docs` row whose decoded
//     Yjs state matches the DOM text (the latch never wedged — buffered
//     keystrokes flushed after the gated seed);
//  4. assert `data.text` (the projection) converges to the same text;
//  5. open a second browser context and assert it converges.
//
// Usage: bun plugins/page/plugins/editor-collab/e2e/crdt-newblock-verify.ts [--base <url>] [--out <path>]
import {
  arg,
  baseUrl,
  report,
  snap,
  withBrowser,
} from "@plugins/framework/plugins/tooling/plugins/e2e-harness/e2e";
import { openBlankPage } from "@plugins/page/plugins/editor/e2e";
import { blockDocText, fetchBlockDoc } from "./support/ydoc";

const base = baseUrl();
const out = arg("out", "/tmp/crdt-newblock");

const r = report();

await withBrowser(async (h) => {
  const { page: pageA, captured } = await h.session({ label: "A" });
  const pageErrors = captured.pageErrors;

  const badResponses: string[] = [];
  pageA.on("response", (res) => {
    const url = res.url();
    if (!/\/api\/(blocks|pages)/.test(url)) return;
    if (res.status() >= 400) {
      badResponses.push(`${res.status()} ${res.request().method()} ${url}`);
      console.log("BAD RESPONSE:", res.status(), res.request().method(), url);
    }
  });

  const { pageUrl, pageId } = await openBlankPage(pageA, base, { settleMs: 3000 });
  console.log("page url:", pageUrl, "pageId:", pageId);

  // --- The race: rapid Enter-then-type chains ---------------------------------
  // Each Enter dispatches a split op minting a new block; typing begins in the
  // new block's editor ~25ms later — faster than any human Enter→key sequence,
  // and far inside the structural-op round-trip + confirm-push + doc-init window
  // (the FK race Stage 4a gates). Sub-20ms after Enter a single leading char can
  // still be dropped (see ./split-typing-window-probe.ts) — that regime is
  // beyond human input and deliberately not asserted here.
  const ENTER_SETTLE_MS = 25;
  const LINES = ["alpha one", "bravo two", "charlie three", "delta four"] as const;
  await pageA.keyboard.type(LINES[0], { delay: 5 });
  for (const line of LINES.slice(1)) {
    await pageA.keyboard.press("Enter");
    await pageA.waitForTimeout(ENTER_SETTLE_MS);
    await pageA.keyboard.type(line, { delay: 5 });
  }
  // Mid-text split: caret placed mid-word, then Enter and immediate typing in
  // the tail-seeded new block.
  await pageA.keyboard.press("Enter");
  await pageA.waitForTimeout(ENTER_SETTLE_MS);
  await pageA.keyboard.type("splitXtail", { delay: 5 });
  // Lexical absorbs native caret moves via selectionchange, which lags a
  // zero-delay synthetic arrow burst (same caveat as crdt-split-merge-verify).
  for (let i = 0; i < "Xtail".length; i++) {
    await pageA.keyboard.press("ArrowLeft");
    await pageA.waitForTimeout(50);
  }
  await pageA.keyboard.press("Enter");
  await pageA.waitForTimeout(ENTER_SETTLE_MS);
  await pageA.keyboard.type("typed-immediately-", { delay: 5 });

  // Settle: flush debounce (300ms), projection debounce (1s), pushes.
  await pageA.waitForTimeout(3500);
  await snap(pageA, out, "a");

  // DOM truth: every block id + its visible text, in order.
  const domBlocks = await pageA.evaluate(() => {
    return [...document.querySelectorAll("[data-block-id]")]
      .map((el) => ({
        id: el.getAttribute("data-block-id"),
        text:
          el.querySelector<HTMLElement>('[contenteditable="true"]')?.innerText ?? null,
      }))
      .filter((b): b is { id: string; text: string } => b.text !== null && b.id !== null);
  });
  console.log("DOM blocks:", JSON.stringify(domBlocks, null, 1));

  const EXPECTED = [...LINES, "split", "typed-immediately-Xtail"];
  const domTexts = domBlocks.map((b) => b.text.replace(/ /g, " ").trim());
  r.eq("DOM", domTexts, EXPECTED);

  // Server truth 1: every block has a page_block_docs row whose decoded state
  // matches the DOM (proves the seed happened AND the buffered typing flushed).
  let docsOk = true;
  for (const b of domBlocks) {
    // fetchBlockDoc (not fetchBlockDocText) — this assertion needs to tell
    // "no row at all" apart from "row whose text is empty".
    const stored = await fetchBlockDoc(base, b.id);
    if (!stored) {
      docsOk = false;
      console.log(
        `DOC MISSING for block ${b.id} ("${b.text}") — page_block_docs row never created`,
      );
      continue;
    }
    const docText = blockDocText(stored.state);
    const want = b.text.replace(/ /g, " ").trim();
    if (docText.trim() !== want) {
      docsOk = false;
      console.log(`DOC MISMATCH for block ${b.id}: doc="${docText}" dom="${want}"`);
    }
  }
  r.ok("DOCS — every block has a converged page_block_docs row", docsOk);

  // Server truth 2: the data.text projection converged too.
  const rows = (await (await fetch(`${base}/api/pages/${pageId}/blocks`)).json()) as {
    id: string;
    data?: { text?: { text?: string }[] };
  }[];
  const rowTextById = new Map(
    rows.map((row) => [row.id, (row.data?.text ?? []).map((run) => run.text ?? "").join("")]),
  );
  let projOk = true;
  for (const b of domBlocks) {
    const want = b.text.replace(/ /g, " ").trim();
    const got = (rowTextById.get(b.id) ?? "<row missing>").trim();
    if (got !== want) {
      projOk = false;
      console.log(`PROJECTION MISMATCH for ${b.id}: data.text="${got}" dom="${want}"`);
    }
  }
  r.ok("PROJECTION — data.text agrees for every block", projOk);

  // Convergence: a second, fresh browser context.
  const { page: pageB } = await h.session({ label: "B" });
  await pageB.goto(pageUrl);
  await pageB.waitForTimeout(5000);
  const bTexts = (
    await pageB.evaluate(() =>
      [
        ...document.querySelectorAll<HTMLElement>(
          '[data-block-id] [contenteditable="true"]',
        ),
      ].map((el) => el.innerText),
    )
  ).map((t) => t.replace(/ /g, " ").trim());
  await snap(pageB, out, "b");
  r.eq("CONVERGENCE", bTexts, EXPECTED);

  r.ok(
    "HTTP — no >=400 on any blocks/doc endpoint",
    badResponses.length === 0,
    badResponses.join("; "),
  );
  r.ok("NO PAGE ERRORS", pageErrors.length === 0, pageErrors.join("; "));

  r.finish();
});
