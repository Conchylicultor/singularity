import { expect, test } from "bun:test";
import { splitUiContext, type UiContextSegment } from "./split";
import { serializeUiContext, UI_CONTEXT_RE, type UiContextMeta } from "./token";

const HEADLINE: UiContextMeta = {
  url: "https://equin.ai/",
  path: "apps/website/home#pane:home > apps/website/hero@Website.Section",
  element: "h1 — What will apps evolve into?",
  selector: "main>section>h1",
  source: "plugins/apps/plugins/website/plugins/hero/web/hero.tsx:42",
};
const BUTTON: UiContextMeta = { url: "u", element: "button — Show me" };

const joined = (segments: UiContextSegment[]) =>
  segments.map((s) => (s.kind === "text" ? s.text : s.raw)).join("");

test("cuts prose and tags apart, in reading order, with each tag parsed", () => {
  const headline = serializeUiContext(HEADLINE, "picked");
  const button = serializeUiContext(BUTTON, "picked");
  const text = `Make ${headline} bigger,\nand ${button} blue.`;
  expect(splitUiContext(text)).toEqual([
    { kind: "text", text: "Make " },
    { kind: "tag", raw: headline, meta: HEADLINE },
    { kind: "text", text: " bigger,\nand " },
    { kind: "tag", raw: button, meta: BUTTON },
    { kind: "text", text: " blue." },
  ]);
});

test("gives back the text exactly when joined, and never an empty text run", () => {
  const a = serializeUiContext(HEADLINE, "picked");
  const b = serializeUiContext(BUTTON, "crash");
  const text = `${a}${b}`;
  const segments = splitUiContext(text);
  expect(segments.map((s) => s.kind)).toEqual(["tag", "tag"]);
  expect(joined(segments)).toBe(text);
});

test("a text with no tag is one prose run; an empty text is none", () => {
  expect(splitUiContext("just words")).toEqual([
    { kind: "text", text: "just words" },
  ]);
  expect(splitUiContext("")).toEqual([]);
});

test("a tag the parser refuses is its own arm, not prose and not dropped", () => {
  // The outline matches, but there is no url: parseUiContext says no.
  const raw = `<ui-context plugin="p"><hint>h</hint><picked-content>div</picked-content></ui-context>`;
  const segments = splitUiContext(`see ${raw}`);
  expect(segments).toEqual([
    { kind: "text", text: "see " },
    { kind: "malformed", raw },
  ]);
});

test("is not thrown off by a caller who left the shared pattern mid-scan", () => {
  const tag = serializeUiContext(BUTTON, "picked");
  UI_CONTEXT_RE.lastIndex = 5;
  try {
    expect(splitUiContext(tag)).toEqual([
      { kind: "tag", raw: tag, meta: BUTTON },
    ]);
  } finally {
    UI_CONTEXT_RE.lastIndex = 0;
  }
});
