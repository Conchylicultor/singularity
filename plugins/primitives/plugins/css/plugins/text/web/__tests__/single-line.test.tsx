import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, render, fireEvent } from "@testing-library/react";
import { SingleLineProvider } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Text } from "../index";

afterEach(cleanup);

// `Text` truncates to a single line ONLY inside a `SingleLine` context (provided by
// line containers — Frame/Row/Bar/collapsible headers). These tests drive the
// context explicitly via `<SingleLineProvider>` (what those containers do).
describe("Text single-line context", () => {
  it("does NOT truncate outside a single-line context (flow default)", () => {
    render(
      <Text variant="body" data-testid="t">
        a/very/long/path.ts
      </Text>,
    );
    const el = document.querySelector<HTMLElement>('[data-testid="t"]')!;
    expect(el.classList.contains("truncate")).toBe(false);
    expect(el.classList.contains("min-w-0")).toBe(false);
    // No auto-title outside a single-line context (a wrapping paragraph).
    expect(el.hasAttribute("title")).toBe(false);
  });

  it("end-side (default) truncates the tail inside a single-line context", () => {
    render(
      <SingleLineProvider value={true}>
        <Text data-testid="t">a/very/long/path.ts</Text>
      </SingleLineProvider>,
    );
    const el = document.querySelector<HTMLElement>('[data-testid="t"]')!;
    expect(el.classList.contains("min-w-0")).toBe(true);
    expect(el.classList.contains("truncate")).toBe(true);
    // block + max-w-full make truncation honored regardless of parent display
    // context (not just as a flex/grid item), capped at the container.
    expect(el.classList.contains("block")).toBe(true);
    expect(el.classList.contains("max-w-full")).toBe(true);
    expect(el.hasAttribute("dir")).toBe(false);
    // title auto-derived from string children.
    expect(el.getAttribute("title")).toBe("a/very/long/path.ts");
    // no inner ltr isolation wrapper for end-side.
    expect(el.querySelector('span[dir="ltr"]')).toBeNull();
  });

  it("start-side flips the ellipsis to the lead via the RTL technique", () => {
    render(
      <SingleLineProvider value={true}>
        <Text side="start" data-testid="t">
          a/very/long/path.ts
        </Text>
      </SingleLineProvider>,
    );
    const el = document.querySelector<HTMLElement>('[data-testid="t"]')!;
    // host laid out rtl so text-overflow clips at the visual start.
    expect(el.getAttribute("dir")).toBe("rtl");
    expect(el.classList.contains("truncate")).toBe(true);
    expect(el.classList.contains("text-left")).toBe(true);
    // same parent-context-independent truncation guarantee as the end side —
    // and the same block-level box, so an RTL leaf does not re-inflate its cell.
    expect(el.classList.contains("block")).toBe(true);
    expect(el.classList.contains("w-fit")).toBe(true);
    expect(el.classList.contains("inline-block")).toBe(false);
    expect(el.classList.contains("max-w-full")).toBe(true);
    // children isolated in an ltr run so the path still reads left-to-right.
    const inner = el.querySelector<HTMLElement>('span[dir="ltr"]')!;
    expect(inner).not.toBeNull();
    expect(inner.textContent).toBe("a/very/long/path.ts");
  });

  // The leaf is BLOCK-level, never inline-block, and this is the assertion that
  // says so. An inline-level box with `overflow:hidden` gives its line the bottom
  // of its own margin box as a baseline, so a plain block parent (`<Fill>`) still
  // reserved its strut's descender below it and came out ~6px taller than the
  // words — which is what tipped every `Line > Icon + Fill(Text)` row's icon ~3px
  // below its own title. `w-fit` is the other half: it keeps the shrink-to-fit
  // width inline-block used to give, so a hover underline still ends at the words.
  it("uses a block-level shrink-to-fit box, so the parent's height is the text's", () => {
    render(
      <SingleLineProvider value={true}>
        <Text data-testid="t">a/very/long/path.ts</Text>
      </SingleLineProvider>,
    );
    const el = document.querySelector<HTMLElement>('[data-testid="t"]')!;
    expect(el.classList.contains("block")).toBe(true);
    expect(el.classList.contains("inline-block")).toBe(false);
    expect(el.classList.contains("w-fit")).toBe(true);
  });

  it("can BE the interactive leaf via as=button + forwarded handlers", () => {
    const onClick = vi.fn();
    render(
      <SingleLineProvider value={true}>
        <Text
          as="button"
          side="start"
          onClick={onClick}
          title="full/path.ts"
          data-testid="t"
        >
          full/path.ts
        </Text>
      </SingleLineProvider>,
    );
    const el = document.querySelector<HTMLElement>('[data-testid="t"]')!;
    expect(el.tagName).toBe("BUTTON");
    // explicit title wins over the auto-derived one.
    expect(el.getAttribute("title")).toBe("full/path.ts");
    fireEvent.click(el);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
