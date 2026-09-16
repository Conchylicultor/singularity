import { describe, expect, it } from "vitest";
import {
  hasTextLeftToSelect,
  isSelectAllKey,
} from "../internal/select-all-ladder";

const key = (over: Partial<Parameters<typeof isSelectAllKey>[0]>) => ({
  key: "a",
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...over,
});

function textarea(value: string, start: number, end: number) {
  const el = document.createElement("textarea");
  el.value = value;
  el.setSelectionRange(start, end);
  return el;
}

describe("isSelectAllKey", () => {
  it("is Cmd+A or Ctrl+A, either case", () => {
    expect(isSelectAllKey(key({ metaKey: true }))).toBe(true);
    expect(isSelectAllKey(key({ ctrlKey: true, key: "A" }))).toBe(true);
  });

  it("is not a plain a, nor one with another modifier", () => {
    expect(isSelectAllKey(key({}))).toBe(false);
    expect(isSelectAllKey(key({ metaKey: true, shiftKey: true }))).toBe(false);
    expect(isSelectAllKey(key({ ctrlKey: true, altKey: true }))).toBe(false);
  });
});

describe("hasTextLeftToSelect", () => {
  it("a text control with unselected text keeps the press", () => {
    expect(hasTextLeftToSelect(textarea("x = 1", 2, 2))).toBe(true);
    expect(hasTextLeftToSelect(textarea("x = 1", 0, 3))).toBe(true);
  });

  it("an empty or fully selected text control has nothing left", () => {
    expect(hasTextLeftToSelect(textarea("", 0, 0))).toBe(false);
    expect(hasTextLeftToSelect(textarea("x = 1", 0, 5))).toBe(false);
  });

  it("a non-text target has nothing to select", () => {
    expect(hasTextLeftToSelect(document.createElement("button"))).toBe(false);
    const box = document.createElement("input");
    box.type = "checkbox";
    expect(hasTextLeftToSelect(box)).toBe(false);
    expect(hasTextLeftToSelect(null)).toBe(false);
  });
});
