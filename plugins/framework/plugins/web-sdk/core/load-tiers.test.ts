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

  test("non-allowlisted app content stays eager (studio excluded)", () => {
    expect(DEFERRABLE_APPS.has("studio")).toBe(false);
    expect(isDeferredPluginPath("apps/plugins/studio/plugins/release")).toBe(false);
  });

  test("sonata is deferrable; its content defers except the pinned voicing leaf", () => {
    expect(DEFERRABLE_APPS.has("sonata")).toBe(true);
    // Ordinary sonata content defers.
    expect(isDeferredPluginPath("apps/plugins/sonata/plugins/notation")).toBe(true);
    expect(isDeferredPluginPath("apps/plugins/sonata/plugins/piano-roll")).toBe(true);
    // The shell subtree stays eager (rail icon + SonataProvider).
    expect(isDeferredPluginPath("apps/plugins/sonata/plugins/shell")).toBe(false);
    // `voicing` is pinned eager — the eager SonataProvider reads voicingConfig at mount.
    expect(EAGER_EXCEPTIONS.has("apps/plugins/sonata/plugins/voicing")).toBe(true);
    expect(isDeferredPluginPath("apps/plugins/sonata/plugins/voicing")).toBe(false);
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
    { pluginPath: "apps/plugins/studio/plugins/release" }, // not allowlisted → eager
    { pluginPath: "apps/plugins/sonata/plugins/voicing" }, // pinned exception → eager
    { pluginPath: "apps/plugins/sonata/plugins/notation" }, // allowlisted content → deferred
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
      "apps/plugins/studio/plugins/release",
      "apps/plugins/sonata/plugins/voicing",
      "apps/plugins/workflows/plugins/shell",
      "apps/plugins/mail/plugins/sync/plugins/auto-resume",
      "primitives/plugins/pane",
    ]);
    expect(deferred.map((e) => e.pluginPath)).toEqual([
      "apps/plugins/sonata/plugins/notation",
      "apps/plugins/workflows/plugins/board",
      "apps/plugins/mail/plugins/sync",
    ]);
  });
});
