import { describe, expect, test } from "bun:test";
import { createBurstRouter } from "./burst";
import type { FeedChange } from "./route-change";

const change = (table: string, xid: string): FeedChange => ({
  source: "feed",
  table,
  op: "U",
  ids: ["1"],
  xid,
  keys: null,
  unchanged: null,
});

describe("createBurstRouter", () => {
  // The two NOTIFYs of one transaction, handed over by two socket reads: the
  // runtime's microtask drain must not run between them, or it ships the
  // transaction's ack before its second change reached the tuple.
  test("changes arriving across microtasks route together, in order, from one macrotask", async () => {
    const turns: Array<[string, number]> = [];
    let turn = 0;
    const route = createBurstRouter((c) => turns.push([c.table, turn]));
    route(change("hosts_ext", "900"));
    await Promise.resolve(); // a microtask drain would run here
    turn++;
    route(change("hosts", "900"));
    expect(turns).toEqual([]); // nothing routed before the macrotask
    await new Promise<void>((r) => setImmediate(r));
    expect(turns).toEqual([
      ["hosts_ext", 1],
      ["hosts", 1],
    ]);
  });

  test("a later burst is routed on its own macrotask", () => {
    const deferred: Array<() => void> = [];
    const routed: string[] = [];
    const route = createBurstRouter(
      (c) => routed.push(c.table),
      (fn) => deferred.push(fn),
    );
    route(change("a", "1"));
    route(change("b", "1"));
    expect(deferred).toHaveLength(1); // one macrotask per burst
    deferred.shift()!();
    expect(routed).toEqual(["a", "b"]);
    route(change("c", "2"));
    expect(deferred).toHaveLength(1);
    deferred.shift()!();
    expect(routed).toEqual(["a", "b", "c"]);
  });
});
