import { test, expect } from "bun:test";
import { z } from "zod";
import { integer, text } from "drizzle-orm/pg-core";
import { collectContributions } from "@plugins/framework/plugins/server-core/core";
import { defineFieldType } from "@plugins/fields/core";
import type { ZodParser } from "@plugins/packages/plugins/zod-parser/core";
import { Fields, resolveFieldStorage, type StorageColumnFor } from "./storage";

// Throwaway types, defined locally via fields/core, keep this unit test for the
// registry resolver decoupled from any concrete field-type plugin — importing a
// sibling type (e.g. `int`) from the `fields` umbrella would form a
// `fields ⇄ fields/plugins/int` cross-plugin cycle.
const fakeType = defineFieldType<number>("__storage_test__");
const build = (name: string): StorageColumnFor<number> => integer(name);

const decodedType = defineFieldType<string>("__storage_test_decoded__");
const decode = <V extends string>(
  name: string,
  _valueSchema: ZodParser<V>,
  // `as unknown as`: a `ZodParser<V>` for a narrower `V` can never be a plain
  // text column's type, which is exactly what the real contract forbids — this
  // throwaway builder only needs to BE a decoding arm, not to decode.
): StorageColumnFor<V> => text(name) as unknown as StorageColumnFor<V>;

test("resolveFieldStorage resolves a contributed type by exact token", () => {
  collectContributions([
    { id: "t", contributions: [Fields.Storage({ type: fakeType, build })] },
  ]);

  // The whole CONTRIBUTION, not a builder: the caller must pick an arm, and only
  // it holds the field schema a `decode` arm needs.
  expect(resolveFieldStorage("__storage_test__")?.build).toBe(build);
  expect(resolveFieldStorage("unregistered")).toBeUndefined();
});

test("resolveFieldStorage carries which arm a type contributed", () => {
  collectContributions([
    {
      id: "t",
      contributions: [
        Fields.Storage({ type: fakeType, build }),
        Fields.Storage({ type: decodedType, decode }),
      ],
    },
  ]);

  const fixed = resolveFieldStorage("__storage_test__");
  expect(fixed?.build).toBe(build);
  expect(fixed?.decode).toBeUndefined();

  const narrowed = resolveFieldStorage("__storage_test_decoded__");
  // Behaviour, not function identity: the resolver is keyed by a STRING, so the
  // contribution it hands back has its `B` erased, and a `<V extends string>`
  // implementation is deliberately not assignable to that wider erased shape.
  // What matters is which arm came back and that it is callable.
  expect(typeof narrowed?.decode).toBe("function");
  expect(narrowed?.build).toBeUndefined();
  // A decoding arm is CALLED with the field's schema — that argument is the
  // whole point of the second arm.
  expect(narrowed?.decode?.("c", z.enum(["a", "b"]))).toBeDefined();
});
