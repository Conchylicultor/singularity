import { describe, expect, test } from "bun:test";
import {
  ConversationModelSchema,
  ModelChoiceSchema,
  cliFlagFor,
  choiceLabel,
  compareModelsNewestFirst,
  modelDisplayLabel,
  modelIdFromCliName,
  modelMeta,
  parseModelId,
} from "./registry";

const id = (raw: string) => ConversationModelSchema.parse(raw);

describe("the id grammar", () => {
  test("accepts <family>-<major>[-<minor>] for every known family", () => {
    for (const raw of [
      "opus-5",
      "opus-5-5",
      "sonnet-9",
      "haiku-4-5",
      "fable-5-1",
      "opus-10-12",
    ]) {
      expect(parseModelId(raw)).toEqual({ ok: true, id: id(raw) });
    }
  });

  test("rejects anything else, as a result", () => {
    // A CLI flag is not an id either: the id is what the flag is derived from.
    for (const raw of [
      "opus",
      "gpt-5",
      "opus-5-5-1",
      "opus-",
      "Opus-5",
      cliFlagFor(id("opus-5")),
      "opus-5-x",
      "",
    ]) {
      expect(parseModelId(raw)).toEqual({ ok: false, raw });
    }
  });

  test("a choice is a family or an id, nothing else", () => {
    expect(ModelChoiceSchema.parse("sonnet")).toBe("sonnet");
    expect(ModelChoiceSchema.parse("sonnet-9")).toBe(id("sonnet-9"));
    expect(ModelChoiceSchema.safeParse("sonnet-latest").success).toBe(false);
  });
});

describe("modelIdFromCliName", () => {
  test("inverts cliFlagFor, with or without the CLI's date suffix", () => {
    for (const raw of ["haiku-4-5", "sonnet-5-5", "opus-5", "fable-12-3"]) {
      const flag = cliFlagFor(id(raw));
      expect(modelIdFromCliName(flag)).toEqual({ ok: true, id: id(raw) });
      expect(modelIdFromCliName(`${flag}-20251001`)).toEqual({
        ok: true,
        id: id(raw),
      });
    }
  });

  test("a name that is not a CLI model id is not guessed at", () => {
    for (const raw of [
      "sonnet",
      "not-a-model-9",
      "claude-3-5-sonnet-20241022",
      "opus-5-5",
    ]) {
      expect(modelIdFromCliName(raw)).toEqual({ ok: false, raw });
    }
  });
});

describe("modelMeta", () => {
  test("everything derives from the id", () => {
    const opus = id("opus-5-5");
    expect(modelMeta(opus)).toEqual({
      cliFlag: `claude-${opus}`,
      family: "opus",
      version: "5.5",
      label: "Opus 5.5",
      iconSize: "size-4",
    });
    expect(modelMeta(id("sonnet-9")).label).toBe("Sonnet 9");
    expect(modelMeta(id("haiku-4-5")).printOnly).toBe(true);
    const fable = id("fable-5-1");
    expect(cliFlagFor(fable)).toBe(`claude-${fable}`);
  });

  test("labels", () => {
    expect(choiceLabel("opus")).toBe("Opus");
    expect(choiceLabel(id("opus-5"))).toBe("Opus 5");
    expect(modelDisplayLabel(`${cliFlagFor(id("opus-4-8"))}-20260101`)).toBe(
      "Opus 4.8",
    );
    expect(modelDisplayLabel("opus-4-8")).toBe("Opus 4.8");
    expect(modelDisplayLabel("opus")).toBe("Opus");
    expect(modelDisplayLabel("mystery")).toBe("mystery");
  });
});

test("newest first, grouped by family in picker order", () => {
  const ids = [
    "sonnet-4-6",
    "opus-5",
    "fable-5",
    "opus-5-5",
    "opus-10",
    "sonnet-5",
  ].map(id);
  expect([...ids].sort(compareModelsNewestFirst)).toEqual(
    ["fable-5", "opus-10", "opus-5-5", "opus-5", "sonnet-5", "sonnet-4-6"].map(
      id,
    ),
  );
});
