import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import {
  inlineChips,
  renderInlineChip,
} from "@plugins/primitives/plugins/text-editor/plugins/inline-chip/web";
// The REAL chip: evaluating this plugin's barrel is what declares the one
// `<ui-context>` inline chip. No fixture re-declares it — that would be a second
// registration of the same token, and would pin a copy rather than the chip the
// app ships.
import "../index";

// The reported bug: a `<ui-context …>` token rendered as a chip while composing
// but printed as raw text once sent. The fix declares it as a transcript inline
// chip, so every read surface (user-text, assistant markdown) renders it through
// the inline-chip registry. This pins that the declared chip matches a
// realistic tag — whose `url=`/`selector=` attributes carry slashes and `>`
// chars — as ONE token, and renders it as the chip. (How a read surface walks
// its text for registered chips is active-data's own test.)

afterEach(cleanup);

function transcriptChip() {
  const chip = inlineChips("transcript").find((c) => c.id === "ui-context");
  if (!chip) throw new Error("the ui-context chip is not declared");
  return chip;
}

describe("ui-context renders as a chip on read surfaces", () => {
  const tag =
    '<ui-context url="http://x.localhost:9000/agents/c/conv-1781335518-caii" plugin="apps.sonata.track-mixer" selector="div>div>div"><hint>h</hint><picked-content>div — Track mixer</picked-content></ui-context>';

  it("is a transcript chip, never a document one", () => {
    expect(transcriptChip()).toBeDefined();
    expect(inlineChips("document").map((c) => c.id)).not.toContain(
      "ui-context",
    );
  });

  it("matches the whole tag as one token, slashes and `>` included", () => {
    const { pattern } = transcriptChip();
    const text = `Look at ${tag} please`;
    const matches = [...text.matchAll(new RegExp(pattern.source, "g"))].map(
      (m) => m[0],
    );
    expect(matches).toEqual([tag]);
  });

  it("renders the matched tag as the chip (label visible, tag text gone)", () => {
    const { container } = render(<div>{renderInlineChip(tag)}</div>);
    expect(container.textContent).toContain("div — Track mixer");
    expect(container.textContent).not.toContain("<ui-context");
    // The chip's trigger is a button.
    expect(container.querySelector("button")).not.toBeNull();
  });
});
