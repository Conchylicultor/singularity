import { describe, expect, test } from "bun:test";
import type { Theme } from "@plugins/ui/plugins/theme-engine/core";
import type { ThemeSourceEntry } from "@plugins/ui/plugins/theme-engine/web";
import { buildThemeRows, residentRowKey, type ThemeRow } from "./theme-rows";

const PREVIEW = { light: { primary: "red" }, dark: { primary: "blue" } };

function theme(id: string, source: Theme["source"] = "custom"): Theme {
  return { id, label: id, source, fragments: [] };
}

function entry(
  id: string,
  extra: Partial<ThemeSourceEntry> = {},
): ThemeSourceEntry {
  return { id, label: id, tags: [], preview: PREVIEW, ...extra };
}

function build(input: {
  themes: Theme[];
  entries?: ThemeSourceEntry[];
  selections?: { scopeId: string | undefined; themeId: string }[];
}): ThemeRow[] {
  return buildThemeRows({
    themes: input.themes,
    browse: [{ sourceId: "community", entries: input.entries ?? [] }],
    selections: input.selections ?? [],
    scopeLabel: (scopeId) => scopeId ?? "Desktop",
    previewOf: () => PREVIEW,
  });
}

describe("buildThemeRows", () => {
  test("a resident theme is a saved row keyed by its id", () => {
    const [row] = build({ themes: [theme("default", "built-in")] });
    expect(row).toMatchObject({
      key: residentRowKey("default"),
      source: "built-in",
      saved: true,
      catalogs: [],
      target: { kind: "resident" },
    });
  });

  test("an unsaved catalog entry is a browse row from its source", () => {
    const rows = build({
      themes: [],
      entries: [entry("mint", { tags: ["cool"] })],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source: "community",
      catalogs: ["community"],
      tags: ["cool"],
      saved: false,
      target: { kind: "browse", sourceId: "community", entryId: "mint" },
    });
  });

  test("a saved catalog entry is one row: the resident theme, carrying the entry's tags and catalog", () => {
    const saved = theme("tweakcn:mint", "tweakcn");
    const rows = build({
      themes: [saved],
      entries: [entry("mint", { tags: ["cool"], savedThemeId: saved.id })],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      key: residentRowKey(saved.id),
      source: "tweakcn",
      catalogs: ["community"],
      tags: ["cool"],
      saved: true,
    });
  });

  test("a saved catalog theme keeps its catalog position; unlisted themes come first", () => {
    const saved = theme("tweakcn:b", "tweakcn");
    const rows = build({
      themes: [theme("default", "built-in"), saved, theme("custom:x")],
      entries: [entry("a"), entry("b", { savedThemeId: saved.id }), entry("c")],
    });
    expect(rows.map((r) => r.label)).toEqual([
      "default",
      "custom:x",
      "a",
      "tweakcn:b",
      "c",
    ]);
  });

  test("an entry pointing at a theme the list does not have yet stays a browse row", () => {
    const rows = build({
      themes: [],
      entries: [entry("mint", { savedThemeId: "tweakcn:mint" })],
    });
    expect(rows[0]).toMatchObject({ saved: false, target: { kind: "browse" } });
  });

  test("used-by names every scope that selects the theme", () => {
    const [row] = build({
      themes: [theme("custom:x")],
      selections: [
        { scopeId: undefined, themeId: "custom:x" },
        { scopeId: "app:mail", themeId: "custom:x" },
        { scopeId: "app:pages", themeId: "default" },
      ],
    });
    expect(row?.usedBy).toEqual([
      { scopeId: undefined, label: "Desktop" },
      { scopeId: "app:mail", label: "app:mail" },
    ]);
  });

  test("row keys of a resident theme and a catalog entry never collide", () => {
    const rows = build({
      themes: [theme("community/mint")],
      entries: [entry("mint")],
    });
    expect(new Set(rows.map((r) => r.key)).size).toBe(2);
  });
});
