import { describe, expect, it } from "bun:test";
import { mapConfigLists } from "./collections";
import { listField } from "@plugins/fields/plugins/list/plugins/config/core";
import { objectField } from "@plugins/fields/plugins/object/plugins/config/core";
import { textField } from "@plugins/fields/plugins/text/plugins/config/core";
import type { FieldsRecord } from "@plugins/fields/core";

// categories[] → items[]: a list nested in a list's itemFields.
const nestedLists: FieldsRecord = {
  categories: listField({
    itemFields: {
      name: textField({}),
      items: listField({ itemFields: { name: textField({}) } }),
    },
  }),
};

// wrapper{ rows[] }: a list nested in an objectField's subFields.
const listInObject: FieldsRecord = {
  wrapper: objectField({
    subFields: { rows: listField({ itemFields: { name: textField({}) } }) },
  }),
};

/** Collect (path, row count) for every list instance the walk visits, in order. */
function visitedPaths(
  doc: Record<string, unknown>,
  fields: FieldsRecord,
): string[] {
  const paths: string[] = [];
  mapConfigLists(doc, fields, (rows, _field, path) => {
    paths.push(`${path}:${rows.length}`);
  });
  return paths;
}

describe("mapConfigLists", () => {
  it("visits a nested list once per row of its parent, with an indexed path", () => {
    expect(
      visitedPaths(
        {
          categories: [
            { name: "Priority", items: [{ name: "P0" }, { name: "P1" }] },
            { name: "App", items: [{ name: "Mail" }] },
          ],
        },
        nestedLists,
      ),
    ).toEqual([
      "categories:2",
      "categories[0].items:2",
      "categories[1].items:1",
    ]);
  });

  it("visits a list nested inside an objectField", () => {
    expect(
      visitedPaths({ wrapper: { rows: [{ name: "A" }] } }, listInObject),
    ).toEqual(["wrapper.rows:1"]);
  });

  it("visits a list BEFORE recursing into its rows", () => {
    // Load-bearing order: the id seeded on a parent row hashes that row's
    // content, nested arrays included, so nested ids must not exist yet.
    const seen: string[] = [];
    mapConfigLists(
      { categories: [{ name: "Priority", items: [{ name: "P0" }] }] },
      nestedLists,
      (rows, _field, path) => {
        seen.push(path);
        // At the moment the OUTER list is visited, the nested rows are still
        // exactly as authored.
        if (path === "categories") {
          expect(rows[0]!.items).toEqual([{ name: "P0" }]);
        }
      },
    );
    expect(seen).toEqual(["categories", "categories[0].items"]);
  });

  it("replaces a list instance with the array the visitor returns", () => {
    const out = mapConfigLists(
      { categories: [{ name: "Priority", items: [{ name: "P0" }] }] },
      nestedLists,
      (rows) => rows.map((row) => ({ ...row, seen: true })),
    );
    const categories = out.categories as Record<string, unknown>[];
    expect(categories[0]!.seen).toBe(true);
    expect((categories[0]!.items as Record<string, unknown>[])[0]!.seen).toBe(
      true,
    );
  });

  it("returns the input by reference when the visitor changes nothing", () => {
    const doc = { categories: [{ name: "Priority", items: [{ name: "P0" }] }] };
    expect(mapConfigLists(doc, nestedLists, () => {})).toBe(doc);
  });

  it("never mutates the input document", () => {
    const doc = { categories: [{ name: "Priority", items: [{ name: "P0" }] }] };
    mapConfigLists(doc, nestedLists, (rows) =>
      rows.map((row) => ({ ...row, seen: true })),
    );
    expect(doc).toEqual({
      categories: [{ name: "Priority", items: [{ name: "P0" }] }],
    });
  });

  it("skips keys the document omits, holds as a non-array, or holds malformed", () => {
    expect(visitedPaths({}, nestedLists)).toEqual([]);
    expect(visitedPaths({ categories: "nope" }, nestedLists)).toEqual([]);
    expect(visitedPaths({ wrapper: null }, listInObject)).toEqual([]);
    // A malformed row has no sub-document to descend into, but its own list is
    // still visited — the visitor decides what to do with it.
    expect(visitedPaths({ categories: [null, "x"] }, nestedLists)).toEqual([
      "categories:2",
    ]);
  });

  it("ignores non-container fields", () => {
    expect(visitedPaths({ name: "x" }, { name: textField({}) })).toEqual([]);
  });
});
