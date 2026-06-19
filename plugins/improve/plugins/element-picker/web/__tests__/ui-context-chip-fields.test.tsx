import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, fireEvent } from "@testing-library/react";
import { UI_CONTEXT_FIELDS, type UiContextMeta } from "../../core";
import { UiContextChip } from "../components/ui-context-chip";

afterEach(cleanup);

// Every field the tag can carry, so the popover must surface all of them.
const meta: UiContextMeta = {
  url: "http://x.localhost:9000/sonata/song/abc",
  pluginId: "apps.sonata.piano-roll",
  slotId: "sonata.toolbar.end",
  contributionId: "apps.sonata.piano-roll:spread",
  paneId: "sonata-player",
  path: "apps.sonata.shell@apps.app > apps.sonata.piano-roll@sonata.toolbar.end",
  element: "div — 1×",
  selector: "header>div>div",
  source: "plugins/foo/web/bar.tsx:42",
  owner: "SpreadWheel@plugins/.../spread-wheel.tsx:52",
};

describe("ui-context chip popover shows every registry field", () => {
  it("renders one labelled row per UI_CONTEXT_FIELDS entry", () => {
    const { getByRole, getByText } = render(<UiContextChip meta={meta} />);
    // Open the popover.
    fireEvent.click(getByRole("button"));
    // The guarantee: no field can be silently dropped from the display.
    for (const f of UI_CONTEXT_FIELDS) {
      expect(getByText(f.label)).toBeTruthy();
      expect(getByText(String(meta[f.key]))).toBeTruthy();
    }
  });
});
