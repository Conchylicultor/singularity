import { describe, it, expect } from "vitest";
import { applyCopySources } from "../internal/rewrite";

/**
 * The substitution rule, on its own. What a browser then makes of the rewritten
 * fragment (block newlines, list markers) is the layout engine's business and is
 * not reproducible in jsdom — these pin the part that IS ours: which element
 * gets replaced, and by which text.
 */
function fragmentOf(html: string): DocumentFragment {
  return document.createRange().createContextualFragment(html);
}

function textOf(fragment: DocumentFragment): string {
  const host = document.createElement("div");
  host.append(fragment);
  return host.textContent ?? "";
}

describe("applyCopySources", () => {
  it("puts back the source text a rendering replaced", () => {
    const fragment = fragmentOf(
      `in <button data-copy-text="\`control-panel\`">control-panel</button> here`,
    );
    expect(applyCopySources(fragment)).toBe(1);
    expect(textOf(fragment)).toBe("in `control-panel` here");
  });

  it("falls back to the element's own text when the declaration is empty", () => {
    const fragment = fragmentOf(
      `status <span data-copy-text=""><svg></svg><span>running</span></span> now`,
    );
    expect(applyCopySources(fragment)).toBe(1);
    expect(textOf(fragment)).toBe("status running now");
  });

  it("resolves nesting outward: the outer declaration wins, once", () => {
    // An active-data chip (declares its source token) rendering through a Badge
    // (declares "my own text"). The token must survive, and the Badge inside it
    // must not also contribute.
    const fragment = fragmentOf(
      `see <span data-copy-text="conv-1777406728-mb12">` +
        `<span data-copy-text=""><svg></svg><span>conv-1777406728-mb12</span></span>` +
        `</span> ok`,
    );
    expect(applyCopySources(fragment)).toBe(1);
    expect(textOf(fragment)).toBe("see conv-1777406728-mb12 ok");
  });

  it("replaces every declaring element in the selection", () => {
    const fragment = fragmentOf(
      `<span data-copy-text="\`a\`">a</span> and <span data-copy-text="\`b\`">b</span>`,
    );
    expect(applyCopySources(fragment)).toBe(2);
    expect(textOf(fragment)).toBe("`a` and `b`");
  });

  it("reports nothing to do, so the caller can leave the native copy alone", () => {
    const fragment = fragmentOf(`<p>plain prose, no chips</p>`);
    expect(applyCopySources(fragment)).toBe(0);
    expect(textOf(fragment)).toBe("plain prose, no chips");
  });
});
