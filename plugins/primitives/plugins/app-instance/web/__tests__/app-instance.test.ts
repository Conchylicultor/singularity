import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getTabId } from "@plugins/primitives/plugins/tab-id/web";
import {
  appInstanceKey,
  getAppInstanceId,
  getNavigationType,
  isFreshAppInstance,
  legacyInstanceKey,
  mayAdoptLegacyPayload,
  readAppInstance,
  resetAppInstanceForTests,
  RETAINED_INSTANCES,
  stampAppInstance,
  type NavigationType,
} from "../index";

/** Minimal in-memory Storage — jsdom's sessionStorage under vitest is inert. */
class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  clear() {
    this.store.clear();
  }
  getItem(k: string) {
    return this.store.has(k) ? this.store.get(k)! : null;
  }
  key(i: number) {
    return [...this.store.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.store.delete(k);
  }
  setItem(k: string, v: string) {
    this.store.set(k, String(v));
  }
}

/** Stub the ONE navigation-timing read; `null` means "no entry" (jsdom). */
function setNavigationType(type: NavigationType | null): void {
  vi.spyOn(performance, "getEntriesByType").mockReturnValue(
    type === null ? [] : [{ type } as PerformanceNavigationTiming],
  );
}

/** Seed the LRU registry for this browser tab, most-recently-active last. */
function seedRegistry(...generations: string[]): void {
  sessionStorage.setItem(
    `singularity.appInstances:${getTabId()}`,
    JSON.stringify(generations),
  );
}

function readRegistry(): string[] {
  const raw = sessionStorage.getItem(`singularity.appInstances:${getTabId()}`);
  return raw === null ? [] : (JSON.parse(raw) as string[]);
}

beforeEach(() => {
  const mem = new MemoryStorage();
  Object.defineProperty(window, "sessionStorage", { value: mem, configurable: true });
  Object.defineProperty(globalThis, "sessionStorage", { value: mem, configurable: true });
  window.history.replaceState(null, "");
  resetAppInstanceForTests();
});

afterEach(() => {
  resetAppInstanceForTests();
  vi.restoreAllMocks();
});

describe("getNavigationType", () => {
  it("reports the navigation entry's type", () => {
    setNavigationType("back_forward");
    expect(getNavigationType()).toBe("back_forward");
  });

  it("reports null — an honest absence — when there is no navigation entry", () => {
    setNavigationType(null);
    expect(getNavigationType()).toBeNull();
  });
});

describe("getAppInstanceId — the decision table", () => {
  it("navigate ⇒ mints a fresh generation, ignoring both the entry and the registry", () => {
    setNavigationType("navigate");
    seedRegistry("gen-old");
    window.history.replaceState({ appInstance: "gen-entry" }, "");

    const id = getAppInstanceId();

    expect(id).not.toBe("gen-entry");
    expect(id).not.toBe("gen-old");
    expect(readRegistry()).toEqual(["gen-old", id]);
  });

  it("prerender ⇒ mints a fresh generation", () => {
    setNavigationType("prerender");
    seedRegistry("gen-old");
    window.history.replaceState({ appInstance: "gen-entry" }, "");

    expect(getAppInstanceId()).not.toBe("gen-entry");
  });

  it("reload + a stamped entry ⇒ adopts the entry's generation", () => {
    setNavigationType("reload");
    seedRegistry("gen-other");
    window.history.replaceState({ appInstance: "gen-entry" }, "");

    expect(getAppInstanceId()).toBe("gen-entry");
    // Adoption promotes it to the tail of the LRU.
    expect(readRegistry()).toEqual(["gen-other", "gen-entry"]);
  });

  it("back_forward + a stamped entry ⇒ adopts the entry's generation", () => {
    setNavigationType("back_forward");
    seedRegistry("gen-a", "gen-b");
    window.history.replaceState({ appInstance: "gen-a" }, "");

    expect(getAppInstanceId()).toBe("gen-a");
    // Promoted from head to tail, not duplicated.
    expect(readRegistry()).toEqual(["gen-b", "gen-a"]);
  });

  // THE headline regression: a gen-only design would mint here and silently
  // destroy every tab the user had. `apps-layout`'s redirect really does leave
  // `{}` behind, so this row is routine.
  it("reload + a `{}` entry ⇒ adopts the last-active generation, NOT a fresh mint", () => {
    setNavigationType("reload");
    seedRegistry("gen-older", "gen-last");
    window.history.replaceState({}, "");

    expect(getAppInstanceId()).toBe("gen-last");
    expect(readRegistry()).toEqual(["gen-older", "gen-last"]);
  });

  it("back_forward + an unstamped entry ⇒ adopts the last-active generation", () => {
    setNavigationType("back_forward");
    seedRegistry("gen-last");
    window.history.replaceState(null, "");

    expect(getAppInstanceId()).toBe("gen-last");
  });

  it("reload + no entry + an empty registry ⇒ mints (nothing to adopt)", () => {
    setNavigationType("reload");
    window.history.replaceState({}, "");

    const id = getAppInstanceId();

    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(readRegistry()).toEqual([id]);
  });

  it("an unavailable navigation type behaves exactly as reload — unknown never destroys", () => {
    setNavigationType(null);
    seedRegistry("gen-last");
    window.history.replaceState({}, "");

    expect(getAppInstanceId()).toBe("gen-last");
  });

  it("an unavailable navigation type still prefers the entry's own stamp", () => {
    setNavigationType(null);
    seedRegistry("gen-last");
    window.history.replaceState({ appInstance: "gen-entry" }, "");

    expect(getAppInstanceId()).toBe("gen-entry");
  });
});

describe("getAppInstanceId — memoization", () => {
  it("is idempotent under the StrictMode double-invoke: one id, one registry entry", () => {
    setNavigationType("navigate");

    const first = getAppInstanceId();
    const second = getAppInstanceId();

    expect(second).toBe(first);
    expect(readRegistry()).toEqual([first]);
  });
});

describe("isFreshAppInstance", () => {
  it("is true for a minted generation", () => {
    setNavigationType("navigate");
    seedRegistry("gen-old");

    expect(isFreshAppInstance()).toBe(true);
  });

  it("is false for an adopted generation", () => {
    setNavigationType("reload");
    window.history.replaceState({ appInstance: "gen-entry" }, "");

    expect(isFreshAppInstance()).toBe(false);
  });

  it("is false when the last-active generation is adopted off the registry", () => {
    setNavigationType("reload");
    seedRegistry("gen-last");
    window.history.replaceState({}, "");

    expect(isFreshAppInstance()).toBe(false);
  });

  // The outcome, not the nav type: a preserving load with nothing to adopt
  // still mints, and that is a fresh instance for every consumer's purposes —
  // notably the legacy-key migration, which must not restore a pre-deploy blob
  // onto a generation that legitimately has no payload.
  it("is true when a preserving load mints because the registry is empty", () => {
    setNavigationType("reload");
    window.history.replaceState({}, "");

    expect(isFreshAppInstance()).toBe(true);
  });

  it("resolves the generation itself, so call order does not matter", () => {
    setNavigationType("navigate");

    // Read the freshness flag BEFORE anyone has asked for the id.
    expect(isFreshAppInstance()).toBe(true);
    expect(getAppInstanceId()).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("survives repeated getAppInstanceId() calls and resets between tests", () => {
    setNavigationType("reload");
    window.history.replaceState({ appInstance: "gen-entry" }, "");

    getAppInstanceId();
    getAppInstanceId();
    expect(isFreshAppInstance()).toBe(false);

    // A reset drops the memo; the next resolve decides afresh.
    resetAppInstanceForTests();
    setNavigationType("navigate");
    expect(isFreshAppInstance()).toBe(true);
  });
});

describe("mayAdoptLegacyPayload", () => {
  it("an adopted generation may inherit — a preserving load continuing an instance", () => {
    setNavigationType("reload");
    window.history.replaceState({ appInstance: "gen-entry" }, "");

    expect(mayAdoptLegacyPayload()).toBe(true);
  });

  // THE migration case, and the reason `!isFreshAppInstance()` is the wrong
  // gate: a session that predates generations has no stamp on its entry AND an
  // empty registry, so it necessarily MINTS. Gating on freshness alone would
  // make the migration unreachable and reset every live session on its Cmd-R.
  it("a mint from a preserving load may inherit — this IS the migration", () => {
    setNavigationType("reload");
    window.history.replaceState({}, "");

    expect(isFreshAppInstance()).toBe(true);
    expect(mayAdoptLegacyPayload()).toBe(true);
  });

  it("back_forward minting on an empty registry may inherit", () => {
    setNavigationType("back_forward");
    window.history.replaceState(null, "");

    expect(mayAdoptLegacyPayload()).toBe(true);
  });

  it("an unavailable nav type on a mint may inherit — `null` counts as preserving", () => {
    setNavigationType(null);
    window.history.replaceState({}, "");

    expect(isFreshAppInstance()).toBe(true);
    expect(mayAdoptLegacyPayload()).toBe(true);
  });

  it("a mint from `navigate` may NOT inherit — a bookmark must restore nothing", () => {
    setNavigationType("navigate");

    expect(mayAdoptLegacyPayload()).toBe(false);
  });

  it("a mint from `prerender` may NOT inherit", () => {
    setNavigationType("prerender");

    expect(mayAdoptLegacyPayload()).toBe(false);
  });

  // A `navigate` never adopts, so this can't arise via the resolver — but the
  // predicate must not become order-dependent if it ever did.
  it("navigate with a stamped entry still may NOT inherit (it minted)", () => {
    setNavigationType("navigate");
    seedRegistry("gen-old");
    window.history.replaceState({ appInstance: "gen-entry" }, "");

    expect(mayAdoptLegacyPayload()).toBe(false);
  });
});

describe("eviction", () => {
  it(`retains ${RETAINED_INSTANCES} generations, sweeps evicted payload keys, and spares the tab id + legacy keys`, () => {
    const tabId = getTabId();
    sessionStorage.setItem(`app-tabs:${tabId}`, "legacy-payload");
    setNavigationType("navigate");

    const generations: string[] = [];
    for (let i = 0; i < RETAINED_INSTANCES + 2; i++) {
      resetAppInstanceForTests();
      const id = getAppInstanceId();
      generations.push(id);
      sessionStorage.setItem(`foo:${tabId}:${id}`, "payload");
    }

    const retained = generations.slice(-RETAINED_INSTANCES);
    expect(readRegistry()).toEqual(retained);

    // The two head generations fell off — their payload keys are gone.
    expect(sessionStorage.getItem(`foo:${tabId}:${generations[0]!}`)).toBeNull();
    expect(sessionStorage.getItem(`foo:${tabId}:${generations[1]!}`)).toBeNull();
    // Every retained generation's payload survives.
    for (const id of retained) {
      expect(sessionStorage.getItem(`foo:${tabId}:${id}`)).toBe("payload");
    }

    // The sweep pattern pins `<tabId>` to position 2, so neither the colon-less
    // tab id nor a 2-segment legacy key can ever match.
    expect(sessionStorage.getItem("singularity.tabId")).toBe(tabId);
    expect(sessionStorage.getItem(`app-tabs:${tabId}`)).toBe("legacy-payload");
  });
});

describe("key grammar", () => {
  it("appInstanceKey is prefix : tabId : generation", () => {
    setNavigationType("reload");
    seedRegistry("gen-1");

    expect(appInstanceKey("app-tabs")).toBe(`app-tabs:${getTabId()}:gen-1`);
  });

  it("legacyInstanceKey is the 2-segment prefix : tabId", () => {
    expect(legacyInstanceKey("app-windows")).toBe(`app-windows:${getTabId()}`);
  });
});

describe("stampAppInstance / readAppInstance", () => {
  it("round-trips through a history-entry snapshot, preserving the other fields", () => {
    setNavigationType("reload");
    seedRegistry("gen-1");

    const stamped = stampAppInstance({ tabId: "t1", appId: "pages" });

    expect(stamped).toEqual({ tabId: "t1", appId: "pages", appInstance: "gen-1" });
    expect(readAppInstance(stamped)).toBe("gen-1");
  });

  it("reads undefined off a state that names no instance", () => {
    expect(readAppInstance(null)).toBeUndefined();
    expect(readAppInstance(undefined)).toBeUndefined();
    expect(readAppInstance({})).toBeUndefined();
    expect(readAppInstance("gen-1")).toBeUndefined();
    expect(readAppInstance(42)).toBeUndefined();
    expect(readAppInstance({ appInstance: "" })).toBeUndefined();
    expect(readAppInstance({ appInstance: 7 })).toBeUndefined();
  });
});
