import { describe, expect, test } from "bun:test";
import {
  MODEL_REGISTRY,
  MODEL_TIERS,
  SELECTABLE_CHOICES,
  StoredModelChoiceSchema,
  StoredModelSchema,
  choiceHint,
  choiceLabel,
  normalizeModelChoice,
  resolveModel,
  type ConversationModel,
} from "./registry";

const ids = Object.keys(MODEL_REGISTRY) as ConversationModel[];

describe("resolveModel", () => {
  test("a family resolves to its first entry in registry order", () => {
    for (const tier of MODEL_TIERS) {
      const first = ids.find((id) => MODEL_REGISTRY[id].family === tier);
      expect(resolveModel(tier)).toBe(first!);
    }
  });

  test("a pinned version resolves to itself", () => {
    for (const id of ids) expect(resolveModel(id)).toBe(id);
  });
});

describe("labels", () => {
  test("a family reads as its name, with today's version as the hint", () => {
    expect(choiceLabel("opus")).toBe("Opus");
    expect(choiceHint("opus")).toBe(
      MODEL_REGISTRY[resolveModel("opus")].version,
    );
  });

  test("a pinned version reads as its full name, with no hint", () => {
    expect(choiceLabel("opus-5")).toBe("Opus 5");
    expect(choiceHint("opus-5")).toBeUndefined();
  });
});

describe("SELECTABLE_CHOICES", () => {
  test("families first, then versions, never a print-only model", () => {
    const firstVersion = SELECTABLE_CHOICES.findIndex((c) => c.includes("-"));
    expect(SELECTABLE_CHOICES.slice(0, firstVersion)).toEqual([
      "fable",
      "opus",
      "sonnet",
    ]);
    expect(SELECTABLE_CHOICES).not.toContain("haiku");
    expect(SELECTABLE_CHOICES).not.toContain("haiku-4-5");
  });
});

describe("stored schemas", () => {
  test("a stored choice keeps a family as a family", () => {
    expect(StoredModelChoiceSchema.parse("sonnet")).toBe("sonnet");
    expect(StoredModelChoiceSchema.parse("opus-5")).toBe("opus-5");
  });

  test("unknown values degrade to the default", () => {
    expect(normalizeModelChoice("nope")).toBe("opus");
    expect(StoredModelSchema.parse("nope")).toBe(resolveModel("opus"));
  });
});
