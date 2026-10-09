import { describe, expect, test } from "bun:test";
import { defaultTagColor } from "../../core";
import { resolveTagRequests, type VocabularyTag } from "./resolve";

const VOCAB: VocabularyTag[] = [
  { id: "tag-1", name: "In progress", color: "blue" },
  { id: "tag-2", name: "Planned", color: "purple" },
  { id: "tag-3", name: "Done", color: "green" },
];

describe("resolveTagRequests", () => {
  test("names match by key and resolve to the stored spelling, in order", () => {
    const r = resolveTagRequests(
      [{ name: "done" }, { name: "  IN  progress " }],
      VOCAB,
    );
    expect(r).toEqual({
      ok: true,
      tags: [
        { kind: "existing", id: "tag-3", name: "Done", color: "green" },
        { kind: "existing", id: "tag-1", name: "In progress", color: "blue" },
      ],
      created: [],
    });
  });

  test("duplicates collapse onto the first occurrence", () => {
    const r = resolveTagRequests(
      [{ name: "Done" }, { name: "Planned" }, { name: "DONE" }],
      VOCAB,
    );
    expect(r.ok && r.tags.map((t) => t.name)).toEqual(["Done", "Planned"]);
  });

  test("an unknown name is refused with suggestions and the vocabulary", () => {
    const r = resolveTagRequests([{ name: "Plannd" }, { name: "Done" }], VOCAB);
    expect(r).toEqual({
      ok: false,
      unknown: [{ name: "Plannd", suggestions: ["Planned"] }],
      invalid: [],
      vocabulary: ["In progress", "Planned", "Done"],
    });
  });

  test("create mints an unknown name, normalized, with its default color", () => {
    const r = resolveTagRequests(
      [{ name: " Blocked  now ", create: {} }],
      VOCAB,
    );
    expect(r).toEqual({
      ok: true,
      tags: [
        {
          kind: "new",
          name: "Blocked now",
          color: defaultTagColor("Blocked now"),
        },
      ],
      created: ["Blocked now"],
    });
  });

  test("create keeps an explicit color", () => {
    const r = resolveTagRequests(
      [{ name: "Blocked", create: { color: "red" } }],
      VOCAB,
    );
    expect(r.ok && r.tags[0]).toEqual({
      kind: "new",
      name: "Blocked",
      color: "red",
    });
  });

  test("create on an existing name resolves to the existing tag", () => {
    const r = resolveTagRequests(
      [{ name: "done", create: { color: "red" } }],
      VOCAB,
    );
    expect(r).toEqual({
      ok: true,
      tags: [{ kind: "existing", id: "tag-3", name: "Done", color: "green" }],
      created: [],
    });
  });

  test("a later duplicate carrying create still creates", () => {
    const r = resolveTagRequests(
      [{ name: "Blocked" }, { name: "blocked", create: {} }],
      VOCAB,
    );
    expect(r.ok && r.created).toEqual(["Blocked"]);
  });

  test("a created name that is not storable is invalid", () => {
    const r = resolveTagRequests([{ name: "[WIP]", create: {} }], VOCAB);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.invalid.map((i) => i.name)).toEqual(["[WIP]"]);
  });
});
