import { describe, expect, test } from "bun:test";
import type { Check } from "@plugins/framework/plugins/tooling/core";
import { resolveCacheSignature } from "./cache-signature";

function check(cacheSignature?: Check["cacheSignature"]): Check {
  return {
    id: "some:check",
    description: "a check",
    run: () => Promise.resolve({ ok: true }),
    ...(cacheSignature ? { cacheSignature } : {}),
  };
}

describe("resolveCacheSignature", () => {
  test("no signature keys on the tree hash alone", async () => {
    expect(await resolveCacheSignature(check())).toBe("");
  });

  test("a sync and an async signature resolve to the same key", async () => {
    expect(await resolveCacheSignature(check(() => "v1"))).toBe("v1");
    expect(await resolveCacheSignature(check(async () => "v1"))).toBe("v1");
  });

  test("null opts out, sync or async", async () => {
    expect(await resolveCacheSignature(check(() => null))).toBeNull();
    expect(await resolveCacheSignature(check(async () => null))).toBeNull();
  });

  test("a throw or a rejection is uncached, not a failed run", async () => {
    const throws = check(() => {
      throw new Error("no git");
    });
    const rejects = check(() => Promise.reject(new Error("no git")));
    expect(await resolveCacheSignature(throws)).toBeNull();
    expect(await resolveCacheSignature(rejects)).toBeNull();
  });
});
