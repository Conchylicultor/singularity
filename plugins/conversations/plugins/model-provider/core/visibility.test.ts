import { describe, expect, test } from "bun:test";
import { BASELINE_MODELS } from "./catalog";
import { ConversationModelSchema } from "./registry";
import {
  choiceOptionLabel,
  isChoiceVisible,
  visibleChoices,
} from "./visibility";

const id = (raw: string) => ConversationModelSchema.parse(raw);

describe("visibleModels: a free-key record where an absent key is the default", () => {
  test("nothing set: families on, pinned versions off", () => {
    expect(visibleChoices(BASELINE_MODELS, {})).toEqual([
      "fable",
      "opus",
      "sonnet",
    ]);
  });

  test("a saved file from when the setting enumerated every model loads unchanged", () => {
    // The shape the old fixed object wrote: every model, explicitly.
    const saved = {
      fable: true,
      opus: true,
      sonnet: false,
      "opus-5": true,
      "opus-4-6": false,
      "sonnet-4-6": false,
    };
    expect(visibleChoices(BASELINE_MODELS, saved)).toEqual([
      "fable",
      "opus",
      id("opus-5"),
    ]);
  });

  test("unknown keys are ignored: a version this machine does not offer, a stray key", () => {
    const setting = { "opus-99": true, "not-a-model": true, "haiku-4-5": true };
    expect(visibleChoices(BASELINE_MODELS, setting)).toEqual([
      "fable",
      "opus",
      "sonnet",
    ]);
  });

  test("a version discovered later shows only once turned on — its key needs no migration", () => {
    const sonnet9 = id("sonnet-9");
    const catalog = {
      ...BASELINE_MODELS,
      versions: [
        ...BASELINE_MODELS.versions,
        {
          id: sonnet9,
          firstSeenAt: "2026-10-02T00:00:00.000Z",
          source: "cli" as const,
        },
      ],
    };
    expect(visibleChoices(catalog, {})).not.toContain(sonnet9);
    expect(isChoiceVisible({ "sonnet-9": true }, sonnet9)).toBe(true);
    expect(visibleChoices(catalog, { "sonnet-9": true })).toContain(sonnet9);
  });

  test("hiding everything brings the families back, so a dropdown can always launch", () => {
    expect(
      visibleChoices(BASELINE_MODELS, {
        fable: false,
        opus: false,
        sonnet: false,
      }),
    ).toEqual(["fable", "opus", "sonnet"]);
  });
});

describe("choiceOptionLabel", () => {
  test("a family carries today's version; a pinned version is its own label", () => {
    expect(choiceOptionLabel("opus", BASELINE_MODELS)).toBe("Opus · 5.5");
    expect(choiceOptionLabel(id("opus-5"), BASELINE_MODELS)).toBe("Opus 5");
  });
});
