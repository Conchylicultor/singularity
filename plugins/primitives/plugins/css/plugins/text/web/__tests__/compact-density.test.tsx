import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { ControlSizeProvider } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Text } from "../index";

afterEach(cleanup);

// `Text` type size tracks the ambient `ControlSize` via the single density→text
// policy (`textStepFor`): only the compact `xs` density drops a rung, swapping
// each variant for its weight-preserving `-compact` form. sm/md/lg keep the
// comfortable size. These tests drive the density explicitly via
// `<ControlSizeProvider>` (what a DataTable / tree row / compact Card does).
describe("Text compact density", () => {
  it("swaps to the -compact variant under size=xs", () => {
    render(
      <ControlSizeProvider size="xs">
        <Text variant="heading" data-testid="t">
          Heading
        </Text>
      </ControlSizeProvider>,
    );
    const el = document.querySelector<HTMLElement>('[data-testid="t"]')!;
    expect(el.classList.contains("text-heading-compact")).toBe(true);
    expect(el.classList.contains("text-heading")).toBe(false);
  });

  it("keeps the comfortable variant under size=sm", () => {
    render(
      <ControlSizeProvider size="sm">
        <Text variant="heading" data-testid="t">
          Heading
        </Text>
      </ControlSizeProvider>,
    );
    const el = document.querySelector<HTMLElement>('[data-testid="t"]')!;
    expect(el.classList.contains("text-heading")).toBe(true);
    expect(el.classList.contains("text-heading-compact")).toBe(false);
  });

  it("keeps the comfortable variant under size=md (the default tier)", () => {
    render(
      <ControlSizeProvider size="md">
        <Text variant="heading" data-testid="t">
          Heading
        </Text>
      </ControlSizeProvider>,
    );
    const el = document.querySelector<HTMLElement>('[data-testid="t"]')!;
    expect(el.classList.contains("text-heading")).toBe(true);
    expect(el.classList.contains("text-heading-compact")).toBe(false);
  });

  it("gives the tag role its OWN compact rung, keeping the tag weight", () => {
    render(
      <>
        <Text variant="tag" data-testid="md">
          chip
        </Text>
        <ControlSizeProvider size="xs">
          <Text variant="tag" data-testid="xs">
            chip
          </Text>
        </ControlSizeProvider>
      </>,
    );
    const md = document.querySelector<HTMLElement>('[data-testid="md"]')!;
    const xs = document.querySelector<HTMLElement>('[data-testid="xs"]')!;
    expect([...md.classList]).toEqual(
      expect.arrayContaining(["text-tag", "font-tag"]),
    );
    expect([...xs.classList]).toEqual(
      expect.arrayContaining(["text-tag-compact", "font-tag"]),
    );
    expect(xs.classList.contains("text-tag")).toBe(false);
  });

  it("renders count as the compact control rung with tabular figures at every density", () => {
    render(
      <>
        <Text variant="count" data-testid="md">
          3
        </Text>
        <ControlSizeProvider size="xs">
          <Text variant="count" data-testid="xs">
            3
          </Text>
        </ControlSizeProvider>
      </>,
    );
    for (const id of ["md", "xs"]) {
      const el = document.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
      expect([...el.classList]).toEqual(
        expect.arrayContaining(["text-control-compact", "tabular-nums"]),
      );
    }
  });
});
