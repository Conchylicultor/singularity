import { describe, expect, test } from "bun:test";
import { boolField } from "@plugins/fields/plugins/bool/plugins/config/core";
import { textField } from "@plugins/fields/plugins/text/plugins/config/core";
import { listField } from "@plugins/fields/plugins/list/plugins/config/core";
import type { FieldsRecord } from "@plugins/fields/core";
import { computeFieldTiers, configDocumentsAgree } from "./field-tiers";

const fields = {
  enabled: boolField({ label: "Enabled", default: true }),
  name: textField({ label: "Name", default: "base" }),
  items: listField({
    label: "Items",
    itemFields: { title: textField({ label: "Title" }) },
  }),
} satisfies FieldsRecord;

const defaults = { enabled: true, name: "base", items: [] };

describe("computeFieldTiers", () => {
  test("a committed authored override reads git, not modified", () => {
    // The propagated origin carries what the repo commits; nothing is overridden
    // in this worktree. This is the headline bug: it used to read "user" for
    // every field the committed override touched.
    const tiers = computeFieldTiers({
      fields,
      defaults,
      layer: "git",
      originContent: { enabled: false, name: "base", items: [] },
      overrideContent: null,
    });
    expect(tiers).toEqual({
      enabled: "git",
      name: "default",
      items: "default",
    });
  });

  test("a build-materialized origin (reorder) reads git even though the declared default is empty", () => {
    const tiers = computeFieldTiers({
      fields,
      defaults,
      layer: "git",
      originContent: {
        enabled: true,
        name: "base",
        items: [{ title: "a" }, { title: "b" }],
      },
      overrideContent: null,
    });
    expect(tiers.items).toBe("git");
  });

  test("only the key the user actually changed reads user", () => {
    const tiers = computeFieldTiers({
      fields,
      defaults,
      layer: "user",
      originContent: { enabled: false, name: "base", items: [] },
      overrideContent: { enabled: false, name: "mine", items: [] },
    });
    expect(tiers).toEqual({ enabled: "git", name: "user", items: "default" });
  });

  test("an untouched list beside a touched scalar is not modified by its synthesized ids", () => {
    // The user override is normalized on write, so its rows carry `auto-` ids;
    // the propagated base origin is byte-wise from git and carries none.
    const tiers = computeFieldTiers({
      fields,
      defaults,
      layer: "user",
      originContent: { enabled: true, name: "base", items: [{ title: "a" }] },
      overrideContent: {
        enabled: false,
        name: "base",
        items: [{ title: "a", id: "auto-deadbeef" }],
      },
    });
    expect(tiers).toEqual({ enabled: "user", name: "default", items: "git" });
  });

  test("a stableIdentity list compares its ids", () => {
    const stable = {
      items: listField({
        label: "Items",
        stableIdentity: true,
        itemFields: { title: textField({ label: "Title" }) },
      }),
    } satisfies FieldsRecord;
    const tiers = computeFieldTiers({
      fields: stable,
      defaults: { items: [] },
      layer: "user",
      originContent: { items: [{ id: "one", title: "a" }] },
      overrideContent: { items: [{ id: "two", title: "a" }] },
    });
    expect(tiers.items).toBe("user");
  });

  test("a losing override modifies nothing", () => {
    // A foreign / stale / schema-invalid override is one the runtime resolves
    // past, and it differs from the origin in every key. Reading those as edits
    // marked every field of such a config modified and offered a Reset for each.
    const tiers = computeFieldTiers({
      fields,
      defaults,
      layer: "git",
      originContent: { enabled: true, name: "base", items: [] },
      overrideContent: { order: ["a"], hidden: [] },
    });
    expect(tiers).toEqual({
      enabled: "default",
      name: "default",
      items: "default",
    });
  });

  test("a key the override omits falls through to the git comparison", () => {
    const tiers = computeFieldTiers({
      fields,
      defaults,
      layer: "user",
      originContent: { enabled: false, name: "base", items: [] },
      overrideContent: { name: "mine" },
    });
    expect(tiers).toEqual({ enabled: "git", name: "user", items: "default" });
  });

  test("no origin at all leaves everything at the code default", () => {
    const tiers = computeFieldTiers({
      fields,
      defaults,
      layer: "default",
      originContent: null,
      overrideContent: null,
    });
    expect(tiers).toEqual({
      enabled: "default",
      name: "default",
      items: "default",
    });
  });
});

describe("configDocumentsAgree", () => {
  test("ignores synthesized row ids and key order", () => {
    expect(
      configDocumentsAgree(
        { name: "base", items: [{ title: "a", id: "auto-1" }], enabled: true },
        { enabled: true, name: "base", items: [{ title: "a" }] },
        fields,
      ),
    ).toBe(true);
  });

  test("sees a real difference", () => {
    expect(
      configDocumentsAgree(
        { enabled: true, name: "mine", items: [] },
        { enabled: true, name: "base", items: [] },
        fields,
      ),
    ).toBe(false);
  });
});
