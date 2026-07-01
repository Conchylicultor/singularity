import { describe, expect, test } from "bun:test";
import type { DataViewSection, FieldDef } from "../../core";
import {
  aggregateSections,
  isGroupableField,
  partitionIntoSections,
} from "./use-data-view-sections";

interface Task {
  id: string;
  status: string | null;
}

const statusField: FieldDef<Task> = {
  id: "status",
  label: "Status",
  type: "enum",
  value: (t) => t.status,
  options: [
    { value: "todo", label: "To do" },
    { value: "doing", label: "Doing" },
    { value: "done", label: "Done" },
  ],
};

const rowKey = (t: Task) => t.id;

describe("partitionIntoSections", () => {
  test("ungrouped → a single null section mapping rows 1:1", () => {
    const rows: Task[] = [
      { id: "a", status: "todo" },
      { id: "b", status: "done" },
    ];
    const sections = partitionIntoSections(rows, [statusField], undefined, rowKey);
    expect(sections).toHaveLength(1);
    const [only] = sections;
    expect(only!.key).toBeNull();
    expect(only!.label).toBeUndefined();
    expect(only!.count).toBe(2);
    expect(only!.entries.map((e) => e.row)).toEqual(rows);
    expect(only!.entries.map((e) => e.key)).toEqual(["a", "b"]);
  });

  test("unresolvable group field falls back to the single null section", () => {
    const rows: Task[] = [{ id: "a", status: "todo" }];
    const sections = partitionIntoSections(rows, [statusField], "missing", rowKey);
    expect(sections).toHaveLength(1);
    expect(sections[0]!.key).toBeNull();
  });

  test("group-by enum → sections in options order with correct counts", () => {
    const rows: Task[] = [
      { id: "1", status: "done" },
      { id: "2", status: "todo" },
      { id: "3", status: "todo" },
      { id: "4", status: "doing" },
    ];
    const sections = partitionIntoSections(rows, [statusField], "status", rowKey);
    // options order: todo, doing, done (NOT discovery order done,todo,doing).
    expect(sections.map((s) => s.key)).toEqual(["todo", "doing", "done"]);
    expect(sections.map((s) => s.label)).toEqual(["To do", "Doing", "Done"]);
    expect(sections.map((s) => s.count)).toEqual([2, 1, 1]);
    // Within-section row order preserved (the two "todo" rows in input order).
    expect(sections[0]!.entries.map((e) => e.key)).toEqual(["2", "3"]);
  });

  test("null/missing group value → a sensible trailing 'None' bucket", () => {
    const rows: Task[] = [
      { id: "1", status: null },
      { id: "2", status: "todo" },
    ];
    const sections = partitionIntoSections(rows, [statusField], "status", rowKey);
    expect(sections.map((s) => s.key)).toEqual(["todo", expect.any(String)]);
    const noneSection = sections[1]!;
    expect(noneSection.label).toBe("None");
    expect(noneSection.count).toBe(1);
    expect(noneSection.entries[0]!.row.id).toBe("1");
    // The null bucket key is the internal sentinel, distinct from any real value.
    expect(noneSection.key).not.toBe("todo");
  });
});

interface Item {
  id: string;
  group: string | null;
}

describe("aggregateSections", () => {
  const itemKey = (i: Item) => i.id;
  const getKey = (i: Item) => i.group;
  const ungrouped = (rows: Item[]) =>
    partitionIntoSections(rows, [], undefined, itemKey);

  test("collapses N rows sharing a key into one representative + count + members", () => {
    const rows: Item[] = [
      { id: "a", group: "g1" },
      { id: "b", group: "g1" },
      { id: "c", group: "g1" },
    ];
    const [section] = aggregateSections(ungrouped(rows), { getKey });
    expect(section!.entries).toHaveLength(1);
    const [entry] = section!.entries;
    expect(entry!.aggregateCount).toBe(3);
    expect(entry!.members?.map((m) => m.id)).toEqual(["a", "b", "c"]);
    // Default representative = first member in current order.
    expect(entry!.row.id).toBe("a");
    expect(entry!.key).toBe("a");
    // section.count stays the pre-collapse member count.
    expect(section!.count).toBe(3);
  });

  test("null keys pass through 1:1 with no aggregateCount/members", () => {
    const rows: Item[] = [
      { id: "a", group: null },
      { id: "b", group: "g1" },
      { id: "c", group: "g1" },
      { id: "d", group: null },
    ];
    const [section] = aggregateSections(ungrouped(rows), { getKey });
    // a (passthrough), g1 representative at b's slot, d (passthrough).
    expect(section!.entries.map((e) => e.row.id)).toEqual(["a", "b", "d"]);
    const [a, g1, d] = section!.entries;
    expect(a!.aggregateCount).toBeUndefined();
    expect(a!.members).toBeUndefined();
    expect(g1!.aggregateCount).toBe(2);
    expect(g1!.members?.map((m) => m.id)).toEqual(["b", "c"]);
    expect(d!.aggregateCount).toBeUndefined();
  });

  test("pickRepresentative override respected; entry keeps first member's position + key", () => {
    const rows: Item[] = [
      { id: "x", group: null },
      { id: "a", group: "g1" },
      { id: "b", group: "g1" },
      { id: "y", group: null },
    ];
    const pickRepresentative = (members: readonly Item[]) =>
      members[members.length - 1]!;
    const [section] = aggregateSections(ungrouped(rows), {
      getKey,
      pickRepresentative,
    });
    // Order: x, <g1 at a's slot>, y. Representative row = b (last picked), but
    // the entry keeps a's position + key (it stands for the group, not one row).
    expect(section!.entries.map((e) => e.row.id)).toEqual(["x", "b", "y"]);
    expect(section!.entries[1]!.key).toBe("a");
    expect(section!.entries[1]!.aggregateCount).toBe(2);
  });

  test("composes with group-by: collapses WITHIN each section independently", () => {
    interface Row {
      id: string;
      status: string;
      dup: string;
    }
    const statusField2: FieldDef<Row> = {
      id: "status",
      label: "S",
      type: "enum",
      value: (r) => r.status,
      options: [
        { value: "todo", label: "To do" },
        { value: "done", label: "Done" },
      ],
    };
    const rows: Row[] = [
      { id: "1", status: "todo", dup: "p" },
      { id: "2", status: "todo", dup: "p" },
      { id: "3", status: "done", dup: "p" },
    ];
    const grouped = partitionIntoSections(rows, [statusField2], "status", (r) => r.id);
    const aggregated = aggregateSections(grouped, { getKey: (r) => r.dup });
    expect(aggregated.map((s) => s.key)).toEqual(["todo", "done"]);
    // dup="p" collapses within each section separately — NOT across sections.
    expect(aggregated[0]!.entries).toHaveLength(1);
    expect(aggregated[0]!.entries[0]!.aggregateCount).toBe(2);
    expect(aggregated[0]!.count).toBe(2);
    expect(aggregated[1]!.entries).toHaveLength(1);
    expect(aggregated[1]!.entries[0]!.aggregateCount).toBe(1);
  });

  test("aggregates the already-ordered entries (manual-rank composition): representative = first in current order", () => {
    // The hook applies the manual-rank sort BEFORE aggregateSections, so here we
    // simulate entries already ordered b, a, c and confirm the representative is
    // the first in that order (b), not the original input order.
    const section: DataViewSection<Item> = {
      key: null,
      count: 3,
      entries: [
        { row: { id: "b", group: "g" }, key: "b" },
        { row: { id: "a", group: "g" }, key: "a" },
        { row: { id: "c", group: "g" }, key: "c" },
      ],
    };
    const [agg] = aggregateSections([section], { getKey: (i) => i.group });
    expect(agg!.entries).toHaveLength(1);
    expect(agg!.entries[0]!.row.id).toBe("b");
    expect(agg!.entries[0]!.members?.map((m) => m.id)).toEqual(["b", "a", "c"]);
  });
});

describe("isGroupableField", () => {
  test("enum/bool default groupable; others default not", () => {
    expect(isGroupableField(statusField)).toBe(true);
    expect(
      isGroupableField({ id: "f", label: "Flag", type: "bool", value: () => true }),
    ).toBe(true);
    expect(
      isGroupableField({ id: "n", label: "N", type: "number", value: () => 1 }),
    ).toBe(false);
  });

  test("explicit groupable overrides the default; value-less is never groupable", () => {
    expect(
      isGroupableField({ id: "n", label: "N", type: "number", value: () => 1, groupable: true }),
    ).toBe(true);
    expect(
      isGroupableField({ id: "e", label: "E", type: "enum", groupable: true }),
    ).toBe(false);
  });
});
