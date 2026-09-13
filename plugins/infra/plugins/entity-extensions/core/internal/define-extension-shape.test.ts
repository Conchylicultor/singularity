import { describe, expect, test } from "bun:test";
import type { z } from "zod";
import { intField } from "@plugins/fields/plugins/int/plugins/config/core";
import { textField } from "@plugins/fields/plugins/text/plugins/config/core";
import { defineExtensionShape } from "./define-extension-shape";

describe("defineExtensionShape", () => {
  test("orders the full record key → own fields → timestamps", () => {
    const shape = defineExtensionShape({
      key: "songId",
      fields: { semitones: intField(), label: textField() },
    });
    // drizzle-kit diffs columns positionally, so this order IS the DDL order.
    expect(Object.keys(shape.fields)).toEqual([
      "songId",
      "semitones",
      "label",
      "createdAt",
      "updatedAt",
    ]);
    expect(shape.key).toBe("songId");
  });

  test("keeps both timestamps off the wire by default", () => {
    const shape = defineExtensionShape({
      key: "songId",
      fields: { semitones: intField() },
    });
    expect(Object.keys(shape.schema.shape)).toEqual(["songId", "semitones"]);
    expect(shape.serverOnly).toEqual(["createdAt", "updatedAt"]);
    expect(shape.schema.parse({ songId: "s1", semitones: 3 })).toEqual({
      songId: "s1",
      semitones: 3,
    });
  });

  test("wireTimestamps puts the listed timestamps on the wire", () => {
    const shape = defineExtensionShape({
      key: "taskId",
      fields: { level: textField() },
      wireTimestamps: ["updatedAt"],
    });
    expect(Object.keys(shape.schema.shape)).toEqual([
      "taskId",
      "level",
      "updatedAt",
    ]);
    expect(shape.serverOnly).toEqual(["createdAt"]);
  });

  test("serverOnly keeps own fields off the wire, alongside the timestamps", () => {
    const shape = defineExtensionShape({
      key: "songId",
      fields: { attachmentId: textField(), contentHash: textField() },
      serverOnly: ["contentHash"],
      wireTimestamps: ["createdAt", "updatedAt"],
    });
    expect(Object.keys(shape.schema.shape)).toEqual([
      "songId",
      "attachmentId",
      "createdAt",
      "updatedAt",
    ]);
    expect(shape.serverOnly).toEqual(["contentHash"]);
  });

  test("an extension with no own fields carries only the key", () => {
    const shape = defineExtensionShape({ key: "blockId", fields: {} });
    expect(Object.keys(shape.schema.shape)).toEqual(["blockId"]);
  });

  test("a server-only key never survives a parse", () => {
    const shape = defineExtensionShape({
      key: "songId",
      fields: { semitones: intField() },
    });
    expect(
      shape.schema.parse({ songId: "s1", semitones: 0, createdAt: new Date() }),
    ).toEqual({ songId: "s1", semitones: 0 });
  });

  test("the shape is frozen", () => {
    const shape = defineExtensionShape({ key: "songId", fields: {} });
    expect(Object.isFrozen(shape)).toBe(true);
    expect(Object.isFrozen(shape.fields)).toBe(true);
    expect(Object.isFrozen(shape.serverOnly)).toBe(true);
  });

  describe("reserved keys", () => {
    test.each(["songId", "createdAt", "updatedAt"])(
      "throws when the fields declare %s",
      (reserved) => {
        expect(() =>
          defineExtensionShape({
            key: "songId",
            fields: { [reserved]: textField() },
          }),
        ).toThrow(
          new RegExp(
            `defineExtensionShape\\(\\{ key: "songId" \\}\\): field "${reserved}" is reserved`,
          ),
        );
      },
    );

    test.each(["createdAt", "updatedAt"])(
      "throws when the key itself is named %s",
      (key) => {
        expect(() => defineExtensionShape({ key, fields: {} })).toThrow(
          new RegExp(`the key cannot be named "${key}"`),
        );
      },
    );
  });
});

// ── Compile-time: the wire row type follows serverOnly / wireTimestamps ──────
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Expect<T extends true> = T;

const typedShape = defineExtensionShape({
  key: "songId",
  fields: { semitones: intField(), contentHash: textField() },
  serverOnly: ["contentHash"],
  wireTimestamps: ["updatedAt"],
});
// Exported so noUnusedLocals keeps the assertion (a type-test alias).
export type _WireRow = Expect<
  Equal<
    z.infer<typeof typedShape.schema>,
    { songId: string; semitones: number; updatedAt: Date }
  >
>;
export type _Key = Expect<Equal<typeof typedShape.key, "songId">>;
