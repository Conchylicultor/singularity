import { describe, expect, it } from "bun:test";
import type { StyleKey } from "@plugins/ui/plugins/icons/core";
import {
  MAX_NAMES_PER_FETCH,
  createRuntimeSymbolLoader,
} from "./runtime-symbol-loader";

const K: StyleKey = "default-outline-400";
const R: StyleKey = "rounded-outline-400";

function harness(fail = false) {
  const fetches: { styleKey: StyleKey; names: readonly string[] }[] = [];
  const loaded: string[] = [];
  const errors: Error[] = [];
  let pending: (() => void) | null = null;
  const loader = createRuntimeSymbolLoader({
    fetchSymbols: (styleKey, names) => {
      fetches.push({ styleKey, names });
      return fail
        ? Promise.reject(new Error("boom"))
        : Promise.resolve(`<svg>${names.join(",")}</svg>`);
    },
    schedule: (flush) => {
      expect(pending).toBeNull();
      pending = flush;
    },
    onLoaded: (chunkId) => loaded.push(chunkId),
    onError: (err) => errors.push(err),
  });
  const frame = async () => {
    const f = pending;
    pending = null;
    f?.();
    await Promise.resolve();
    await Promise.resolve();
  };
  return { loader, fetches, loaded, errors, frame };
}

describe("createRuntimeSymbolLoader", () => {
  it("batches every want of a frame into one sorted fetch per style key", async () => {
    const h = harness();
    h.loader.request({ styleKey: K, name: "rocket" });
    h.loader.request({ styleKey: K, name: "home" });
    h.loader.request({ styleKey: R, name: "home" });
    await h.frame();
    expect(h.fetches).toEqual([
      { styleKey: K, names: ["home", "rocket"] },
      { styleKey: R, names: ["home"] },
    ]);
    expect(h.loaded).toHaveLength(2);
  });

  it("dedupes within a batch and never re-requests an in-flight or landed name", async () => {
    const h = harness();
    h.loader.request({ styleKey: K, name: "home" });
    h.loader.request({ styleKey: K, name: "home" });
    await h.frame();
    h.loader.request({ styleKey: K, name: "home" });
    await h.frame();
    expect(h.fetches).toEqual([{ styleKey: K, names: ["home"] }]);
  });

  it("splits a batch past the route's cap", async () => {
    const h = harness();
    for (let i = 0; i < MAX_NAMES_PER_FETCH + 5; i++) {
      h.loader.request({ styleKey: K, name: `n${String(i).padStart(4, "0")}` });
    }
    await h.frame();
    expect(h.fetches.map((f) => f.names.length)).toEqual([
      MAX_NAMES_PER_FETCH,
      5,
    ]);
  });

  it("reports a failed batch and lets a later want retry it", async () => {
    const h = harness(true);
    h.loader.request({ styleKey: K, name: "home" });
    await h.frame();
    expect(h.errors.map((e) => e.message)).toEqual(["boom"]);
    h.loader.request({ styleKey: K, name: "home" });
    await h.frame();
    expect(h.fetches).toHaveLength(2);
  });
});
