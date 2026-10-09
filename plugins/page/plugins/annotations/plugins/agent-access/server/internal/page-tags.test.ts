import { describe, expect, test } from "bun:test";
import type { ParsedPageMeta } from "@plugins/page/plugins/markdown-apply/core";
import {
  BRACKET_STATUS_PREFIX,
  metaFactsChanged,
  tagRequestsOf,
} from "./page-tags";

const meta = (tags: ParsedPageMeta["tags"]): ParsedPageMeta => ({
  attrs: { created: "x", edited: "y" },
  breadcrumb: [{ id: "block-1", title: "Page" }],
  backlinks: [],
  tags,
});
const tag = (name: string, attrs: Record<string, string> = {}) => ({
  name,
  attrs,
});

describe("tagRequestsOf", () => {
  test("the same list, up to case and spacing, is no change", () => {
    expect(
      tagRequestsOf(meta([tag("In progress")]), meta([tag(" in  PROGRESS")])),
    ).toBeNull();
  });

  test("no <tags> section, or no header, is no change", () => {
    expect(tagRequestsOf(meta([tag("Done")]), meta(null))).toBeNull();
    expect(tagRequestsOf(meta([tag("Done")]), null)).toBeNull();
  });

  test("a reorder is a change", () => {
    expect(
      tagRequestsOf(meta([tag("A"), tag("B")]), meta([tag("B"), tag("A")])),
    ).toEqual({ ok: true, requests: [{ name: "B" }, { name: "A" }] });
  });

  test("clearing the list is a change to []", () => {
    expect(tagRequestsOf(meta([tag("A")]), meta([]))).toEqual({
      ok: true,
      requests: [],
    });
  });

  test("new and color become a create request", () => {
    expect(
      tagRequestsOf(
        meta([]),
        meta([tag("Blocked", { new: "true", color: "red" })]),
      ),
    ).toEqual({
      ok: true,
      requests: [{ name: "Blocked", create: { color: "red" } }],
    });
  });

  test("an attribute on an unchanged name still counts as a change", () => {
    const r = tagRequestsOf(
      meta([tag("Done")]),
      meta([tag("Done", { new: "true" })]),
    );
    expect(r).toEqual({ ok: true, requests: [{ name: "Done", create: {} }] });
  });

  test('new must be "true"', () => {
    expect(tagRequestsOf(meta([]), meta([tag("X", { new: "yes" })]))?.ok).toBe(
      false,
    );
  });

  test("color without new, or an unknown color, is refused", () => {
    expect(
      tagRequestsOf(meta([]), meta([tag("X", { color: "red" })]))?.ok,
    ).toBe(false);
    expect(
      tagRequestsOf(meta([]), meta([tag("X", { new: "true", color: "teal" })]))
        ?.ok,
    ).toBe(false);
  });
});

describe("metaFactsChanged", () => {
  test("a tags-only change is not a change of the read-only facts", () => {
    expect(metaFactsChanged(meta([]), meta([tag("A")]))).toBe(false);
  });

  test("an edited breadcrumb title is", () => {
    const next = meta([]);
    next.breadcrumb = [{ id: "block-1", title: "Renamed" }];
    expect(metaFactsChanged(meta([]), next)).toBe(true);
  });
});

describe("BRACKET_STATUS_PREFIX", () => {
  test("matches a status prefix, not a bracket later in the title", () => {
    expect(BRACKET_STATUS_PREFIX.test("[In progress] Cold start")).toBe(true);
    expect(BRACKET_STATUS_PREFIX.test("[Done]")).toBe(true);
    expect(BRACKET_STATUS_PREFIX.test("Cold start [v2]")).toBe(false);
    expect(BRACKET_STATUS_PREFIX.test("[x]y")).toBe(false);
  });
});
