import { expect, test } from "bun:test";
import {
  formatElementDescriptor,
  parseElementDescriptor,
  uiContextLabel,
  type ElementDescriptor,
} from "./element";

const url = "http://x.localhost:9000/";

test("descriptor round-trips through format/parse", () => {
  const cases: ElementDescriptor[] = [
    { tag: "button", name: "Attach UI element" },
    { tag: "div", role: "tab", name: "Files — and more" },
    { tag: "input", type: "checkbox" },
    { tag: "span" },
  ];
  for (const d of cases) {
    expect(parseElementDescriptor(formatElementDescriptor(d))).toEqual(d);
  }
});

test("a crash token's free-text body is not a descriptor", () => {
  expect(parseElementDescriptor("TaskDetail.Section / Header")).toBeNull();
  expect(uiContextLabel({ url, element: "Plugin" })).toEqual({
    title: "Plugin",
  });
});

test("a named element reads as its name, with its kind", () => {
  expect(
    uiContextLabel({ url, element: "button — Attach UI element" }),
  ).toEqual({ title: "Attach UI element", kind: "Button" });
  expect(uiContextLabel({ url, element: "div[role=tab] — Files" })).toEqual({
    title: "Files",
    kind: "Tab",
  });
  expect(uiContextLabel({ url, element: "div — 1×" })).toEqual({
    title: "1×",
    kind: "Element",
  });
});

test("an unnamed element reads as what it is, else who owns it", () => {
  expect(uiContextLabel({ url, element: "input[type=checkbox]" })).toEqual({
    title: "Checkbox",
  });
  expect(
    uiContextLabel({
      url,
      element: "div",
      owner: "SpreadWheel@plugins/x/spread-wheel.tsx:52",
    }),
  ).toEqual({ title: "Spread wheel" });
  expect(
    uiContextLabel({
      url,
      element: "div",
      path: "apps.sonata#pane:sonata-player[column 2 of 2] > improve.element-picker@tasks.task-draft-form.action",
      contributionId: "improve.element-picker:element-picker",
    }),
  ).toEqual({ title: "Element picker" });
  expect(
    uiContextLabel({
      url,
      element: "span",
      path: "apps.sonata#pane:sonata-player[column 2 of 2]",
    }),
  ).toEqual({ title: "Sonata player" });
  expect(uiContextLabel({ url, element: "span" })).toEqual({
    title: "Element",
  });
});
