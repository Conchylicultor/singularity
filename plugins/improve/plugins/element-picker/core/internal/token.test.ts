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
  return parseUiContext(match!);
}

test("round-trips the full lineage path through serialize/parse", () => {
  const meta: UiContextMeta = {
    url: "https://x.localhost:9000/tasks",
    pluginId: "improve/element-picker",
    slotId: "ActionBar.Item",
    paneId: "tasks-root",
    path: "tasks/task-header@TaskDetail.Section > improve/element-picker@ActionBar.Item",
    element: "button — Improve this app",
    selector: "div#root>header>button",
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
  // A single self-closing tag is matched whole despite the inner `>` chars.
  const matches = tag.match(UI_CONTEXT_RE);
  expect(matches).toHaveLength(1);
});

test("omits path/plugin/slot/selector when absent", () => {
  const tag = serializeUiContext({ url: "u", element: "div" });
  expect(tag).toBe(`<ui-context url="u" element="div" />`);
});
