import { describe, expect, test } from "bun:test";
import { parseTableNames } from "./index";

function parse(src: string): Record<string, string> {
  const out = new Map<string, string>();
  parseTableNames(src, out);
  return Object.fromEntries(out);
}

describe("parseTableNames", () => {
  test("raw pgTable bindings", () => {
    expect(
      parse(`export const _foo = pgTable("foo", { id: text("id") });`),
    ).toEqual({ _foo: "foo" });
  });

  test("defineEntity binding re-exported via .table alias", () => {
    const src = `
      const tasksEntity = defineEntity("tasks", taskFields, {
        primaryKey: "id",
      });
      export const _tasks = tasksEntity.table;
    `;
    // Only the importable alias is reported; the intermediate entity var is dropped.
    expect(parse(src)).toEqual({ _tasks: "tasks" });
  });

  test("multi-line defineEntity call", () => {
    const src = `
      const mailMessageLabels = defineEntity(
        "mail_message_labels",
        fields,
      );
      export const _mailMessageLabels = mailMessageLabels.table;
    `;
    expect(parse(src)).toEqual({ _mailMessageLabels: "mail_message_labels" });
  });

  test("inline defineEntity(...).table without a separate statement", () => {
    expect(
      parse(`export const _foo = defineEntity("foo", fields).table;`),
    ).toEqual({ _foo: "foo" });
  });

  test("intra-body <entity>.table references are not mistaken for aliases", () => {
    const src = `
      const tasksEntity = defineEntity("tasks", taskFields, {
        columns: {
          folderId: { references: { column: () => tasksEntity.table.id } },
        },
      });
      export const _tasks = tasksEntity.table;
    `;
    expect(parse(src)).toEqual({ _tasks: "tasks" });
  });

  test("mixed pgTable and defineEntity in one file", () => {
    const src = `
      export const _raw = pgTable("raw", {});
      const fooEntity = defineEntity("foo", fields);
      export const _foo = fooEntity.table;
    `;
    expect(parse(src)).toEqual({ _raw: "raw", _foo: "foo" });
  });
});
