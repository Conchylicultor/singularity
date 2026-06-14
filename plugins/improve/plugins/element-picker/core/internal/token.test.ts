import { expect, test } from "bun:test";
import {
  parseUiContext,
  serializeUiContext,
  UI_CONTEXT_RE,
  type UiContextMeta,
} from "./token";

function roundTrip(meta: UiContextMeta): UiContextMeta | null {
  const tag = serializeUiContext(meta);
  const re = new RegExp(UI_CONTEXT_RE.source, UI_CONTEXT_RE.flags);
  const match = re.exec(tag);
  expect(match).not.toBeNull();
  return parseUiContext(match![0]);
}

test("round-trips the full lineage path through serialize/parse", () => {
  const meta: UiContextMeta = {
    url: "https://x.localhost:9000/tasks",
    pluginId: "improve/element-picker",
    slotId: "ActionBar.Item",
    contributionId: "improve/element-picker:element-picker",
    paneId: "tasks-root",
    path: "tasks/task-header@TaskDetail.Section > improve/element-picker@ActionBar.Item",
    element: "button — Improve this app",
    selector: "div#root>header>button",
    source: "plugins/foo/web/components/bar.tsx:42",
  };
  expect(roundTrip(meta)).toEqual(meta);
});

test("path containing `>` does not break the tag regex", () => {
  const tag = serializeUiContext({
    url: "u",
    path: "a@S1 > b@S2",
    element: "button",
    selector: "div>div>div",
  });
  // A single tag is matched whole despite the inner `>` chars in attributes and
  // the `<` chars from the nested <hint>/<picked-content> body tags.
  const matches = tag.match(UI_CONTEXT_RE);
  expect(matches).toHaveLength(1);
});

test("splits the constant hint from the per-pick content in the body", () => {
  const tag = serializeUiContext({ url: "u", element: "div — My label" });
  expect(tag).toBe(
    `<ui-context url="u">` +
      `<hint>The user pointed at this element in the live app using the element-picker inspector; it is the UI element their request refers to.</hint>` +
      `<picked-content>div — My label</picked-content>` +
      `</ui-context>`,
  );
});

test("parses legacy flat-body tags (pre <hint>/<picked-content> split)", () => {
  const legacy =
    `<ui-context url="u">The user pointed at this element in the live app using the element-picker inspector; it is the UI element their request refers to. Picked element: div — Old label</ui-context>`;
  const re = new RegExp(UI_CONTEXT_RE.source, UI_CONTEXT_RE.flags);
  const match = re.exec(legacy);
  expect(match).not.toBeNull();
  expect(parseUiContext(match![0])).toEqual({ url: "u", element: "div — Old label" });
});
