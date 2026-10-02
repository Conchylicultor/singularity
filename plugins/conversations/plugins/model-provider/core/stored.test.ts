import { afterEach, expect, test } from "bun:test";
import { FALLBACK_MODEL } from "./catalog";
import { ConversationModelSchema } from "./registry";
import {
  StoredModelChoiceSchema,
  StoredModelSchema,
  registerModelCorruptionReporter,
} from "./stored";

const reported: string[] = [];
registerModelCorruptionReporter((_message, raw) => reported.push(String(raw)));
afterEach(() => {
  reported.length = 0;
});

test("a well-formed id the catalog has never seen is valid, and not reported", () => {
  expect(StoredModelSchema.parse("sonnet-9")).toBe(
    ConversationModelSchema.parse("sonnet-9"),
  );
  expect(StoredModelChoiceSchema.parse("opus-12-1")).toBe(
    ConversationModelSchema.parse("opus-12-1"),
  );
  expect(StoredModelChoiceSchema.parse("sonnet")).toBe("sonnet");
  expect(reported).toEqual([]);
});

test("a malformed value degrades to the fallback, and is reported", () => {
  expect(StoredModelSchema.parse("gpt-5-turbo")).toBe(FALLBACK_MODEL);
  expect(StoredModelChoiceSchema.parse("not a model")).toBe("opus");
  expect(reported).toEqual(["gpt-5-turbo", "not a model"]);
});
