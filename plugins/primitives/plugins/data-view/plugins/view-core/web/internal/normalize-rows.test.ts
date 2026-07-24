import { describe, expect, it } from "bun:test";
import { normalizeRows, type RawViewRow } from "./normalize-rows";

describe("normalizeRows — source carry-through", () => {
  it("preserves an authored source key verbatim", () => {
    const rows = normalizeRows([
      { id: "q", name: "Queue", view: { type: "list" }, source: "queue" },
    ]);
    expect(rows[0]!.source).toBe("queue");
  });

  it("stays byte-identical for source-less rows (no `source` key at all)", () => {
    const rows = normalizeRows([
      { id: "a", name: "All", view: { type: "table" } },
    ]);
    // The JSON-identity reconcile in useViewsConfig depends on the exact shape:
    // a source-less row must serialize as `{ id, name, view }` — never with a
    // `source: undefined` (which `in` would see) nor any extra key.
    expect("source" in rows[0]!).toBe(false);
    expect(JSON.stringify(rows)).toBe(
      JSON.stringify([{ id: "a", name: "All", view: { type: "table" } }]),
    );
  });

  it("round-trips a mixed list: sourceful rows keep it, source-less stay bare", () => {
    const raw: RawViewRow[] = [
      { id: "q", name: "Queue", view: { type: "list" }, source: "queue" },
      { id: "h", name: "History", view: { type: "list" }, source: "history" },
      { id: "a", name: "All", view: { type: "table" } },
    ];
    const rows = normalizeRows(raw);
    expect(rows.map((r) => r.source)).toEqual(["queue", "history", undefined]);
    expect("source" in rows[2]!).toBe(false);
    // Re-normalizing the output is a fixed point (what the reconcile effect
    // does on every external-truth advance).
    expect(JSON.stringify(normalizeRows(rows))).toBe(JSON.stringify(rows));
  });

  it("still derives ids for terse rows (id ?? slug(name) ?? view-i)", () => {
    const rows = normalizeRows([
      { name: "My View", view: { type: "table" }, source: "s1" },
      { name: "", view: { type: "table" } },
    ]);
    expect(rows[0]!.id).toBe("my-view");
    expect(rows[0]!.source).toBe("s1");
    expect(rows[1]!.id).toBe("view-1");
  });
});
