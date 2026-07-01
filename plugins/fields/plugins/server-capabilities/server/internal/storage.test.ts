import { test, expect } from "bun:test";
import { integer } from "drizzle-orm/pg-core";
import { collectContributions } from "@plugins/framework/plugins/server-core/core";
import { defineFieldType } from "@plugins/fields/core";
import { Fields, resolveFieldStorage } from "./storage";

// A throwaway type, defined locally via fields/core, keeps this unit test for
// the registry resolver decoupled from any concrete field-type plugin —
// importing a sibling type (e.g. `int`) from the `fields` umbrella would form a
// `fields ⇄ fields/plugins/int` cross-plugin cycle.
const fakeType = defineFieldType<number>("__storage_test__");
const build = (name: string) => integer(name);

test("resolveFieldStorage resolves a contributed type by exact token", () => {
  collectContributions([
    { id: "t", contributions: [Fields.Storage({ type: fakeType, build })] },
  ]);

  expect(resolveFieldStorage("__storage_test__")).toBe(build);
  expect(resolveFieldStorage("unregistered")).toBeUndefined();
});
