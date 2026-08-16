// A heading block IS a heading in the accessibility tree — the behavioural spec.
//
// A page's `heading-1/2/3` blocks render as ordinary editable lines. Nothing in
// the DOM used to say "heading", so heading-jump — the primary way a screen
// reader user skims a document — did nothing on a page. A block type now
// declares `semantics` and the shared skeleton turns it into `role` /
// `aria-level` on its leaf cell. See the editor's CLAUDE.md, *A block type
// declares its ARIA identity*, and
// research/2026-08-16-page-block-aria-semantics.md.
//
// ## What this file renders, and what that does and does not cover
//
// It mounts `<TextBlockLayout>` directly — the same fixed skeleton both surfaces
// render every text block into — with a stand-in for the Lexical leaf, NOT the
// real `<BlockEditor>`. Mounting the editor here would need every block type
// registered plus Lexical and a Yjs binding per row in a layout-less DOM, which
// is why `block-selection.test.tsx` and `caret-authority.test.tsx` both stop at
// a fake block editor too.
//
// The leaf stand-in is where the fidelity has to be, so it mirrors what
// `BlockTextEditor` actually emits inside the leaf cell: a `role="textbox"`
// `contenteditable` holding the text, and — when the block is empty and focused
// — an `aria-hidden` placeholder div beside it. That is enough to exercise the
// thing genuinely at risk:
//
//   - the accessible NAME of a heading whose content is an embedded editing
//     host (the `heading` > `textbox` nesting the design deliberately chose over
//     putting the role on the `<ContentEditable>`);
//   - that the marker gutter and the four chrome regions sit OUTSIDE the leaf
//     cell, so nothing but the line's own text can name it;
//   - that the placeholder's `aria-hidden` keeps an empty focused heading from
//     being named "Heading 1" by its own placeholder.
//
// What it cannot cover: that Lexical's real DOM keeps that shape, and that a
// conversion into a heading makes the role appear without losing the caret.
// Both are `e2e/block-semantics-verify.ts`, in a real browser.

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { BlockSemantics } from "../../core";
import type { BlockRegionProps } from "../types";
import { TextBlockLayout } from "../components/text-block-layout";

afterEach(cleanup);

/** The blob every skeleton element is handed. Nothing under test reads it. */
function regionProps(id: string): BlockRegionProps {
  return {
    id,
    type: "page/text",
    pageId: "page-1",
    data: {},
    isFocused: false,
    ordinal: 1,
  };
}

/**
 * Stands in for `BlockTextEditor`, mirroring the DOM it puts inside the leaf
 * cell: Lexical's `<ContentEditable>` renders a `role="textbox"`
 * `contenteditable` div, and the placeholder is a sibling div that is only
 * present while the block is empty AND focused.
 */
function EditingHost({
  text,
  placeholder,
}: {
  text: string;
  placeholder?: string;
}) {
  return (
    <>
      <div role="textbox" contentEditable suppressContentEditableWarning>
        {text}
      </div>
      {placeholder != null ? <div aria-hidden>{placeholder}</div> : null}
    </>
  );
}

interface LineSpec {
  id: string;
  text: string;
  semantics?: BlockSemantics;
  /** The handle's marker glyph — a bullet, a number. Outside the leaf cell. */
  marker?: string;
  /** Only rendered when the block is empty and focused, as in the real editor. */
  placeholder?: string;
}

/** One block's line, rendered through the real shared skeleton. */
function Line({ id, text, semantics, marker, placeholder }: LineSpec) {
  return (
    <TextBlockLayout
      semantics={semantics}
      region={regionProps(id)}
      fallbackMarker={
        marker != null ? <span aria-hidden>{marker}</span> : undefined
      }
    >
      <EditingHost text={text} placeholder={placeholder} />
    </TextBlockLayout>
  );
}

/** The document under test: three headings and two things that are not. */
const PAGE: LineSpec[] = [
  { id: "b1", text: "H one", semantics: { role: "heading", level: 1 } },
  { id: "b2", text: "H two", semantics: { role: "heading", level: 2 } },
  { id: "b3", text: "H three", semantics: { role: "heading", level: 3 } },
  { id: "b4", text: "Just a paragraph" },
  // A bulleted list item: text-bearing, marked, and deliberately NOT a heading —
  // `listitem` needs an owning `list` the flat forest has nowhere to put.
  { id: "b5", text: "A bullet", marker: "•" },
];

function renderPage(lines: LineSpec[] = PAGE) {
  return render(
    <div role="group" aria-label="Page blocks">
      {lines.map((line) => (
        <Line key={line.id} {...line} />
      ))}
    </div>,
  );
}

describe("a heading block is a heading in the accessibility tree", () => {
  it("exposes each declared level, named by its own line", () => {
    const view = renderPage();

    expect(view.getByRole("heading", { level: 1, name: "H one" })).toBeTruthy();
    expect(view.getByRole("heading", { level: 2, name: "H two" })).toBeTruthy();
    expect(
      view.getByRole("heading", { level: 3, name: "H three" }),
    ).toBeTruthy();
  });

  it("makes headings of nothing else on the page", () => {
    const view = renderPage();

    // Five lines, three headings: a paragraph and a list item declare no
    // `semantics`, so they contribute no role at all.
    expect(view.queryAllByRole("heading")).toHaveLength(3);
    expect(
      view.queryByRole("heading", { name: "Just a paragraph" }),
    ).toBeNull();
    expect(view.queryByRole("heading", { name: "A bullet" })).toBeNull();
  });

  it("keeps the editing host inside the heading rather than replacing it", () => {
    // The role sits on the leaf CELL, not on the `<ContentEditable>`: a screen
    // reader must still be told the line is editable. `heading` does not make
    // its children presentational, which is the second rule the closed union
    // rests on — so the textbox survives inside it.
    const view = renderPage();

    const heading = view.getByRole("heading", { level: 2, name: "H two" });
    const textboxes = view.getAllByRole("textbox");
    expect(textboxes).toHaveLength(PAGE.length);
    expect(heading.querySelector('[role="textbox"]')).toBeTruthy();
  });

  it("is named by the line's text and nothing around it", () => {
    // The marker gutter, the four chrome regions and the row's `sr-only`
    // "Selected." marker all sit OUTSIDE the leaf cell. This is that claim, in
    // the one place it matters: a heading with a leading glyph must not be
    // named "• H four".
    const view = renderPage([
      {
        id: "b6",
        text: "H four",
        semantics: { role: "heading", level: 4 },
        marker: "•",
      },
    ]);

    expect(
      view.getByRole("heading", { level: 4, name: "H four" }),
    ).toBeTruthy();
  });

  it("does not let an empty focused heading be named by its placeholder", () => {
    // What `aria-hidden` on the placeholder buys. Without it the empty H1 is
    // announced as "Heading 1", i.e. named by decoration.
    const view = renderPage([
      {
        id: "b7",
        text: "",
        semantics: { role: "heading", level: 1 },
        placeholder: "Heading 1",
      },
    ]);

    expect(view.queryByRole("heading", { name: "Heading 1" })).toBeNull();
    expect(view.getByRole("heading", { level: 1, name: "" })).toBeTruthy();
  });
});
