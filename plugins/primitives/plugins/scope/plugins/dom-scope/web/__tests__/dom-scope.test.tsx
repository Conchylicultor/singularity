import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { useState, type ReactNode } from "react";

import { defineDomScope, type DomScopeRoot } from "../index";

afterEach(cleanup);

const makeScope = () =>
  defineDomScope<HTMLDivElement>({
    name: "test.scope",
    what: "the test element (published by <Owner>)",
    bounds: ["data-test-row"],
  });

/** Publishes a div carrying `mark`, so a reader can say WHICH one it got. */
function Owner({
  scope,
  mark,
}: {
  scope: ReturnType<typeof makeScope>;
  mark: string;
}) {
  const publishRef = scope.usePublishRef();
  return (
    <div ref={publishRef} data-mark={mark}>
      <span data-test-row={mark} />
    </div>
  );
}

/** Records every value `useRoot()` returned, in order. */
function Reader({
  scope,
  seen,
}: {
  scope: ReturnType<typeof makeScope>;
  seen: DomScopeRoot<HTMLDivElement>[];
}) {
  const root = scope.useRoot();
  seen.push(root);
  return null;
}

describe("defineDomScope", () => {
  it("gives each mounted instance its own root", () => {
    const scope = makeScope();
    const a: DomScopeRoot<HTMLDivElement>[] = [];
    const b: DomScopeRoot<HTMLDivElement>[] = [];

    render(
      <>
        <scope.Provider>
          <Reader scope={scope} seen={a} />
          <Owner scope={scope} mark="a" />
        </scope.Provider>
        <scope.Provider>
          <Reader scope={scope} seen={b} />
          <Owner scope={scope} mark="b" />
        </scope.Provider>
      </>,
    );

    const lastA = a.at(-1)!;
    const lastB = b.at(-1)!;
    expect(lastA.attached).toBe(true);
    expect(lastB.attached).toBe(true);
    // The whole point: two mounted copies of one surface, two different roots.
    // A document-wide scan would hand both readers the FIRST one.
    expect(lastA.attached && lastA.root.dataset.mark).toBe("a");
    expect(lastB.attached && lastB.root.dataset.mark).toBe("b");
    expect(lastA.attached && lastB.attached && lastA.root).not.toBe(
      lastB.attached && lastB.root,
    );
  });

  it("a reader that renders before the owner attaches re-renders on attach", () => {
    const scope = makeScope();
    const seen: DomScopeRoot<HTMLDivElement>[] = [];

    render(
      <scope.Provider>
        <Reader scope={scope} seen={seen} />
        <Owner scope={scope} mark="a" />
      </scope.Provider>,
    );

    // The late-fill case install-sink documents: a callback ref runs in the
    // commit phase, i.e. AFTER the reader's first render. The first answer must
    // be the honest "not yet", and the subscription must deliver the second.
    expect(seen[0]).toEqual({ attached: false });
    expect(seen.at(-1)!.attached).toBe(true);
  });

  it("reports { attached: false } when the owner unmounts", () => {
    const scope = makeScope();
    const seen: DomScopeRoot<HTMLDivElement>[] = [];

    function Host() {
      const [shown, setShown] = useState(true);
      return (
        <scope.Provider>
          <Reader scope={scope} seen={seen} />
          {shown && <Owner scope={scope} mark="a" />}
          <button onClick={() => setShown(false)}>hide</button>
        </scope.Provider>
      );
    }

    const { getByText } = render(<Host />);
    expect(seen.at(-1)!.attached).toBe(true);
    act(() => getByText("hide").click());
    expect(seen.at(-1)).toEqual({ attached: false });
  });

  it("throws, naming the scope, when no <Provider> is above the reader", () => {
    const scope = makeScope();
    const seen: DomScopeRoot<HTMLDivElement>[] = [];
    // React logs the render error itself; silence it so the suite output only
    // carries the assertion.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(() => render(<Reader scope={scope} seen={seen} />)).toThrow(
        /dom-scope "test\.scope": no <Provider>/,
      );
    } finally {
      spy.mockRestore();
    }
  });

  it("throws when a second element is published into one scope", () => {
    const scope = makeScope();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(() =>
        render(
          <scope.Provider>
            <Owner scope={scope} mark="a" />
            <Owner scope={scope} mark="b" />
          </scope.Provider>,
        ),
      ).toThrow(/two elements published into one scope/);
    } finally {
      spy.mockRestore();
    }
  });

  it("peekRoot answers null before attach and the element after", () => {
    const scope = makeScope();
    let peekedDuringFirstRender: HTMLDivElement | null | "unset" = "unset";
    const api: { current: ReturnType<typeof scope.useScopeApi> | null } = {
      current: null,
    };

    function PeekingReader() {
      const scopeApi = scope.useScopeApi();
      api.current = scopeApi;
      if (peekedDuringFirstRender === "unset") {
        peekedDuringFirstRender = scopeApi.peekRoot();
      }
      return null;
    }

    render(
      <scope.Provider>
        <PeekingReader />
        <Owner scope={scope} mark="a" />
      </scope.Provider>,
    );

    // Exactly why `peek…` is banned from render by
    // install-sink/no-render-phase-peek: the render-phase sample is the
    // pre-attach answer and nothing re-runs it.
    expect(peekedDuringFirstRender).toBeNull();
    expect(api.current!.peekRoot()?.dataset.mark).toBe("a");
    expect(api.current!.peekRootOrThrow().dataset.mark).toBe("a");
  });

  it("peekRootOrThrow throws before the element attaches", () => {
    const scope = makeScope();
    const api: { current: ReturnType<typeof scope.useScopeApi> | null } = {
      current: null,
    };

    function Reader2(): ReactNode {
      api.current = scope.useScopeApi();
      return null;
    }

    render(
      <scope.Provider>
        <Reader2 />
      </scope.Provider>,
    );

    expect(() => api.current!.peekRootOrThrow()).toThrow(
      /read before its element attached/,
    );
  });

  it("carries its declared bounds, which the check reads", () => {
    const scope = makeScope();
    expect(scope.name).toBe("test.scope");
    expect(scope.bounds).toEqual(["data-test-row"]);
  });
});
