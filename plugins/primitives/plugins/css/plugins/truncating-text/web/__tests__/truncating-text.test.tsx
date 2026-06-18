import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, render, fireEvent } from "@testing-library/react";
import { TruncatingText } from "../index";

afterEach(cleanup);

describe("TruncatingText", () => {
  it("end-side (default) truncates the tail with no direction override", () => {
    render(<TruncatingText data-testid="t">a/very/long/path.ts</TruncatingText>);
    const el = document.querySelector<HTMLElement>('[data-testid="t"]')!;
    expect(el.classList.contains("min-w-0")).toBe(true);
    expect(el.classList.contains("truncate")).toBe(true);
    expect(el.hasAttribute("dir")).toBe(false);
    // title auto-derived from string children.
    expect(el.getAttribute("title")).toBe("a/very/long/path.ts");
    // no inner ltr isolation wrapper for end-side.
    expect(el.querySelector('span[dir="ltr"]')).toBeNull();
  });

  it("start-side flips the ellipsis to the lead via the RTL technique", () => {
    render(
      <TruncatingText side="start" data-testid="t">
        a/very/long/path.ts
      </TruncatingText>,
    );
    const el = document.querySelector<HTMLElement>('[data-testid="t"]')!;
    // host laid out rtl so text-overflow clips at the visual start.
    expect(el.getAttribute("dir")).toBe("rtl");
    expect(el.classList.contains("truncate")).toBe(true);
    expect(el.classList.contains("text-left")).toBe(true);
    // children isolated in an ltr run so the path still reads left-to-right.
    const inner = el.querySelector<HTMLElement>('span[dir="ltr"]')!;
    expect(inner).not.toBeNull();
    expect(inner.textContent).toBe("a/very/long/path.ts");
  });

  it("can BE the interactive leaf via as=button + forwarded handlers", () => {
    const onClick = vi.fn();
    render(
      <TruncatingText
        as="button"
        side="start"
        onClick={onClick}
        title="full/path.ts"
        data-testid="t"
      >
        full/path.ts
      </TruncatingText>,
    );
    const el = document.querySelector<HTMLElement>('[data-testid="t"]')!;
    expect(el.tagName).toBe("BUTTON");
    // explicit title wins over the auto-derived one.
    expect(el.getAttribute("title")).toBe("full/path.ts");
    fireEvent.click(el);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
