import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import {
  PluginProvider,
  type LoadedPlugin,
} from "@plugins/framework/plugins/web-sdk/core";
import { ActiveData, codeTag } from "../slots";
import { claimPending, claimed, declined, type CodeClaim } from "../claim";
import { ActiveDataCodeChain } from "../internal/code-chain";

// The arbitration protocol for `display:"code"` contributions, pinned with
// throwaway fixtures only — never a real sub-plugin chip, so the test asserts the
// HOST's behaviour and cannot be broken by a contributor's rendering.
//
// The regression it guards: which contribution wins used to be decided by plugin
// load order (the first SYNTACTIC match rendered, and published its own inability
// to resolve as a plain `<code>` indistinguishable from a success). The
// reversed-order case below is the assertion that would have caught it.

// Both fixtures full-match the same token — the whole point of the chain.
const TOKEN_RE = /[a-z0-9]+/;

function ChipA({ content }: { content: string; value: string }) {
  return <span data-testid="chip-a">A:{content}</span>;
}

function ChipB({ content }: { content: string; value: string }) {
  return <span data-testid="chip-b">B:{content}</span>;
}

function makePlugin(
  id: string,
  contributions: ReturnType<typeof ActiveData.Tag>[],
): LoadedPlugin {
  return { id, description: "code arbitration fixture", contributions } as unknown as LoadedPlugin;
}

function renderChain(plugin: LoadedPlugin, text = "abc123") {
  return render(
    <PluginProvider plugins={[plugin]}>
      <ActiveDataCodeChain text={text} />
    </PluginProvider>,
  );
}

/** The base markdown `<code>` styling — the host-owned terminal, not a contributor. */
const TERMINAL_CLASS = "bg-muted";

afterEach(cleanup);

describe("active-data code-contribution arbitration", () => {
  it("falls through a declining contribution to one that claims", () => {
    const a = codeTag({
      id: "a",
      pattern: TOKEN_RE,
      useClaim: (): CodeClaim<string> => declined("A never claims"),
      component: ChipA,
    });
    const b = codeTag({
      id: "b",
      pattern: TOKEN_RE,
      useClaim: (text: string): CodeClaim<string> => claimed(text),
      component: ChipB,
    });

    const { container } = renderChain(
      makePlugin("fixture-a-then-b", [ActiveData.Tag(a), ActiveData.Tag(b)]),
    );

    expect(container.querySelector("[data-testid='chip-b']")).not.toBeNull();
    expect(container.querySelector("[data-testid='chip-a']")).toBeNull();
    expect(container.querySelector("code")).toBeNull();
  });

  it("produces identical output with the registration order reversed", () => {
    const a = codeTag({
      id: "a",
      pattern: TOKEN_RE,
      useClaim: (): CodeClaim<string> => declined("A never claims"),
      component: ChipA,
    });
    const b = codeTag({
      id: "b",
      pattern: TOKEN_RE,
      useClaim: (text: string): CodeClaim<string> => claimed(text),
      component: ChipB,
    });

    const forward = renderChain(
      makePlugin("fixture-forward", [ActiveData.Tag(a), ActiveData.Tag(b)]),
    ).container.innerHTML;
    cleanup();
    const reversed = renderChain(
      makePlugin("fixture-reversed", [ActiveData.Tag(b), ActiveData.Tag(a)]),
    ).container.innerHTML;

    // Who resolves the token decides — not who loaded first.
    expect(reversed).toBe(forward);
    expect(reversed).toContain("B:abc123");
  });

  it("renders exactly one plain <code> and no contributor markup when every candidate declines", () => {
    const a = codeTag({
      id: "a",
      pattern: TOKEN_RE,
      useClaim: (): CodeClaim<string> => declined("not mine"),
      component: ChipA,
    });
    const b = codeTag({
      id: "b",
      pattern: TOKEN_RE,
      useClaim: (): CodeClaim<string> => declined("not mine either"),
      component: ChipB,
    });

    const { container } = renderChain(
      makePlugin("fixture-all-decline", [ActiveData.Tag(a), ActiveData.Tag(b)]),
    );

    const codes = container.querySelectorAll("code");
    expect(codes.length).toBe(1);
    expect(codes[0]!.className).toContain(TERMINAL_CLASS);
    expect(codes[0]!.textContent).toBe("abc123");
    expect(container.querySelector("[data-testid='chip-a']")).toBeNull();
    expect(container.querySelector("[data-testid='chip-b']")).toBeNull();
  });

  it("stops at a pending contribution: plain <code>, and the next candidate is never consulted", () => {
    const bClaim = vi.fn((text: string): CodeClaim<string> => claimed(text));
    const a = codeTag({
      id: "a",
      pattern: TOKEN_RE,
      useClaim: (): CodeClaim<string> => claimPending(),
      component: ChipA,
    });
    const b = codeTag({
      id: "b",
      pattern: TOKEN_RE,
      useClaim: bClaim,
      component: ChipB,
    });

    const { container } = renderChain(
      makePlugin("fixture-pending", [ActiveData.Tag(a), ActiveData.Tag(b)]),
    );

    // The terminal renders while A is undecided — NOT B's chip.
    const codes = container.querySelectorAll("code");
    expect(codes.length).toBe(1);
    expect(codes[0]!.textContent).toBe("abc123");
    expect(container.querySelector("[data-testid='chip-b']")).toBeNull();
    // ...and B's level never mounted, so it fired no I/O for an answer that would
    // have been discarded the moment A settles.
    expect(bClaim).not.toHaveBeenCalled();
  });
});
