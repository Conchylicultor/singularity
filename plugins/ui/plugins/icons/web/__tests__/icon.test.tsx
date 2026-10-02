import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import {
  brand,
  runtimeSymbol,
  seti,
  symbol,
  type SavedSymbolName,
} from "../../core/icon-ref";
import type { IconStyle } from "../../core/style";
import { Icon } from "../internal/icon";
import { IconScopeProvider } from "../internal/icon-scope";
import { usePublishIconStyle } from "../internal/style-store";
import { provideSprite, useWantedSprites } from "../internal/sprite-store";
import { provideRuntimeSymbols } from "../internal/runtime-symbol-store";

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

describe("<Icon> on a Seti file-type glyph", () => {
  function Wanted() {
    return <span data-testid="wanted">{useWantedSprites().join(",")}</span>;
  }

  it("asks for the Seti sprite on mount and draws an empty box until it lands, whatever the style", () => {
    const { container, getByTestId } = render(
      <>
        <Wanted />
        <Publish scope="app:files" style={rounded} />
        <IconScopeProvider scope="app:files">
          <Icon icon={seti("typescript")} active className="size-4" />
        </IconScopeProvider>
      </>,
    );
    expect(getByTestId("wanted").textContent).toBe("seti");
    expect(container.querySelector("svg")?.getAttribute("class")).toBe(
      "size-4",
    );
    expect(hrefOf(container)).toBeNull();
    act(() => provideSprite("seti", "<svg></svg>"));
    expect(hrefOf(container)).toBe("#seti-typescript");
  });
});

describe("<Icon> on a runtime (saved) symbol", () => {
  const home = runtimeSymbol("home" as SavedSymbolName);

  it("draws nothing until some style's symbol is held — a loading box, not a wrong glyph", () => {
    const { container } = render(<Icon icon={home} className="size-4" />);
    expect(container.querySelector("svg")?.getAttribute("width")).toBe("1em");
    expect(hrefOf(container)).toBeNull();
  });

  it("draws the default style's symbol while the wanted style's loads, then the wanted one", () => {
    act(() =>
      provideRuntimeSymbols("test-default", "<svg></svg>", [
        { styleKey: "default-outline-400", name: "home" },
      ]),
    );
    function Themed() {
      return (
        <IconScopeProvider scope="app-runtime">
          <Publish scope="app-runtime" style={rounded} />
          <Icon icon={home} />
        </IconScopeProvider>
      );
    }
    const { container } = render(<Themed />);
    expect(hrefOf(container)).toBe("#msr-default-outline-400-home");
    act(() =>
      provideRuntimeSymbols("test-rounded", "<svg></svg>", [
        { styleKey: "rounded-filled-300", name: "home" },
      ]),
    );
    expect(hrefOf(container)).toBe("#msr-rounded-filled-300-home");
  });
});
