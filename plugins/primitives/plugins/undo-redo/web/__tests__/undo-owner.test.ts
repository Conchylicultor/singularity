import { describe, it, expect, afterEach } from "vitest";
import {
  resolveUndoOwner,
  surfaceUndoProps,
  localUndoProps,
  UNDO_OWNER_ATTR,
} from "../internal/undo-owner";

// The regression this file exists for: with the agent prompt focused and a page
// open beside it, ⌘Z used to undo BOTH — the prompt's own history and the page's
// last block edit. The surface binding fires on a window-level keydown, so the
// only thing that can keep it out of a text field is this resolution.

function mount(html: string): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = html;
  document.body.append(host);
  return host;
}

function at(host: HTMLElement, selector: string): Element {
  const el = host.querySelector(selector);
  if (!el) throw new Error(`no element matched ${selector}`);
  // jsdom parses `contenteditable` but never implements `isContentEditable`
  // (always false), so an editing host has to be declared here for the fixture
  // to mean in this environment what the markup means in a browser.
  if (el.getAttribute("contenteditable") === "true")
    Object.defineProperty(el, "isContentEditable", { value: true });
  return el;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("resolveUndoOwner", () => {
  it("spreads to the attribute the resolution reads", () => {
    expect(surfaceUndoProps).toEqual({ [UNDO_OWNER_ATTR]: "surface" });
    expect(localUndoProps).toEqual({ [UNDO_OWNER_ATTR]: "local" });
  });

  it("gives an undeclared text field its own history", () => {
    const host = mount(`
      <input id="title" type="text" />
      <textarea id="notes"></textarea>
      <div id="rich" contenteditable="true"></div>
    `);
    for (const id of ["#title", "#notes", "#rich"]) {
      expect(resolveUndoOwner(at(host, id))).toBe("local");
    }
  });

  it("gives undeclared chrome to the surface", () => {
    const host = mount(`
      <button id="btn">Delete</button>
      <input id="done" type="checkbox" />
      <input id="file" type="file" />
    `);
    // A checkbox and a file picker have no text history to protect, so ⌘Z right
    // after ticking one must still reach the surface stack.
    for (const id of ["#btn", "#done", "#file"]) {
      expect(resolveUndoOwner(at(host, id))).toBe("surface");
    }
    expect(resolveUndoOwner(document.body)).toBe("surface");
    expect(resolveUndoOwner(null)).toBe("surface");
  });

  it("gives a declared region's editables to the surface", () => {
    // The page block editor: every field inside it records on the surface stack,
    // so the caret being in an editing host must not withhold ⌘Z from it.
    const host = mount(`
      <div ${UNDO_OWNER_ATTR}="surface">
        <div id="block" contenteditable="true"></div>
        <textarea id="code"></textarea>
        <input id="url" type="text" />
      </div>
    `);
    for (const id of ["#block", "#code", "#url"]) {
      expect(resolveUndoOwner(at(host, id))).toBe("surface");
    }
  });

  it("lets a nested editor claim its own history back", () => {
    const host = mount(`
      <div ${UNDO_OWNER_ATTR}="surface">
        <div id="block" contenteditable="true"></div>
        <div ${UNDO_OWNER_ATTR}="local">
          <div id="prompt" contenteditable="true"><span id="leaf">hi</span></div>
        </div>
      </div>
    `);
    expect(resolveUndoOwner(at(host, "#block"))).toBe("surface");
    expect(resolveUndoOwner(at(host, "#prompt"))).toBe("local");
    // The nearest declaration wins from anywhere below it, not just on the host.
    expect(resolveUndoOwner(at(host, "#leaf"))).toBe("local");
  });

  it("refuses a hand-written owner rather than guessing one", () => {
    const host = mount(`<div ${UNDO_OWNER_ATTR}="page"><input id="x" /></div>`);
    expect(() => resolveUndoOwner(at(host, "#x"))).toThrow(/not an undo owner/);
  });
});
