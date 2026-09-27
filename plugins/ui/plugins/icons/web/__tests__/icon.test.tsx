import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { brand, symbol } from "../../core/icon-ref";
import type { IconStyle } from "../../core/style";
import { Icon } from "../internal/icon";
import { IconScopeProvider } from "../internal/icon-scope";
import { usePublishIconStyle } from "../internal/style-store";
import { provideSprite } from "../internal/sprite-store";

/**
 * Which sprite symbol `<Icon>` points at: its scope's style (else the root's,
 * else the default), the active fill when `active`, and the default style's
 * symbol for as long as the wanted style's sprite has not loaded.
 */

afterEach(cleanup);

const forum = symbol("forum");

function hrefOf(container: HTMLElement): string | null {
  return container.querySelector("use")?.getAttribute("href") ?? null;
}

function Publish({
  scope,
  style,
}: {
  scope: string | undefined;
  style: IconStyle;
}) {
  usePublishIconStyle(scope, style);
  return null;
}

const rounded: IconStyle = {
  shape: "rounded",
  fill: "filled",
  activeFill: "outline",
  weight: "light",
};

describe("<Icon>", () => {
  it("draws the default style: outline at rest, filled when active", () => {
    expect(hrefOf(render(<Icon icon={forum} />).container)).toBe(
      "#ms-default-outline-400-forum",
    );
    expect(hrefOf(render(<Icon icon={forum} active />).container)).toBe(
      "#ms-default-filled-400-forum",
    );
  });

  it("is a 1em svg, hidden from assistive tech unless named", () => {
    const { container } = render(<Icon icon={forum} className="size-4" />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("width")).toBe("1em");
    expect(svg.getAttribute("class")).toBe("size-4");
    expect(svg.getAttribute("aria-hidden")).toBe("true");

    const named = render(<Icon icon={forum} title="Conversations" />).container;
    const namedSvg = named.querySelector("svg")!;
    expect(namedSvg.getAttribute("aria-hidden")).toBeNull();
    expect(namedSvg.getAttribute("role")).toBe("img");
    expect(named.querySelector("title")?.textContent).toBe("Conversations");
  });

  it("draws a brand from the brands sprite, whatever the style", () => {
    expect(
      hrefOf(render(<Icon icon={brand("github")} active />).container),
    ).toBe("#si-github");
  });

  it("draws its scope's style once that sprite has loaded, the default style until then", () => {
    const { container } = render(
      <>
        <Publish scope="app:notes" style={rounded} />
        <IconScopeProvider scope="app:notes">
          <Icon icon={forum} />
        </IconScopeProvider>
      </>,
    );
    // The scope wants rounded-filled-300, which is not loaded yet.
    expect(hrefOf(container)).toBe("#ms-default-outline-400-forum");
    act(() => provideSprite("rounded-filled-300", "<svg></svg>"));
    expect(hrefOf(container)).toBe("#ms-rounded-filled-300-forum");
  });

  it("falls back to the root's style for a scope that publishes none", () => {
    act(() => provideSprite("rounded-outline-300", "<svg></svg>"));
    const { container } = render(
      <>
        <Publish scope={undefined} style={rounded} />
        <IconScopeProvider scope="app:other">
          <Icon icon={forum} active />
        </IconScopeProvider>
      </>,
    );
    expect(hrefOf(container)).toBe("#ms-rounded-outline-300-forum");
  });

  it("refuses a second publisher for one scope", () => {
    expect(() =>
      render(
        <>
          <Publish scope="app:dup" style={rounded} />
          <Publish scope="app:dup" style={rounded} />
        </>,
      ),
    ).toThrow(/two publishers/);
  });
});
