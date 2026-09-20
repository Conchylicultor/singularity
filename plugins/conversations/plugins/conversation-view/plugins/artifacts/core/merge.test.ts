import { describe, expect, test } from "bun:test";
import { strongestRelation, type ArtifactHit } from "./contract";
import { mergeHits } from "./merge";

function hit(
  kind: string,
  key: string,
  relation: ArtifactHit["relation"],
  at: string,
): ArtifactHit {
  return { kind, key, relation, at };
}

describe("strongestRelation", () => {
  test("created beats edited beats referenced, either way round", () => {
    expect(strongestRelation("edited", "created")).toBe("created");
    expect(strongestRelation("created", "edited")).toBe("created");
    expect(strongestRelation("referenced", "edited")).toBe("edited");
    expect(strongestRelation("edited", "referenced")).toBe("edited");
    expect(strongestRelation("referenced", "referenced")).toBe("referenced");
  });
});

describe("mergeHits", () => {
  test("no hits — no kinds at all, not a kind with an empty list", () => {
    expect(mergeHits([]).size).toBe(0);
  });

  test("one row per (kind, key), grouped by kind", () => {
    const merged = mergeHits([
      hit("prototype", "proto-1-aaaa", "referenced", "2026-09-19T10:00:00Z"),
      hit("research", "research/a.md", "created", "2026-09-19T10:01:00Z"),
      hit("prototype", "proto-2-bbbb", "created", "2026-09-19T10:02:00Z"),
    ]);

    expect([...merged.keys()]).toEqual(["prototype", "research"]);
    expect(merged.get("prototype")?.map((i) => i.key)).toEqual([
      "proto-1-aaaa",
      "proto-2-bbbb",
    ]);
    expect(merged.get("research")).toHaveLength(1);
  });

  test("the same key in two kinds is two different artifacts", () => {
    const merged = mergeHits([
      hit("research", "notes.md", "created", "2026-09-19T10:00:00Z"),
      hit("page", "notes.md", "referenced", "2026-09-19T10:01:00Z"),
    ]);

    expect(merged.get("research")?.[0]?.relation).toBe("created");
    expect(merged.get("page")?.[0]?.relation).toBe("referenced");
  });

  test("referenced then edited is one edited row, spanning both instants", () => {
    const merged = mergeHits([
      hit("prototype", "proto-1-aaaa", "referenced", "2026-09-19T10:00:00Z"),
      hit("prototype", "proto-1-aaaa", "edited", "2026-09-19T10:05:00Z"),
      hit("prototype", "proto-1-aaaa", "referenced", "2026-09-19T10:09:00Z"),
    ]);

    expect(merged.get("prototype")).toEqual([
      {
        key: "proto-1-aaaa",
        relation: "edited",
        firstAt: "2026-09-19T10:00:00Z",
        lastAt: "2026-09-19T10:09:00Z",
      },
    ]);
  });

  test("the strongest relation wins whatever order the hits arrive in", () => {
    const merged = mergeHits([
      hit("page", "p1", "created", "2026-09-19T10:00:00Z"),
      hit("page", "p1", "referenced", "2026-09-19T10:05:00Z"),
    ]);

    expect(merged.get("page")?.[0]?.relation).toBe("created");
  });

  test("out-of-order instants still yield the true first/last", () => {
    const merged = mergeHits([
      hit("page", "p1", "referenced", "2026-09-19T10:05:00Z"),
      hit("page", "p1", "referenced", "2026-09-19T09:00:00Z"),
      hit("page", "p1", "referenced", "2026-09-19T11:00:00Z"),
    ]);

    expect(merged.get("page")?.[0]?.firstAt).toBe("2026-09-19T09:00:00Z");
    expect(merged.get("page")?.[0]?.lastAt).toBe("2026-09-19T11:00:00Z");
  });

  test("a key is kept at the position it was first seen, not re-sorted", () => {
    const merged = mergeHits([
      hit("skill", "plan", "referenced", "2026-09-19T10:00:00Z"),
      hit("skill", "css", "referenced", "2026-09-19T10:01:00Z"),
      hit("skill", "plan", "referenced", "2026-09-19T10:02:00Z"),
    ]);

    expect(merged.get("skill")?.map((i) => i.key)).toEqual(["plan", "css"]);
  });
});
