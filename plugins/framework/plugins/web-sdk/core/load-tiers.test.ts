import { describe, expect, test } from "bun:test";
import {
  DEFERRABLE_APPS,
  EAGER_EXCEPTIONS,
  isDeferredPluginPath,
  partitionWebEntries,
} from "./load-tiers";

describe("isDeferredPluginPath", () => {
  test("top-level plugin is eager", () => {
    expect(isDeferredPluginPath("conversations")).toBe(false);
  });

  test("non-apps nested plugin is eager", () => {
    expect(isDeferredPluginPath("primitives/plugins/pane")).toBe(false);
  });

  test("deferrable-app content is deferred", () => {
    expect(isDeferredPluginPath("apps/plugins/workflows/plugins/board")).toBe(true);
    expect(isDeferredPluginPath("apps/plugins/story/plugins/lens")).toBe(true);
  });

  test("a deferrable app's shell subtree is eager", () => {
    expect(isDeferredPluginPath("apps/plugins/workflows/plugins/shell")).toBe(false);
    expect(isDeferredPluginPath("apps/plugins/workflows/plugins/shell/plugins/x")).toBe(false);
  });

  test("non-allowlisted app content stays eager (sonata / studio excluded)", () => {
    expect(DEFERRABLE_APPS.has("sonata")).toBe(false);
    expect(DEFERRABLE_APPS.has("studio")).toBe(false);
    expect(isDeferredPluginPath("apps/plugins/sonata/plugins/notation")).toBe(false);
    expect(isDeferredPluginPath("apps/plugins/studio/plugins/release")).toBe(false);
  });

  test("default app (agent-manager) content stays eager", () => {
    expect(DEFERRABLE_APPS.has("agent-manager")).toBe(false);
    expect(isDeferredPluginPath("apps/plugins/agent-manager/plugins/welcome")).toBe(false);
  });

  test("EAGER_EXCEPTIONS override deferrable-app content back to eager", () => {
    expect(EAGER_EXCEPTIONS.has("apps/plugins/mail/plugins/sync/plugins/auto-resume")).toBe(true);
    expect(isDeferredPluginPath("apps/plugins/mail/plugins/sync/plugins/auto-resume")).toBe(false);
  });

  test("non-exception deferrable-app content still defers (mail child = sync)", () => {
    expect(isDeferredPluginPath("apps/plugins/mail/plugins/sync")).toBe(true);
  });
});

describe("partitionWebEntries", () => {
  const entries = [
    { pluginPath: "conversations" },
    { pluginPath: "apps/plugins/sonata/plugins/notation" }, // not allowlisted → eager
    { pluginPath: "apps/plugins/workflows/plugins/board" }, // allowlisted content → deferred
    { pluginPath: "apps/plugins/workflows/plugins/shell" }, // shell → eager
    { pluginPath: "apps/plugins/mail/plugins/sync/plugins/auto-resume" }, // exception → eager
    { pluginPath: "apps/plugins/mail/plugins/sync" }, // deferred
    { pluginPath: "primitives/plugins/pane" },
  ];

  test("covers all entries (eager + deferred === input)", () => {
    const { eager, deferred } = partitionWebEntries(entries);
    expect(eager.length + deferred.length).toBe(entries.length);
  });

  test("preserves input order within each tier", () => {
    const { eager, deferred } = partitionWebEntries(entries);
    expect(eager.map((e) => e.pluginPath)).toEqual([
      "conversations",
      "apps/plugins/sonata/plugins/notation",
      "apps/plugins/workflows/plugins/shell",
      "apps/plugins/mail/plugins/sync/plugins/auto-resume",
      "primitives/plugins/pane",
    ]);
    expect(deferred.map((e) => e.pluginPath)).toEqual([
      "apps/plugins/workflows/plugins/board",
      "apps/plugins/mail/plugins/sync",
    ]);
  });
});
