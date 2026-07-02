import { describe, expect, test } from "bun:test";
import { createSemaphore } from "./semaphore";

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

describe("createSemaphore", () => {
  test("rejects a non-positive or non-integer max", () => {
    expect(() => createSemaphore(0)).toThrow();
    expect(() => createSemaphore(-1)).toThrow();
    expect(() => createSemaphore(1.5)).toThrow();
  });

  test("never exceeds max concurrent bodies", async () => {
    const sem = createSemaphore(3);
    let active = 0;
    let peak = 0;
    let open!: () => void;
    const gate = new Promise<void>((r) => {
      open = r;
    });

    const tasks = Array.from({ length: 10 }, () =>
      sem.run(async () => {
        active++;
        peak = Math.max(peak, active);
        await gate;
        active--;
      }),
    );

    await tick();
    expect(active).toBe(3); // exactly max admitted, rest queued
    open();
    await Promise.all(tasks);
    expect(peak).toBe(3);
  });

  test("admits queued waiters in FIFO order", async () => {
    const sem = createSemaphore(1);
    const order: number[] = [];
    const tasks = [0, 1, 2].map((i) =>
      sem.run(async () => {
        order.push(i);
      }),
    );
    await Promise.all(tasks);
    expect(order).toEqual([0, 1, 2]);
  });

  test("reports wait time via onWait — ~0 when free, positive when queued", async () => {
    const sem = createSemaphore(1);
    const waits: number[] = [];
    let open!: () => void;
    const gate = new Promise<void>((r) => {
      open = r;
    });

    // First holder acquires immediately (no wait) and parks on the gate.
    const first = sem.run(async () => {
      await gate;
    }, (ms) => waits.push(ms));
    // Second must queue behind the first, so its onWait is positive.
    const second = sem.run(async () => {}, (ms) => waits.push(ms));

    await tick();
    expect(waits).toEqual([expect.any(Number)]); // only the immediate holder reported so far
    expect(waits[0]!).toBeLessThan(5); // acquired without queueing
    open();
    await Promise.all([first, second]);
    expect(waits).toHaveLength(2);
    expect(waits[1]!).toBeGreaterThan(0); // genuinely waited for the slot
  });

  test("stats() reports active/queued/max through fill, saturation, and drain", async () => {
    const sem = createSemaphore(2);
    expect(sem.stats()).toEqual({ active: 0, queued: 0, max: 2 });

    let open!: () => void;
    const gate = new Promise<void>((r) => {
      open = r;
    });

    const tasks = Array.from({ length: 5 }, () =>
      sem.run(async () => {
        await gate;
      }),
    );

    await tick();
    // 2 hold slots, the other 3 queue behind them.
    expect(sem.stats()).toEqual({ active: 2, queued: 3, max: 2 });

    open();
    await Promise.all(tasks);
    expect(sem.stats()).toEqual({ active: 0, queued: 0, max: 2 });
  });

  test("releases the slot when the body rejects", async () => {
    const sem = createSemaphore(1);
    let message: string | undefined;
    try {
      await sem.run(async () => {
        throw new Error("boom");
      });
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message).toBe("boom");
    // Slot must be free again — this would hang if the rejection leaked it.
    expect(await sem.run(async () => "ok")).toBe("ok");
  });
});
