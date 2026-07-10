import { expect, test } from "bun:test";
import { heavyReadLocalSlotCount, withHeavyReadSlot } from "./pool";

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// Regression: nested withHeavyReadSlot must be REENTRANT. Neither tier's
// semaphore is reentrant on its own, so before the fix a holder that acquired
// again parked on a gate only it could free — and with every local slot held by
// an outer holder that then nests (the warmup-executor × corpus-index shape),
// the whole heavy-read path deadlocked, freezing every live-state sub. See
// research/perfs/2026-07-10-read-admit-wedge-stuck-git-loaders.md.
//
// The test reproduces exactly that shape against the REAL two-tier gate:
// saturate the local tier with `heavyReadLocalSlotCount()` outer holders, then
// have one of them acquire again. Pre-fix the nested acquire waits forever
// (this test then fails by timeout); post-fix it runs immediately, consuming
// nothing. Uses the real host flock pool, so it needs `local` free host slots —
// true on any healthy box (local ≤ host by construction).
test("nested withHeavyReadSlot is reentrant — a saturated local gate cannot deadlock on itself", async () => {
  const local = heavyReadLocalSlotCount();
  let entered = 0;
  let nestedDone = false;
  let startNested!: () => void;
  const nestedGo = new Promise<void>((r) => (startNested = r));
  let releaseOuters!: () => void;
  const hold = new Promise<void>((r) => (releaseOuters = r));

  const outers = Promise.all(
    Array.from({ length: local }, (_, i) =>
      withHeavyReadSlot(async () => {
        entered++;
        if (i === 0) {
          await nestedGo;
          await withHeavyReadSlot(async () => {
            nestedDone = true;
          });
        }
        await hold;
      }),
    ),
  );

  // Wait until every local slot is genuinely held, so the nested acquire below
  // finds the gate fully saturated (the deadlock precondition).
  while (entered < local) await sleep(5);
  startNested();

  // Post-fix the nested body runs in microseconds; 3s is pure headroom. Pre-fix
  // it NEVER runs — bounded wait instead of hanging the suite.
  const deadline = Date.now() + 3_000;
  while (!nestedDone && Date.now() < deadline) await sleep(10);
  const nestedRanWhileSaturated = nestedDone;

  releaseOuters();
  await outers;
  expect(nestedRanWhileSaturated).toBe(true);
});
