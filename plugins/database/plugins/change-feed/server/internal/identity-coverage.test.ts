import { describe, expect, test } from "bun:test";
import {
  assertScopePoliciesCovered,
  findUncoveredScopePolicies,
  formatUncoveredScopeError,
  type ScopedResourceIdentity,
  type ScopePolicyViolation,
} from "./identity-coverage";

const scoped = (
  ...pairs: Array<[key: string, identityTable: string]>
): ScopedResourceIdentity[] =>
  pairs.map(([key, identityTable]) => ({ key, identityTable }));

// Convenience: the four-arg call with empty exclusion/exempt sets (so every
// violation classifies as "uncovered") unless a test overrides them.
const findUncovered = (
  resources: ScopedResourceIdentity[],
  covered: Iterable<string>,
  excluded: Iterable<string> = [],
  exempt: Iterable<string> = [],
): ScopePolicyViolation[] =>
  findUncoveredScopePolicies(
    resources,
    new Set(covered),
    new Set(excluded),
    new Set(exempt),
  );

describe("findUncoveredScopePolicies", () => {
  test("no scoped resources → no violation", () => {
    expect(findUncovered([], ["notifications"])).toEqual([]);
  });

  test("scoped resource on a triggered (covered) table → no violation", () => {
    const resources = scoped(["notifications", "notifications_table"]);
    expect(findUncovered(resources, ["notifications_table"])).toEqual([]);
  });

  test("every identity table covered → no violation for many resources", () => {
    const resources = scoped(["a", "tasks"], ["b", "attempts"]);
    expect(findUncovered(resources, ["tasks", "attempts"])).toEqual([]);
  });

  test("excluded table (uncovered) → flagged with reason 'excluded'", () => {
    const resources = scoped(["reportsResource", "reports"]);
    expect(
      findUncovered(resources, /* covered */ [], /* excluded */ ["reports"]),
    ).toEqual([{ key: "reportsResource", identityTable: "reports", reason: "excluded" }]);
  });

  test("rollup table (uncovered, feed-exempt) → flagged with reason 'rollup'", () => {
    const resources = scoped(["r", "task_latest_conversation"]);
    expect(
      findUncovered(resources, [], [], /* exempt */ ["task_latest_conversation"]),
    ).toEqual([
      { key: "r", identityTable: "task_latest_conversation", reason: "rollup" },
    ]);
  });

  test("typo / view / dropped table (uncovered, unknown) → reason 'uncovered'", () => {
    const resources = scoped(["v", "tasks_view"]);
    // Covered set holds the real base table, not the view name the resource used.
    expect(findUncovered(resources, ["tasks"])).toEqual([
      { key: "v", identityTable: "tasks_view", reason: "uncovered" },
    ]);
  });

  test("coverage is the sole membership test — a covered table is never flagged, even if also listed as excluded", () => {
    // Defensive: exclusion/exempt sets only classify; they never add a violation
    // for a table that DID get a trigger.
    const resources = scoped(["ok", "tasks"]);
    expect(findUncovered(resources, ["tasks"], ["tasks"], ["tasks"])).toEqual([]);
  });

  test("mixed set → each uncovered resource classified, covered ones dropped", () => {
    const resources = scoped(
      ["good1", "browser_bookmarks"],
      ["bad-excluded", "reports"],
      ["good2", "story_generated_units"],
      ["bad-rollup", "task_latest_conversation"],
      ["bad-typo", "taskz"],
    );
    const covered = ["browser_bookmarks", "story_generated_units"];
    const excluded = ["reports", "slow_ops"];
    const exempt = ["task_latest_conversation"];
    expect(findUncovered(resources, covered, excluded, exempt)).toEqual([
      { key: "bad-excluded", identityTable: "reports", reason: "excluded" },
      {
        key: "bad-rollup",
        identityTable: "task_latest_conversation",
        reason: "rollup",
      },
      { key: "bad-typo", identityTable: "taskz", reason: "uncovered" },
    ]);
  });

  test("two resources scoping to the SAME uncovered table → both flagged", () => {
    const resources = scoped(["r1", "reports"], ["r2", "reports"]);
    expect(findUncovered(resources, [], ["reports"])).toHaveLength(2);
  });
});

describe("assertScopePoliciesCovered", () => {
  test("does not throw when every identity table is covered", () => {
    expect(() =>
      assertScopePoliciesCovered(
        scoped(["ok", "browser_bookmarks"]),
        new Set(["browser_bookmarks"]),
        new Set(["reports"]),
        new Set(),
      ),
    ).not.toThrow();
  });

  test("throws when a scoped resource names an uncovered (excluded) table", () => {
    expect(() =>
      assertScopePoliciesCovered(
        scoped(["bad", "reports"]),
        new Set(),
        new Set(["reports"]),
        new Set(),
      ),
    ).toThrow(/dead scope policy/i);
  });

  test("throws for a VIEW-name identity table even though nothing excluded it", () => {
    // The footgun the generalization is for: no exclusion, no exempt — just a
    // wrong string (a view name) that the exclusion-only check would have missed.
    expect(() =>
      assertScopePoliciesCovered(
        scoped(["bad", "tasks_view"]),
        new Set(["tasks"]),
        new Set(),
        new Set(),
      ),
    ).toThrow(/dead scope policy/i);
  });

  test("excluded violation names the resource, table, and ExcludeFromChangeFeed fix", () => {
    let message = "";
    try {
      assertScopePoliciesCovered(
        scoped(["reportsResource", "reports"]),
        new Set(),
        new Set(["reports"]),
        new Set(),
      );
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain("reportsResource");
    expect(message).toContain("reports");
    expect(message).toContain("ExcludeFromChangeFeed");
    expect(message).toContain("hydrate-on-mount");
  });

  test("uncovered violation hints at the VIEW / typo remediation", () => {
    let message = "";
    try {
      assertScopePoliciesCovered(
        scoped(["v", "tasks_view"]),
        new Set(["tasks"]),
        new Set(),
        new Set(),
      );
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain("tasks_view");
    expect(message).toContain("VIEW");
  });
});

describe("formatUncoveredScopeError", () => {
  test("groups by reason, each with its own heading and fix", () => {
    const msg = formatUncoveredScopeError([
      { key: "exc", identityTable: "reports", reason: "excluded" },
      { key: "roll", identityTable: "task_latest_conversation", reason: "rollup" },
      { key: "typo", identityTable: "taskz", reason: "uncovered" },
    ]);
    expect(msg).toContain("3 keyed live-state");
    expect(msg).toContain("ExcludeFromChangeFeed");
    expect(msg).toContain("rollup");
    expect(msg).toContain("VIEW");
    // Section order is excluded → rollup → uncovered.
    expect(msg.indexOf("ExcludeFromChangeFeed")).toBeLessThan(msg.indexOf("rollup"));
  });

  test("within a section, violations are listed one per line, sorted", () => {
    const msg = formatUncoveredScopeError([
      { key: "zResource", identityTable: "slow_ops", reason: "excluded" },
      { key: "aResource", identityTable: "reports", reason: "excluded" },
    ]);
    const aIdx = msg.indexOf("aResource");
    const zIdx = msg.indexOf("zResource");
    expect(aIdx).toBeGreaterThan(-1);
    expect(zIdx).toBeGreaterThan(-1);
    expect(aIdx).toBeLessThan(zIdx); // sorted → aResource before zResource
  });

  test("omits sections with no violations", () => {
    const msg = formatUncoveredScopeError([
      { key: "only", identityTable: "taskz", reason: "uncovered" },
    ]);
    expect(msg).not.toContain("ExcludeFromChangeFeed");
    expect(msg).not.toContain("rollup");
    expect(msg).toContain("VIEW");
  });
});
