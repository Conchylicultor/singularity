import { describe, expect, test } from "bun:test";
import { waitForQuestion, wakeQuestion } from "./waiters";

describe("question waiters", () => {
  test("a wake resolves every request held on the question", async () => {
    const ac = new AbortController();
    const a = waitForQuestion("t1", 60_000, ac.signal);
    const b = waitForQuestion("t1", 60_000, ac.signal);
    const other = waitForQuestion("t2", 60_000, ac.signal);
    let otherDone = false;
    void other.done.then(() => (otherDone = true));
    wakeQuestion("t1");
    await Promise.all([a.done, b.done]);
    expect(otherDone).toBe(false);
    other.cancel();
  });

  test("the cap and a client abort each end the hold", async () => {
    await waitForQuestion("t3", 5, new AbortController().signal).done;
    const ac = new AbortController();
    const held = waitForQuestion("t4", 60_000, ac.signal);
    ac.abort();
    await held.done;
  });
});
