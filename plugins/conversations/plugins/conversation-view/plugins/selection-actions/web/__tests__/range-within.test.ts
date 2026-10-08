import { afterEach, describe, expect, it } from "vitest";
import { rangeWithin } from "../internal/use-transcript-selection";

/** A scroller holding one agent paragraph, followed (outside it) by an overlay strip. */
function mount() {
  document.body.innerHTML = `
    <div id="frame">
      <div id="scroller"><div data-event-key="a"><p id="para">Last paragraph.</p></div></div>
      <div id="overlay">12k context</div>
    </div>`;
  const get = (id: string) => document.getElementById(id)!;
  return {
    scroller: get("scroller"),
    para: get("para"),
    overlay: get("overlay"),
  };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("rangeWithin", () => {
  it("cuts a triple-click that ends past the scroller back to its edge", () => {
    const { scroller, para, overlay } = mount();
    const range = document.createRange();
    range.setStart(para.firstChild!, 0);
    range.setEnd(overlay.firstChild!, 0);
    const clipped = rangeWithin(range, scroller);
    expect(clipped?.toString()).toBe("Last paragraph.");
  });

  it("drops overlay text a drag reaches into", () => {
    const { scroller, para, overlay } = mount();
    const range = document.createRange();
    range.setStart(para.firstChild!, 5);
    range.setEnd(overlay.firstChild!, 3);
    expect(rangeWithin(range, scroller)?.toString()).toBe("paragraph.");
  });

  it("is null for a selection entirely outside the scroller", () => {
    const { scroller, overlay } = mount();
    const range = document.createRange();
    range.selectNodeContents(overlay);
    expect(rangeWithin(range, scroller)).toBeNull();
  });

  it("keeps a selection already inside the scroller as is", () => {
    const { scroller, para } = mount();
    const range = document.createRange();
    range.setStart(para.firstChild!, 0);
    range.setEnd(para.firstChild!, 4);
    expect(rangeWithin(range, scroller)?.toString()).toBe("Last");
  });
});
