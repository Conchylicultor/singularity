import { test, expect } from "bun:test";
import { enumTextField } from "./enum-text";

const KINDS = ["system", "user"] as const;

test("enumTextField reuses the text storage token", () => {
  expect(enumTextField(KINDS).type.id).toBe("text");
});

test("enumTextField validates the union and rejects outsiders", () => {
  const f = enumTextField(KINDS);
  expect(f.schema.parse("system")).toBe("system");
  expect(() => f.schema.parse("nope")).toThrow();
});

test("enumTextField defaults to the first value, or an explicit default", () => {
  expect(enumTextField(KINDS).defaultValue).toBe("system");
  expect(enumTextField(KINDS, { default: "user" }).defaultValue).toBe("user");
});
