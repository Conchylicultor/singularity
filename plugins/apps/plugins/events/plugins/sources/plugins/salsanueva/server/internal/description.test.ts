import { describe, expect, it } from "bun:test";
import { courseDescription } from "./description";

describe("courseDescription", () => {
  it("keeps the prose out of the markup it was pasted in", () => {
    // Abridged from a live row whose blurb arrived wrapped in an entire chat
    // transcript's DOM.
    expect(
      courseDescription(
        '<div class="qMYqUG"><section data-testid="turn"><p data-start="0">' +
          "Le Dancehall est une danse jamaïcaine énergique.<br />Les cours " +
          "développent la coordination.</p></section></div>",
      ),
    ).toBe(
      "Le Dancehall est une danse jamaïcaine énergique.\nLes cours développent la coordination.",
    );
  });

  it("decodes entities exactly once", () => {
    expect(courseDescription("<p>l&#39;énergie &amp; le groove</p>")).toBe(
      "l'énergie & le groove",
    );
  });

  it("answers nothing for a blurb with no text in it", () => {
    expect(courseDescription(undefined)).toBeUndefined();
    expect(courseDescription("<div><span></span></div>")).toBeUndefined();
  });
});
