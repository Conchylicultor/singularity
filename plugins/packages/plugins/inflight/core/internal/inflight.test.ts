import { describe, expect, test } from "bun:test";
import { createInflight } from "./inflight";

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

describe("createInflight", () => {
  test("shares one execution across concurrent callers with the same key", async () => {
    const inflight = createInflight();
    let calls = 0;
    let open!: () => void;
    const gate = new Promise<void>((r) => {
      open = r;
    });

    const fn = async () => {
      calls++;
      await gate;
      return "result";
    };

    const a = inflight.run("k", fn);
    const b = inflight.run("k", fn);
    expect(inflight.size).toBe(1);
    open();
    expect(await Promise.all([a, b])).toEqual(["result", "result"]);
    expect(calls).toBe(1); // body ran once, both callers got it
  });

  test("distinct keys run independently", async () => {
    const inflight = createInflight();
    let calls = 0;
    const fn = async () => {
      calls++;
      return calls;
    };
    const [a, b] = await Promise.all([inflight.run("a", fn), inflight.run("b", fn)]);
    expect(calls).toBe(2);
    expect(new Set([a, b])).toEqual(new Set([1, 2]));
  });

  test("clears the key after settlement — a later call runs fresh", async () => {
    const inflight = createInflight();
    let calls = 0;
    const fn = async () => ++calls;

    expect(await inflight.run("k", fn)).toBe(1);
    expect(inflight.size).toBe(0); // cleared on settle
    expect(await inflight.run("k", fn)).toBe(2); // not cached — runs again
  });

  test("shares a rejection then clears the key", async () => {
    const inflight = createInflight();
    let calls = 0;
    const fn = async () => {
      calls++;
      await tick();
      throw new Error("boom");
    };

    const messages = await Promise.all([
      inflight.run("k", fn).catch((err) => (err as Error).message),
      inflight.run("k", fn).catch((err) => (err as Error).message),
    ]);
    expect(messages).toEqual(["boom", "boom"]);
    expect(calls).toBe(1); // both shared the one failing body
    expect(inflight.size).toBe(0); // failure cleared the key

    // Next call retries fresh rather than inheriting the failed promise.
    expect(await inflight.run("k", async () => "fine")).toBe("fine");
  });
});
