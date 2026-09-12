import { afterEach, describe, expect, it } from "vitest";
import {
  installSelectionUnits,
  SELECTED_ATTR,
  selectedUnits,
} from "../internal/selection-units";

/**
 * Which elements a selection rings. The ring itself and the suppressed
 * per-character highlight are CSS a layout engine paints — not reproducible in
 * jsdom — so these pin the part that is ours: which elements get marked.
 */
function mount(html: string): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = html;
  document.body.append(host);
  return host;
}

function textNode(host: HTMLElement, text: string): Text {
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.textContent === text) return node as Text;
  }
  throw new Error(`no text node "${text}"`);
}

/** A range from the start of one text node to an offset in another. */
function span(
  host: HTMLElement,
  from: string,
  to: string,
  toOffset?: number,
): Range {
  const range = document.createRange();
  range.setStart(textNode(host, from), 0);
  const end = textNode(host, to);
  range.setEnd(end, toOffset ?? end.length);
  return range;
}

afterEach(() => {
  document.body.innerHTML = "";
  window.getSelection()?.removeAllRanges();
});

const PROSE =
  `<p>Some text ` +
  `<span data-copy-text="\`active-data\`"><button>active-data</button></span>` +
  ` other text</p>`;

describe("selectedUnits", () => {
  it("covers a chip the selection runs across", () => {
    const host = mount(PROSE);
    const units = selectedUnits(span(host, "Some text ", " other text"));
    expect(units.map((u) => u.getAttribute("data-copy-text"))).toEqual([
      "`active-data`",
    ]);
  });

  it("covers the WHOLE chip when the selection ends halfway into it", () => {
    // The copy of this selection carries the whole token, so the ring must too.
    const host = mount(PROSE);
    expect(
      selectedUnits(span(host, "Some text ", "active-data", 6)),
    ).toHaveLength(1);
  });

  it("does not cover a chip the selection merely ends against", () => {
    const host = mount(PROSE);
    expect(selectedUnits(span(host, "Some text ", "Some text "))).toEqual([]);
  });

  it("ignores a collapsed selection", () => {
    const host = mount(PROSE);
    const range = span(host, "Some text ", " other text");
    range.collapse(true);
    expect(selectedUnits(range)).toEqual([]);
  });

  it("leaves an element that substitutes nothing to the native highlight", () => {
    // `copiesAsOwnText` (every Badge): its own letters are what it copies.
    const host = mount(
      `<p>status <span data-copy-text=""><span>running</span></span> now</p>`,
    );
    expect(selectedUnits(span(host, "status ", " now"))).toEqual([]);
  });

  it("leaves chips inside an editor to the editor", () => {
    const host = mount(`<div contenteditable="true">${PROSE}</div>`);
    expect(selectedUnits(span(host, "Some text ", " other text"))).toEqual([]);
  });
});

describe("installSelectionUnits", () => {
  it("marks the covered chip on selectionchange and clears it after", () => {
    const host = mount(PROSE);
    const chip = host.querySelector("[data-copy-text]")!;
    const uninstall = installSelectionUnits();
    const selection = window.getSelection()!;

    selection.addRange(span(host, "Some text ", " other text"));
    document.dispatchEvent(new Event("selectionchange"));
    expect(chip.hasAttribute(SELECTED_ATTR)).toBe(true);

    selection.removeAllRanges();
    document.dispatchEvent(new Event("selectionchange"));
    expect(chip.hasAttribute(SELECTED_ATTR)).toBe(false);

    selection.addRange(span(host, "Some text ", " other text"));
    document.dispatchEvent(new Event("selectionchange"));
    uninstall();
    expect(chip.hasAttribute(SELECTED_ATTR)).toBe(false);
  });
});
