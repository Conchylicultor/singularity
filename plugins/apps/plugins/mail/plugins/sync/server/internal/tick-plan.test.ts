import { describe, expect, test } from "bun:test";
import { mailAccountIdKind } from "@plugins/apps/plugins/mail/plugins/mail-core/core";
import { planSyncTick } from "./tick-plan";

const id = mailAccountIdKind.key;

describe("planSyncTick", () => {
  test("no account yet → bootstrap (first connect)", () => {
    expect(planSyncTick([])).toEqual({ bootstrap: true, delta: [] });
  });

  test("an account with no sync-state row → bootstrap (restored from backup)", () => {
    expect(planSyncTick([{ id: id("a"), status: null }])).toEqual({
      bootstrap: true,
      delta: [],
    });
  });

  test("pull-ready accounts get a delta; backfilling and errored are left alone", () => {
    expect(
      planSyncTick([
        { id: id("d"), status: "delta" },
        { id: id("i"), status: "idle" },
        { id: id("b"), status: "backfilling" },
        { id: id("e"), status: "error" },
      ]),
    ).toEqual({ bootstrap: false, delta: [id("d"), id("i")] });
  });

  test("a missing row does not stop other accounts' deltas", () => {
    expect(
      planSyncTick([
        { id: id("gone"), status: null },
        { id: id("d"), status: "delta" },
      ]),
    ).toEqual({ bootstrap: true, delta: [id("d")] });
  });
});
