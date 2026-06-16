import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { RichText } from "@plugins/page/plugins/editor/core";
import { RunsRenderer } from "../components/runs-renderer";

// Focused unit pin for the faithful runs → React mapping. Page-link / inline-math
// tokens are exercised only through the live app (they need pagesResource / KaTeX
// providers); here we lock the mark / color / link / soft-break behavior, which is
// pure and provider-free.

afterEach(cleanup);

describe("RunsRenderer", () => {
  it("maps bold → <strong> and italic → <em>", () => {
    const runs: RichText = [{ text: "hi", marks: ["bold", "italic"] }];
    const { container } = render(<RunsRenderer value={runs} />);
    const strong = container.querySelector("strong");
    expect(strong).not.toBeNull();
    // italic nests inside bold (bold applied last / outermost).
    expect(strong!.querySelector("em")?.textContent).toBe("hi");
  });

  it("applies underline / strikethrough / code as classes", () => {
    const runs: RichText = [{ text: "x", marks: ["underline", "strikethrough", "code"] }];
    const { container } = render(<RunsRenderer value={runs} />);
    const span = container.querySelector("span");
    expect(span?.className).toContain("underline");
    expect(span?.className).toContain("line-through");
    expect(span?.className).toContain("font-mono");
  });

  it("renders a color run via the shared --rt-color-* var", () => {
    const runs: RichText = [{ text: "c", color: "blue" }];
    const { container } = render(<RunsRenderer value={runs} />);
    const span = container.querySelector("span");
    expect(span?.getAttribute("style")).toContain("var(--rt-color-blue)");
  });

  it("renders a link run as a non-editable anchor", () => {
    const runs: RichText = [{ text: "go", link: "https://example.com" }];
    const { container } = render(<RunsRenderer value={runs} />);
    const a = container.querySelector("a");
    expect(a?.getAttribute("href")).toBe("https://example.com");
    expect(a?.textContent).toBe("go");
  });

  it("coerces a legacy plain string and preserves soft breaks", () => {
    const { container } = render(<RunsRenderer value={"a\nb"} />);
    expect(container.querySelector("br")).not.toBeNull();
    expect(container.textContent).toBe("ab");
  });

  it("renders an unstyled run as bare text (no wrapper span)", () => {
    const runs: RichText = [{ text: "plain" }];
    const { container } = render(<RunsRenderer value={runs} />);
    expect(container.querySelector("span")).toBeNull();
    expect(container.textContent).toBe("plain");
  });
});
