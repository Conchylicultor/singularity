import { describe, expect, test } from "bun:test";
import {
  assertNoDeadScopePolicies,
  findDeadScopePolicies,
  formatDeadScopeError,
  type ScopedResourceIdentity,
} from "./identity-coverage";

const scoped = (
  ...pairs: Array<[key: string, identityTable: string]>
): ScopedResourceIdentity[] =>
  pairs.map(([key, identityTable]) => ({ key, identityTable }));

describe("findDeadScopePolicies", () => {
  test("no scoped resources → no violation", () => {
    expect(findDeadScopePolicies([], new Set(["reports"]))).toEqual([]);
  });

  test("scoped resource on a live (non-excluded) table → no violation", () => {
    const resources = scoped(["notifications", "notifications_table"]);
    expect(findDeadScopePolicies(resources, new Set(["reports"]))).toEqual([]);
  });

  test("no excluded tables → no violation even for many resources", () => {
    const resources = scoped(["a", "reports"], ["b", "slow_ops"]);
    expect(findDeadScopePolicies(resources, new Set())).toEqual([]);
  });

  test("scoped resource on an excluded table → flagged", () => {
    const resources = scoped(["reportsResource", "reports"]);
    expect(findDeadScopePolicies(resources, new Set(["reports"]))).toEqual(
      scoped(["reportsResource", "reports"]),
    );
  });

  test("mixed set → only the excluded-table resources are flagged", () => {
    const resources = scoped(
      ["good1", "browser_bookmarks"],
      ["bad1", "reports"],
      ["good2", "story_generated_units"],
      ["bad2", "slow_ops"],
    );
    const excluded = new Set(["reports", "slow_ops"]);
    expect(findDeadScopePolicies(resources, excluded)).toEqual(
      scoped(["bad1", "reports"], ["bad2", "slow_ops"]),
    );
  });

  test("two resources scoping to the SAME excluded table → both flagged", () => {
    const resources = scoped(["r1", "reports"], ["r2", "reports"]);
    expect(findDeadScopePolicies(resources, new Set(["reports"]))).toHaveLength(2);
  });
});

describe("assertNoDeadScopePolicies", () => {
  test("does not throw when there are no violations", () => {
    expect(() =>
      assertNoDeadScopePolicies(
        scoped(["ok", "browser_bookmarks"]),
        new Set(["reports"]),
      ),
    ).not.toThrow();
  });

  test("throws when a scoped resource names an excluded table", () => {
    expect(() =>
      assertNoDeadScopePolicies(scoped(["bad", "reports"]), new Set(["reports"])),
    ).toThrow(/dead scope policy/i);
  });

  test("error names the offending resource, its table, and both fixes", () => {
    let message = "";
    try {
      assertNoDeadScopePolicies(
        scoped(["reportsResource", "reports"]),
        new Set(["reports"]),
      );
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain("reportsResource");
    expect(message).toContain("reports");
    expect(message).toContain("ExcludeFromChangeFeed");
    expect(message).toContain("hydrate-on-mount");
  });
});

describe("formatDeadScopeError", () => {
  test("lists every violation, one per line, sorted", () => {
    const msg = formatDeadScopeError(
      scoped(["zResource", "slow_ops"], ["aResource", "reports"]),
    );
    const aIdx = msg.indexOf("aResource");
    const zIdx = msg.indexOf("zResource");
    expect(aIdx).toBeGreaterThan(-1);
    expect(zIdx).toBeGreaterThan(-1);
    expect(aIdx).toBeLessThan(zIdx); // sorted → aResource before zResource
    expect(msg).toContain("2 keyed live-state");
  });
});
