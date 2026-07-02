/**
 * Unit tests for the PURE core of the eager-tier generator (`computeEagerTier`)
 * and the structural predicate (`isAppContent`), driven by synthetic inputs — no
 * filesystem. Covers: the structural rule, watched-slot pins, bootCritical pins,
 * the reachability throw, the dependsOn closure pulling a dep of an eager shell
 * out of deferral, and deterministic sorted output. Run with `bun test`.
 */

import { test, expect, describe } from "bun:test";
import { computeEagerTier, isAppContent } from "./eager-tier-gen";

describe("isAppContent", () => {
  test("app content = apps/plugins/<app>/plugins/<child> with child !== shell", () => {
    expect(isAppContent("apps/plugins/sonata/plugins/notation")).toBe(true);
    expect(isAppContent("apps/plugins/sonata/plugins/notation/plugins/x")).toBe(true);
  });

  test("shell subtree is NOT app content", () => {
    expect(isAppContent("apps/plugins/sonata/plugins/shell")).toBe(false);
    expect(isAppContent("apps/plugins/sonata/plugins/shell/plugins/x")).toBe(false);
  });

  test("app umbrella and non-apps plugins are NOT app content", () => {
    expect(isAppContent("apps/plugins/sonata")).toBe(false);
    expect(isAppContent("conversations")).toBe(false);
    expect(isAppContent("primitives/plugins/pane")).toBe(false);
  });
});

const noDeps = new Map<string, string[]>();

describe("computeEagerTier", () => {
  test("structural rule: non-app-content eager, plain app content defers", () => {
    const { deferred } = computeEagerTier({
      webEntryPaths: [
        "conversations",
        "apps/plugins/sonata/plugins/shell",
        "apps/plugins/sonata/plugins/notation",
      ],
      deps: noDeps,
      bootCriticalOwners: [],
      watchedSlotHits: [],
    });
    expect(deferred).toEqual(["apps/plugins/sonata/plugins/notation"]);
  });

  test("watched-slot hit pins an app-content plugin eager", () => {
    const { deferred, appContentPins } = computeEagerTier({
      webEntryPaths: [
        "apps/plugins/agent-manager/plugins/shell",
        "apps/plugins/agent-manager/plugins/worktree-switcher",
      ],
      deps: noDeps,
      bootCriticalOwners: [],
      watchedSlotHits: [
        { path: "apps/plugins/agent-manager/plugins/worktree-switcher", slot: "ActionBar.Item" },
      ],
    });
    expect(deferred).toEqual([]);
    expect(appContentPins).toEqual([
      {
        path: "apps/plugins/agent-manager/plugins/worktree-switcher",
        reason: "watched boot slot ActionBar.Item",
      },
    ]);
  });

  test("bootCritical descriptor pins its owning plugin eager", () => {
    const { deferred, appContentPins } = computeEagerTier({
      // A top-level (non-app-content) owner — eager anyway, but annotated nowhere
      // (only app-content pins are listed). Use an app-content owner to see a pin.
      webEntryPaths: ["apps/plugins/mail/plugins/sync"],
      deps: noDeps,
      bootCriticalOwners: [{ path: "apps/plugins/mail/plugins/sync", keys: ["mailSync"] }],
      watchedSlotHits: [],
    });
    expect(deferred).toEqual([]);
    expect(appContentPins).toEqual([
      {
        path: "apps/plugins/mail/plugins/sync",
        reason: "boot-critical descriptor (mailSync)",
      },
    ]);
  });

  test("reachability: a bootCritical owner with no web entry throws with the fix", () => {
    expect(() =>
      computeEagerTier({
        webEntryPaths: ["conversations"],
        deps: noDeps,
        bootCriticalOwners: [{ path: "tasks/plugins/tasks-core", keys: ["tasks", "attempts"] }],
        watchedSlotHits: [],
      }),
    ).toThrow(/tasks\/plugins\/tasks-core/);
  });

  test("closure: a dep of an eager shell is pulled out of deferral", () => {
    const { deferred, appContentPins } = computeEagerTier({
      webEntryPaths: [
        "apps/plugins/sonata/plugins/shell", // eager (structural)
        "apps/plugins/sonata/plugins/voicing", // app content, only reached via shell
        "apps/plugins/sonata/plugins/notation", // app content, unreferenced
      ],
      // shell imports voicing (forward edge shell → voicing).
      deps: new Map([
        ["apps/plugins/sonata/plugins/shell", ["apps/plugins/sonata/plugins/voicing"]],
      ]),
      bootCriticalOwners: [],
      watchedSlotHits: [],
    });
    expect(deferred).toEqual(["apps/plugins/sonata/plugins/notation"]);
    expect(appContentPins).toEqual([
      {
        path: "apps/plugins/sonata/plugins/voicing",
        reason: "dependency closure (imported by an eager plugin)",
      },
    ]);
  });

  test("deterministic: deferred + pins are sorted regardless of input order", () => {
    const { deferred, appContentPins } = computeEagerTier({
      webEntryPaths: [
        "apps/plugins/z/plugins/b",
        "apps/plugins/a/plugins/y",
        "apps/plugins/a/plugins/x",
      ],
      deps: noDeps,
      bootCriticalOwners: [{ path: "apps/plugins/a/plugins/x", keys: ["k"] }],
      watchedSlotHits: [{ path: "apps/plugins/a/plugins/y", slot: "Core.Root" }],
    });
    expect(deferred).toEqual(["apps/plugins/z/plugins/b"]);
    expect(appContentPins).toEqual([
      { path: "apps/plugins/a/plugins/x", reason: "boot-critical descriptor (k)" },
      { path: "apps/plugins/a/plugins/y", reason: "watched boot slot Core.Root" },
    ]);
  });
});
