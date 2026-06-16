import { afterEach, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { SINGULARITY_DIR } from "@plugins/infra/plugins/paths/server";
import { createHostSemaphore } from "./host-semaphore";

// Unique slot dir per `createHostSemaphore` so parallel test runs (and the two
// tests below) never collide on the same lock files.
let counter = 0;
const usedNames: string[] = [];
function uniqueName(prefix: string): string {
  const name = `hosttest-${prefix}-${process.pid}-${Date.now()}-${counter++}`;
  usedNames.push(name);
  return name;
}

afterEach(() => {
  for (const name of usedNames.splice(0)) {
    rmSync(join(SINGULARITY_DIR, `${name}-slots`), { recursive: true, force: true });
  }
});

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

test("validates size and name", () => {
  expect(() => createHostSemaphore({ name: "ok", size: 0 })).toThrow();
  expect(() => createHostSemaphore({ name: "ok", size: 1.5 })).toThrow();
  expect(() => createHostSemaphore({ name: "Bad_Name", size: 1 })).toThrow();
  expect(() => createHostSemaphore({ name: "-bad", size: 1 })).toThrow();
  expect(() => createHostSemaphore({ name: "good-1", size: 1 })).not.toThrow();
});

describe("cross-process serialization", () => {
  test("size 1 serializes 3 overlapping runs through fast-path + broker", async () => {
    const sem = createHostSemaphore({ name: uniqueName("s1"), size: 1 });

    let active = 0;
    let peak = 0;
    const order: number[] = [];

    async function job(id: number): Promise<void> {
      await sem.run(async () => {
        active++;
        peak = Math.max(peak, active);
        order.push(id);
        await sleep(50);
        active--;
      });
    }

    // Launch all 3 overlapping: the first wins the in-process fast path; the
    // other two find every slot busy and queue via the blocking broker.
    await Promise.all([job(1), job(2), job(3)]);

    expect(peak).toBe(1); // never more than one body at a time
    expect(order.sort()).toEqual([1, 2, 3]); // all three ran
    expect(active).toBe(0); // every slot released
  });

  test("size 2 allows 2 concurrent but never 3", async () => {
    const sem = createHostSemaphore({ name: uniqueName("s2"), size: 2 });

    let active = 0;
    let peak = 0;
    let sawTwo = false;

    async function job(): Promise<void> {
      await sem.run(async () => {
        active++;
        peak = Math.max(peak, active);
        if (active === 2) sawTwo = true;
        await sleep(60);
        active--;
      });
    }

    await Promise.all([job(), job(), job(), job()]);

    expect(peak).toBe(2); // two slots → at most two bodies
    expect(sawTwo).toBe(true); // and it really did reach two (not just serialized)
    expect(active).toBe(0);
  });

  test("a rejecting fn never leaks a slot", async () => {
    const sem = createHostSemaphore({ name: uniqueName("rej"), size: 1 });

    let rejected: unknown;
    try {
      await sem.run(async () => {
        throw new Error("boom");
      });
    } catch (err) {
      rejected = err;
    }
    expect(rejected).toBeInstanceOf(Error);
    expect((rejected as Error).message).toBe("boom");

    // If the slot leaked, this immediate run would hang/queue. It must take the
    // fast path and resolve promptly.
    let ran = false;
    await sem.run(async () => {
      ran = true;
    });
    expect(ran).toBe(true);
  });
});
