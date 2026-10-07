import { describe, expect, test } from "bun:test";
import type { AutomationSettings } from "../core";
import {
  includedSources,
  resolveAutomationSettings,
  withAutomationSettings,
  type SavedAutomationSettings,
} from "./settings";

const defaults: AutomationSettings = {
  enabled: true,
  autoPush: true,
  model: "opus",
  excludedSources: [],
};

const saved = (
  over: Partial<SavedAutomationSettings> = {},
): SavedAutomationSettings => ({
  automationId: "deps-upgrades",
  enabled: false,
  autoPush: false,
  model: "sonnet",
  excludedSources: ["uv"],
  ...over,
});

describe("resolveAutomationSettings", () => {
  test("no saved item → the declared defaults", () => {
    expect(resolveAutomationSettings([], "deps-upgrades", defaults)).toEqual(
      defaults,
    );
  });

  test("another automation's item does not apply", () => {
    expect(
      resolveAutomationSettings(
        [saved({ automationId: "other" })],
        "deps-upgrades",
        defaults,
      ),
    ).toEqual(defaults);
  });

  test("a saved item replaces the defaults as a whole", () => {
    expect(
      resolveAutomationSettings([saved()], "deps-upgrades", defaults),
    ).toEqual({
      enabled: false,
      autoPush: false,
      model: "sonnet",
      excludedSources: ["uv"],
    });
  });

  test("two items for one automation throw", () => {
    expect(() =>
      resolveAutomationSettings([saved(), saved()], "deps-upgrades", defaults),
    ).toThrow(/2 saved settings items for automation "deps-upgrades"/);
  });
});

describe("includedSources", () => {
  test("drops the excluded ids and keeps declaration order", () => {
    const sources = [
      { id: "mise", label: "mise" },
      { id: "uv", label: "uv" },
      { id: "bun", label: "bun" },
    ];
    expect(
      includedSources(sources, { ...defaults, excludedSources: ["uv"] }),
    ).toEqual([
      { id: "mise", label: "mise" },
      { id: "bun", label: "bun" },
    ]);
  });
});

describe("withAutomationSettings", () => {
  const next: AutomationSettings = {
    enabled: true,
    autoPush: false,
    model: "haiku",
    excludedSources: ["mise"],
  };

  test("no item yet → appended whole, keyed by the automation id", () => {
    const other = { id: "x", ...saved({ automationId: "other" }) };
    expect(withAutomationSettings([other], "deps-upgrades", next)).toEqual([
      other,
      { id: "deps-upgrades", automationId: "deps-upgrades", ...next },
    ]);
  });

  test("an existing item is replaced in place, keeping its id", () => {
    const mine = { id: "keep", ...saved() };
    const other = { id: "x", ...saved({ automationId: "other" }) };
    expect(
      withAutomationSettings([mine, other], "deps-upgrades", next),
    ).toEqual([{ id: "keep", automationId: "deps-upgrades", ...next }, other]);
  });

  test("two items for one automation → throws instead of picking one", () => {
    expect(() =>
      withAutomationSettings(
        [
          { id: "a", ...saved() },
          { id: "b", ...saved() },
        ],
        "deps-upgrades",
        next,
      ),
    ).toThrow(/2 saved settings items/);
  });
});
