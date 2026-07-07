/**
 * Conditional revalidation (ETag / 304) — the read-path invariant. Run with
 * `bun test plugins/framework/plugins/resource-runtime/core/runtime-revalidate.test.ts`.
 *
 * `revalidate` lets a resource answer "is what you already have still current?"
 * with a cheap content signature (an ETag) BEFORE running the full loader: on a
 * match the server replies `up-to-date` (WS) / `304` (HTTP) and the client keeps
 * its cached value. These suites pin both the happy path (hit / miss / stamp /
 * fail-safe) and — the load-bearing one — that the stamped ETag never reflects a
 * state NEWER than the value it accompanies.
 *
 * The ordering invariant (see `handleSub` / `handleResourceHttp`): the ETag is
 * computed BEFORE the value. Computed AFTER (the pre-fix bug, commit 55fb39beb),
 * a change landing between the value read and the etag read would ship a stale
 * value stamped with an already-current ETag; a later resubscribe would then be
 * answered `up-to-date`/`304` and keep the stale value forever — and for an
 * `invalidate`-mode resource (e.g. edited-files) nothing heals it, since an
 * invalidate push carries no value. The REGRESSION test below reproduces exactly
 * that race and asserts convergence to current server truth.
 */

import { test, expect, describe } from "bun:test";
import { createHash } from "node:crypto";
import { z } from "zod";
import { createHarness, controllable, tick, makeClientView } from "./test-support";
import type { RecordedFrame } from "./test-support";

// The runtime hashes every `revalidate` signature (`normalizeEtag`, SHA1) so the
// wire ETag is opaque and header-safe. Mirror it here to name the expected token.
const sig = (raw: string): string => createHash("sha1").update(raw).digest("hex");

const httpReq = (key: string, ifNoneMatch?: string): Request =>
  new Request(`http://localhost/api/resources/${key}`, {
    headers: ifNoneMatch !== undefined ? { "If-None-Match": ifNoneMatch } : {},
  });

describe("conditional revalidation — read path (ETag / 304)", () => {
  test("up-to-date hit (WS): a matching client etag short-circuits — no loader run, client keeps its cached value", async () => {
    const h = createHarness();
    let loads = 0;
    h.runtime.defineExternalResource({
      key: "r",
      mode: "invalidate",
      schema: z.string(),
      loader: async () => {
        loads++;
        return "val";
      },
      revalidate: async () => "sig-1",
    });

    // Fresh sub (no etag) primes the client with value + the current signature.
    await h.subscribe("r");
    const firstAck = h.frames.find((f) => f.kind === "sub-ack")!;
    expect(firstAck.value).toBe("val");
    expect(firstAck.etag).toBe(sig("sig-1"));
    expect(loads).toBe(1);

    // Resub on the SAME socket with the matching etag → `up-to-date`, no loader.
    await h.subscribe("r", {}, { etag: firstAck.etag });
    const utd = h.frames.find((f) => f.kind === "up-to-date");
    expect(utd).toBeDefined();
    expect("value" in utd!).toBe(false); // an up-to-date frame carries no value
    expect(loads).toBe(1); // loader did NOT run again

    // The real client, fed both frames, still holds the cached value.
    const cv = makeClientView();
    cv.applyAll(h.framesFor(0));
    expect(cv.value).toBe("val");
  });

  test("etag miss (WS): a stale client etag runs the loader and re-stamps a fresh etag", async () => {
    const h = createHarness();
    let loads = 0;
    h.runtime.defineExternalResource({
      key: "r",
      mode: "invalidate",
      schema: z.string(),
      loader: async () => {
        loads++;
        return "val";
      },
      revalidate: async () => "sig-2",
    });

    await h.subscribe("r", {}, { etag: "stale-etag" });
    const ack = h.frames.find((f) => f.kind === "sub-ack")!;
    expect(ack.value).toBe("val");
    expect(ack.etag).toBe(sig("sig-2"));
    expect(ack.etag).not.toBe("stale-etag");
    expect(loads).toBe(1);
    expect(h.frames.some((f) => f.kind === "up-to-date")).toBe(false);
  });

  test("fresh sub, no etag (WS): the sub-ack carries value + a fresh etag", async () => {
    const h = createHarness();
    h.runtime.defineExternalResource({
      key: "r",
      mode: "invalidate",
      schema: z.string(),
      loader: async () => "val",
      revalidate: async () => "sig",
    });

    await h.subscribe("r");
    const ack = h.frames.find((f) => f.kind === "sub-ack")!;
    expect(ack.value).toBe("val");
    expect("etag" in ack).toBe(true);
    expect(ack.etag).toBe(sig("sig"));
  });

  test("REGRESSION — value/etag skew: the stamped ETag never reflects a state newer than the value it accompanies", async () => {
    // The reported bug. A resource whose value load starts before a change lands
    // but whose ETag is computed after: the sub-ack ships a STALE value stamped
    // with an ALREADY-CURRENT etag, and a later resubscribe is then answered
    // `up-to-date` and keeps the stale value forever (invalidate mode carries no
    // healing value on a push).
    //
    // Model: `gitState` is the cheap etag signal; the loader is a `controllable()`
    // whose in-flight load reflects the PRE-change snapshot ("v1"). During the
    // parked load, a change lands (gitState 1→2) — the etag signal advances but the
    // in-flight value does not. After it releases, the loader would (on a re-run)
    // see the post-change truth ("v2").
    //
    // With the FIX (etag BEFORE value): the sub-ack stamps etag "1" — no newer
    // than the value's state 1 — so a resub with "1" mismatches the now-current
    // "2", forces a real load, and converges to "v2".
    // With the pre-fix ordering (etag AFTER value): the sub-ack would stamp etag
    // "2" against the stale "v1"; the resub with "2" would match and be answered
    // `up-to-date`, pinning "v1" forever — this test would then FAIL at the final
    // convergence assert.
    const h = createHarness({ sockets: 2 });
    let gitState = 1;
    const ctl = controllable("v1"); // the in-flight load returns the pre-change snapshot
    h.runtime.defineExternalResource({
      key: "edited",
      mode: "invalidate",
      schema: z.string(),
      loader: ctl.loader,
      revalidate: async () => String(gitState),
    });

    // Subscribe with the loader parked. In the fixed path the etag ("1") is
    // captured here, BEFORE the value and BEFORE the change below.
    ctl.block();
    await h.subscribe("edited", {}, { socket: 0 });
    expect(h.frames).toHaveLength(0); // nothing sent — parked on the loader

    gitState = 2; // a change lands DURING the load (the etag signal advances)
    ctl.release();
    await tick(); // loader resumes → returns the pre-change "v1"; sub-ack is sent
    ctl.setValue("v2"); // a re-run of the loader would now see the post-change truth

    const ack = h.frames.find((f) => f.socket === 0 && f.kind === "sub-ack")!;
    expect(ack.value).toBe("v1"); // the pre-change snapshot (an unavoidable load race)
    // The load-bearing assertion: the etag reflects state 1 (the value's state),
    // NOT the post-change state 2. Computed-after-value, this would be sig("2").
    expect(ack.etag).toBe(sig("1"));

    // Post-restart resubscribe with the stored etag on a fresh socket. The server
    // must NOT answer `up-to-date` (which would pin the stale "v1"); it re-loads
    // and converges the client to current truth "v2".
    await h.subscribe("edited", {}, { socket: 1, etag: ack.etag });
    const resub = h.frames.find(
      (f) => f.socket === 1 && (f.kind === "sub-ack" || f.kind === "up-to-date"),
    )!;
    expect(resub.kind).toBe("sub-ack"); // re-load, NOT an up-to-date short-circuit
    expect(resub.value).toBe("v2"); // converged to current server truth
    expect(resub.etag).toBe(sig("2")); // and re-stamped with the now-current signature
  });

  test("HTTP 304 path: matching If-None-Match → 304 (empty body, no loader); mismatch/absent → 200 + ETag", async () => {
    const h = createHarness();
    let loads = 0;
    h.runtime.defineExternalResource({
      key: "r",
      mode: "invalidate",
      schema: z.string(),
      loader: async () => {
        loads++;
        return "val";
      },
      revalidate: async () => "sig",
    });

    // Matching If-None-Match → 304, empty body, loader NOT run.
    const res304 = await h.runtime.handleResourceHttp(httpReq("r", sig("sig")), { key: "r" });
    expect(res304.status).toBe(304);
    expect(await res304.text()).toBe("");
    expect(loads).toBe(0);

    // Absent If-None-Match → 200 with {value,version} and a fresh ETag header.
    const res200 = await h.runtime.handleResourceHttp(httpReq("r"), { key: "r" });
    expect(res200.status).toBe(200);
    expect(res200.headers.get("ETag")).toBe(sig("sig"));
    const body = (await res200.json()) as { value: unknown; version: number };
    expect(body.value).toBe("val");
    expect(body.version).toBe(0);
    expect(loads).toBe(1);

    // Mismatching If-None-Match → 200 (a real body), not 304.
    const resMiss = await h.runtime.handleResourceHttp(httpReq("r", sig("stale")), { key: "r" });
    expect(resMiss.status).toBe(200);
    expect(resMiss.headers.get("ETag")).toBe(sig("sig"));
    expect(loads).toBe(2);
  });

  test("revalidate throws → fail-safe: value still delivered, NO etag stamped, never 304 / up-to-date", async () => {
    // computeEtag catches a throwing signature and returns undefined; the read
    // path then degrades to the plain full-loader behavior and never serves a
    // conditional short-circuit. (The runtime's own console.error fires here.)
    const h = createHarness();
    let loads = 0;
    h.runtime.defineExternalResource({
      key: "r",
      mode: "invalidate",
      schema: z.string(),
      loader: async () => {
        loads++;
        return "val";
      },
      revalidate: async () => {
        throw new Error("signature boom");
      },
    });

    // WS: even with a client etag, the throw means no up-to-date — a full sub-ack
    // with value and NO etag.
    await h.subscribe("r", {}, { etag: "anything" });
    const ack = h.frames.find((f) => f.kind === "sub-ack")!;
    expect(ack.value).toBe("val");
    expect("etag" in ack).toBe(false);
    expect(h.frames.some((f) => f.kind === "up-to-date")).toBe(false);
    expect(loads).toBe(1);

    // HTTP: an If-None-Match cannot 304 through a broken signature; 200 with the
    // value and NO ETag response header.
    const res = await h.runtime.handleResourceHttp(httpReq("r", "anything"), { key: "r" });
    expect(res.status).toBe(200);
    expect(res.headers.get("ETag")).toBeNull();
    const body = (await res.json()) as { value: unknown; version: number };
    expect(body.value).toBe("val");
    expect(loads).toBe(2);
  });

  test("version adoption after up-to-date: a later higher-version frame applies; equal/lower is dropped", () => {
    // The client-guard contract the server's up-to-date frames lean on: an
    // up-to-date adopts the reported version while KEEPING the cached value, so a
    // subsequent genuine update/invalidate at a strictly-higher version still
    // applies (never stale-dropped), and an equal-or-lower one is dropped by the
    // WS version guard (`frame.version > version`). Driven through the real client
    // simulator so it mirrors `notifications-client.ts`.
    const cv = makeClientView();
    const frame = (over: Partial<RecordedFrame>): RecordedFrame =>
      ({ seq: 0, socket: 0, key: "r", ...over }) as RecordedFrame;

    cv.apply(frame({ kind: "sub-ack", value: "v0", version: 5 }));
    expect(cv.value).toBe("v0");
    expect(cv.version).toBe(5);

    // up-to-date at a HIGHER version (a restart advanced the server counter):
    // adopt the version, keep the cached value.
    cv.apply(frame({ kind: "up-to-date", version: 7 }));
    expect(cv.version).toBe(7);
    expect(cv.value).toBe("v0");

    // A genuine higher-version update applies — not stale-dropped by the adopted 7.
    cv.apply(frame({ kind: "update", value: "v1", version: 8 }));
    expect(cv.version).toBe(8);
    expect(cv.value).toBe("v1");

    // An equal-version update is dropped by the guard (8 is not > 8).
    cv.apply(frame({ kind: "update", value: "vX", version: 8 }));
    expect(cv.version).toBe(8);
    expect(cv.value).toBe("v1");

    // A lower-version invalidate is dropped — no stale flag, no version regression.
    cv.apply(frame({ kind: "invalidate", version: 2 }));
    expect(cv.version).toBe(8);
    expect(cv.value).toBe("v1");
    expect(cv.stale).toBe(false);
  });
});
