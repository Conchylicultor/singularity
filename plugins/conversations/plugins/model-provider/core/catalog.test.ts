import { describe, expect, test } from "bun:test";
import {
  BASELINE_MODELS,
  ModelUnavailableError,
  assertChoiceLaunchable,
  choiceHint,
  isRetired,
  requireModel,
  resolveModel,
  selectableChoices,
  type ModelCatalog,
} from "./catalog";
import { ConversationModelSchema } from "./registry";

const id = (raw: string) => ConversationModelSchema.parse(raw);

/** The baseline after a release: Sonnet 9 discovered and current, Opus 4.6 retired. */
const moved: ModelCatalog = {
  ...BASELINE_MODELS,
  versions: [
    ...BASELINE_MODELS.versions.map((v) =>
      v.id === "opus-4-6"
        ? {
            ...v,
            retiredAt: "2026-10-01T00:00:00.000Z",
            retiredReason: "no longer offered by Claude Code 2.2.0",
          }
        : v,
    ),
    {
      id: id("sonnet-9"),
      firstSeenAt: "2026-10-01T00:00:00.000Z",
      source: "cli",
    },
  ],
  current: { ...BASELINE_MODELS.current, sonnet: id("sonnet-9") },
};

describe("resolveModel", () => {
  test("a family runs the catalog's current version", () => {
    expect(resolveModel("sonnet", BASELINE_MODELS)).toEqual({
      ok: true,
      model: id("sonnet-5-5"),
    });
    expect(resolveModel("sonnet", moved)).toEqual({
      ok: true,
      model: id("sonnet-9"),
    });
  });

  test("a known pinned version runs itself", () => {
    expect(resolveModel(id("sonnet-5-5"), moved)).toEqual({
      ok: true,
      model: id("sonnet-5-5"),
    });
  });

  test("a retired version is refused with its reason, never substituted", () => {
    expect(resolveModel(id("opus-4-6"), moved)).toEqual({
      ok: false,
      choice: id("opus-4-6"),
      reason: "retired",
      retiredReason: "no longer offered by Claude Code 2.2.0",
    });
    expect(isRetired(id("opus-4-6"), moved)).toBe(true);
  });

  test("a version the catalog never saw is refused as unknown", () => {
    expect(resolveModel(id("opus-99"), moved)).toEqual({
      ok: false,
      choice: id("opus-99"),
      reason: "unknown",
    });
  });

  test("requireModel throws a 409 naming the model and the alternatives", () => {
    expect(requireModel("opus", moved)).toBe(id("opus-5-5"));
    let thrown: unknown;
    try {
      requireModel(id("opus-4-6"), moved);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(ModelUnavailableError);
    const err = thrown as ModelUnavailableError;
    expect(err.status).toBe(409);
    expect(err.message).toContain("Opus 4.6 is retired");
    expect(err.message).toContain("Sonnet 9");
    expect(err.message).not.toContain("Opus 4.6,");
  });
});

describe("hints and pickers", () => {
  test("a family's hint is its current version; a pinned version has none", () => {
    expect(choiceHint("sonnet", BASELINE_MODELS)).toBe("5.5");
    expect(choiceHint("sonnet", moved)).toBe("9");
    expect(choiceHint(id("opus-5"), moved)).toBeUndefined();
  });

  test("families first, then live versions newest first; never print-only, never retired", () => {
    const choices = selectableChoices(moved);
    expect(choices.slice(0, 3)).toEqual(["fable", "opus", "sonnet"]);
    expect(choices).toContain(id("sonnet-9"));
    expect(choices.indexOf(id("sonnet-9"))).toBeLessThan(
      choices.indexOf(id("sonnet-5-5")),
    );
    expect(choices).not.toContain(id("opus-4-6"));
    expect(choices).not.toContain("haiku");
    expect(choices).not.toContain(id("haiku-4-5"));
  });
});

describe("assertChoiceLaunchable", () => {
  function refusal(
    choice: Parameters<typeof assertChoiceLaunchable>[0],
  ): ModelUnavailableError {
    try {
      assertChoiceLaunchable(choice, moved);
    } catch (err) {
      if (err instanceof ModelUnavailableError) return err;
      throw err;
    }
    throw new Error(`expected ${choice} to be refused`);
  }

  test("a family and a known live version pass", () => {
    expect(() => assertChoiceLaunchable("sonnet", moved)).not.toThrow();
    expect(() => assertChoiceLaunchable(id("sonnet-9"), moved)).not.toThrow();
  });

  test("an unknown version is a 400 that lists what can run", () => {
    const err = refusal(id("sonnet-10"));
    expect(err.status).toBe(400);
    expect(err.message).toContain(
      "Sonnet 10 is not a model this machine knows",
    );
    expect(err.message).toContain("pick another: Fable, Opus, Sonnet,");
    expect(err.message).toContain("Sonnet 9");
  });

  test("a retired version is a 400 naming why, and is not among the alternatives", () => {
    const err = refusal(id("opus-4-6"));
    expect(err.status).toBe(400);
    expect(err.message).toContain(
      "Opus 4.6 is retired (no longer offered by Claude Code 2.2.0)",
    );
    expect(err.alternatives).not.toContain(id("opus-4-6"));
  });
});
