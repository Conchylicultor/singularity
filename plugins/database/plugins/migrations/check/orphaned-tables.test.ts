import { describe, expect, test } from "bun:test";
import { computeOrphans, declaredTablesFromSnapshot } from "./orphaned-tables";

const ALLOWLIST = ["__singularity_migrations", "derived_view_state"] as const;

describe("declaredTablesFromSnapshot", () => {
  test("extracts the bare `name` of each public table", () => {
    const snapshot = {
      tables: {
        "public.foo": { name: "foo" },
        "public.bar": { name: "bar" },
      },
    };
    expect(declaredTablesFromSnapshot(snapshot)).toEqual(new Set(["foo", "bar"]));
  });

  test("throws when `tables` is missing", () => {
    expect(() => declaredTablesFromSnapshot({})).toThrow();
  });

  test("throws when `tables` is empty (would otherwise flag everything)", () => {
    expect(() => declaredTablesFromSnapshot({ tables: {} })).toThrow();
  });
});

describe("computeOrphans", () => {
  test("flags a live table that is neither declared nor allowlisted", () => {
    const live = ["foo", "bar", "__singularity_migrations", "zombie"];
    const declared = new Set(["foo", "bar"]);
    expect(computeOrphans(live, declared, ALLOWLIST)).toEqual(["zombie"]);
  });

  test("no orphans when live ⊆ declared ∪ allowlist", () => {
    const live = ["foo", "bar", "__singularity_migrations", "derived_view_state"];
    const declared = new Set(["foo", "bar"]);
    expect(computeOrphans(live, declared, ALLOWLIST)).toEqual([]);
  });

  test("allowlist members are never flagged even if undeclared", () => {
    const live = ["__singularity_migrations", "derived_view_state"];
    const declared = new Set<string>();
    expect(computeOrphans(live, declared, ALLOWLIST)).toEqual([]);
  });

  test("result is sorted", () => {
    const live = ["zeta", "alpha", "mike"];
    const declared = new Set<string>();
    expect(computeOrphans(live, declared, ALLOWLIST)).toEqual(["alpha", "mike", "zeta"]);
  });
});
