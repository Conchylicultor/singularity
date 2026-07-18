/**
 * Cascade edge-read attribution. Run with
 * `bun test plugins/framework/plugins/resource-runtime/core/runtime-cascade-attribution.test.ts`.
 *
 * A dependsOn edge's `signature`/`affectedMap` self-query the DB to translate the
 * changed upstream ids into downstream ids. That translation runs INSIDE the flush
 * cascade, after the origin's own load has resolved. This file pins that the
 * runtime now runs it under a `cascade` origin entry (`wrapOrigin("cascade",
 * downstreamKey, …)`), which is what routes those reads through the loader DB gate
 * (server: `loader-acquire`) and attributes them in the profiler — instead of
 * running unmeasured/ungated under the enclosing `flush`. See
 * research/2026-07-07-global-read-set-notifications-attribution-noise.md
 * (the "cascade reads are omitted from read-sets and bypass the loader DB gate" gap).
 *
 * A FULL cascade (upstream id-less contributor) runs NO edge query, so it must NOT
 * open a `cascade` entry — pinned here too.
 */

import { test, expect, describe } from "bun:test";
import { z } from "zod";
import { createHarness, tick } from "./test-support";
import type { ResourceRuntimeOptions } from "./runtime";

const rowsSchema = z.array(z.object({ id: z.string(), n: z.number() }));
const keyOf = (r: unknown) => (r as { id: string }).id;

// A harness whose injected `wrapOrigin` records every (kind, key) it wraps (and
// passes through to `fn`), plus an `up → down` scoped edge carrying BOTH a
// `signature` relevance gate and an `affectedMap` translation — the two DB-reading
// hooks that must run under the `cascade` entry.
function cascadeHarness() {
  const origins: Array<{ kind: string; key: string }> = [];
  const wrapOrigin: ResourceRuntimeOptions["wrapOrigin"] = (kind, key, fn) => {
    origins.push({ kind, key });
    return fn();
  };
  const h = createHarness({
    wrapOrigin,
    readSet: (k) => (k === "up" ? ["up_t"] : ["down_t"]),
  });

  const sigCalls: Array<string[]> = [];
  const mapCalls: Array<string[]> = [];
  const up = h.runtime.defineResource({
    key: "up",
    mode: "push",
    identityTable: "up_t",
    schema: z.number(),
    loader: async () => 1,
  });
  const downLoads: string[] = [];
  h.runtime.defineResource(
    { key: "down", schema: rowsSchema, keyed: { keyOf } },
    {
      identityTable: "down_t",
      dependsOn: [
        {
          resource: up,
          signature: (ids) => {
            sigCalls.push([...ids].sort());
            // Fresh signature per id → the relevance gate always passes it through.
            return new Map([...ids].map((id) => [id, `sig-${id}`]));
          },
          affectedMap: (relevant) => {
            mapCalls.push([...relevant].sort());
            return ["d"]; // downstream key touched
          },
        },
      ],
      loader: (_p, c) => {
        downLoads.push(c === undefined ? "FULL" : [...c.affectedIds].sort().join(","));
        return [{ id: "d", n: 1 }];
      },
    },
  );
  const cascadeOrigins = () => origins.filter((o) => o.kind === "cascade");
  return { h, origins, cascadeOrigins, sigCalls, mapCalls, downLoads };
}

describe("cascade edge-read attribution", () => {
  test("a scoped cascade runs its signature/affectedMap under a `cascade` origin entry keyed by the downstream", async () => {
    const { h, cascadeOrigins, sigCalls, mapCalls, downLoads } = cascadeHarness();
    await h.subscribe("up");
    await h.subscribe("down");
    sigCalls.length = 0;
    mapCalls.length = 0;
    downLoads.length = 0;

    // A scoped change to up_t: `up` recomputes and cascades scoped to `down`. The
    // edge's signature + affectedMap run under one `cascade` entry labelled "down".
    h.runtime.applyDbChange({ table: "up_t", op: "U", ids: ["u1"], origin: "up_t", identityBase: "up_t" });
    await tick();

    // Exactly one cascade entry, for the downstream key — the edge translation.
    expect(cascadeOrigins()).toEqual([{ kind: "cascade", key: "down" }]);
    // The DB-reading hooks actually ran inside it…
    expect(sigCalls).toEqual([["u1"]]);
    expect(mapCalls).toEqual([["u1"]]);
    // …and the translated scope reached the downstream loader.
    expect(downLoads).toEqual(["d"]);
  });

  test("a scoped cascade forwards the upstream sourceTx onto the downstream's frames; SKIP_EDGE drops it", async () => {
    // The mutation-ack attribution threads through the cascade: the downstream
    // recompute this edge triggers also reads post-commit, so its delta carries
    // the upstream change's ackTx. A relevance-gate SKIP_EDGE (nothing relevant
    // changed downstream) drops the claim with the cascade — vacuously
    // irrelevant, missing ack safe.
    const origins: Array<{ kind: string; key: string }> = [];
    const wrapOrigin: ResourceRuntimeOptions["wrapOrigin"] = (kind, key, fn) => {
      origins.push({ kind, key });
      return fn();
    };
    const h = createHarness({
      wrapOrigin,
      readSet: (k) => (k === "up" ? ["up_t"] : ["down_t"]),
    });
    const up = h.runtime.defineResource({
      key: "up",
      mode: "push",
      identityTable: "up_t",
      schema: z.number(),
      loader: async () => 1,
    });
    // A CONSTANT signature: the first change has no stored entry (passes), the
    // second compares equal → relevance empty → SKIP_EDGE.
    let n = 0;
    h.runtime.defineResource(
      { key: "down", schema: rowsSchema, keyed: { keyOf } },
      {
        identityTable: "down_t",
        dependsOn: [
          {
            resource: up,
            signature: (ids) => new Map([...ids].map((id) => [id, "constant"])),
            affectedMap: () => ["d"],
          },
        ],
        loader: () => [{ id: "d", n: ++n }],
      },
    );
    await h.subscribe("up");
    await h.subscribe("down");

    const feed = (xid: string) =>
      h.runtime.applyDbChange({
        table: "up_t",
        op: "U",
        ids: ["u1"],
        origin: "up_t",
        identityBase: "up_t",
        xid,
      });

    feed("42"); // fresh signature → cascades scoped; downstream delta carries the xid
    await tick();
    const downDeltas = () => h.pushesFor("down").filter((f) => f.kind === "delta");
    expect(downDeltas()).toHaveLength(1);
    expect((downDeltas()[0] as { ackTx?: string[] }).ackTx).toEqual(["42"]);

    feed("43"); // unchanged signature → SKIP_EDGE: no downstream frame, claim dropped
    await tick();
    expect(downDeltas()).toHaveLength(1);
  });

  test("a FULL cascade opens NO cascade entry (it runs no edge query)", async () => {
    const { h, cascadeOrigins, sigCalls, mapCalls, downLoads } = cascadeHarness();
    await h.subscribe("up");
    await h.subscribe("down");
    sigCalls.length = 0;
    mapCalls.length = 0;
    downLoads.length = 0;

    // An id-less (FULL) change to up_t: the cascade propagates everything without
    // consulting signature/affectedMap, so no `cascade` entry is opened.
    h.runtime.applyDbChange({ table: "up_t", op: "I", ids: null, origin: "up_t", identityBase: "up_t" });
    await tick();

    expect(cascadeOrigins()).toEqual([]);
    expect(sigCalls).toEqual([]);
    expect(mapCalls).toEqual([]);
    expect(downLoads).toEqual(["FULL"]); // downstream still recomputes, just FULL
  });
});
