import { test, expect } from "bun:test";
import { z } from "zod";
import { enumTextField, parsedTextField } from "./enum-text";

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

test("enumTextField carries its meta through the sugar", () => {
  const f = enumTextField(KINDS, { label: "Kind", description: "which sort" });
  expect(f.meta.label).toBe("Kind");
  expect(f.meta.description).toBe("which sort");
});

test("parsedTextField reuses the text storage token too", () => {
  const f = parsedTextField(z.enum(KINDS), { default: "user" });
  expect(f.type.id).toBe("text");
  expect(f.defaultValue).toBe("user");
});

// The reason the general factory takes a SCHEMA and not a value tuple: a
// tolerant policy — normalize a legacy value instead of rejecting the row — has
// no spelling in a tuple. `conversations.model` needs one today.
test("parsedTextField accepts a tolerant schema, which a tuple could not express", () => {
  const LEGACY: Record<string, "opus-5"> = { opus: "opus-5" };
  const tolerant = z.preprocess(
    (raw) => (typeof raw === "string" && raw in LEGACY ? LEGACY[raw] : raw),
    z.enum(["opus-5", "sonnet-5"]),
  );
  const f = parsedTextField(tolerant, { default: "opus-5" });
  expect(f.schema.parse("opus")).toBe("opus-5");
  expect(f.schema.parse("sonnet-5")).toBe("sonnet-5");
  expect(() => f.schema.parse("wizard")).toThrow();
});
