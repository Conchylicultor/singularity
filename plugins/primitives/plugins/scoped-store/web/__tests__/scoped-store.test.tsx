import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { useRef, type ReactNode } from "react";

import { defineScopedStore } from "../index";

afterEach(cleanup);

// A reusable counter-shaped store with an `other` field, so a selector can read
// one slice and we can mutate the other to assert bailout.
interface State {
  count: number;
  other: number;
}
const makeHandle = () =>
  defineScopedStore<State>({ count: 0, other: 0 });

describe("defineScopedStore", () => {
  it("two separate <Provider> mounts hold independent state", () => {
    const Handle = makeHandle();

    // A reader that publishes its store api outward via a ref, so the test can
    // mutate each mount independently and read both back.
    function Reader({ apiRef }: { apiRef: { current: ReturnType<typeof Handle.useStoreApi> | null } }) {
      apiRef.current = Handle.useStoreApi();
      return null;
    }

    const aRef = { current: null as ReturnType<typeof Handle.useStoreApi> | null };
    const bRef = { current: null as ReturnType<typeof Handle.useStoreApi> | null };

    render(
      <>
        <Handle.Provider>
          <Reader apiRef={aRef} />
        </Handle.Provider>
        <Handle.Provider>
          <Reader apiRef={bRef} />
        </Handle.Provider>
      </>,
    );

    expect(aRef.current).not.toBe(bRef.current);

    act(() => aRef.current!.setState({ count: 5, other: 0 }));

    // Mutating mount A leaves mount B untouched — fully isolated state.
    expect(aRef.current!.getState().count).toBe(5);
    expect(bRef.current!.getState().count).toBe(0);
  });

  it("useSelector re-renders only when the selected slice changes", () => {
    const Handle = makeHandle();
    const renders = vi.fn();

    let api: ReturnType<typeof Handle.useStoreApi> | null = null;

    function CountReader() {
      renders();
      Handle.useSelector((s) => s.count, []);
      return null;
    }
    function ApiGrabber() {
      api = Handle.useStoreApi();
      return null;
    }

    render(
      <Handle.Provider>
        <ApiGrabber />
        <CountReader />
      </Handle.Provider>,
    );

    expect(renders).toHaveBeenCalledTimes(1);

    // Mutating an UNRELATED slice must not re-render the count reader.
    act(() => api!.setState((s) => ({ ...s, other: s.other + 1 })));
    expect(renders).toHaveBeenCalledTimes(1);

    // Mutating the SELECTED slice re-renders it.
    act(() => api!.setState((s) => ({ ...s, count: s.count + 1 })));
    expect(renders).toHaveBeenCalledTimes(2);
  });

  it("deps invalidation re-runs the selector", () => {
    const Handle = makeHandle();

    let api: ReturnType<typeof Handle.useStoreApi> | null = null;
    let observed: number | null = null;

    // The selector closes over `bias`, which is NOT part of the store. With deps
    // = [bias], bumping bias must re-run the selector even though the state is
    // unchanged.
    function Biased({ bias }: { bias: number }) {
      observed = Handle.useSelector((s) => s.count + bias, [bias]);
      return null;
    }
    function ApiGrabber() {
      api = Handle.useStoreApi();
      return null;
    }

    const { rerender } = render(
      <Handle.Provider>
        <ApiGrabber />
        <Biased bias={10} />
      </Handle.Provider>,
    );
    expect(observed).toBe(10);

    // Same state, but new dep → cache dropped, selector re-runs with new bias.
    rerender(
      <Handle.Provider>
        <ApiGrabber />
        <Biased bias={100} />
      </Handle.Provider>,
    );
    expect(observed).toBe(100);

    // Mutate the store; the selector composes the latest state with the dep.
    act(() => api!.setState((s) => ({ ...s, count: 5 })));
    expect(observed).toBe(105);
  });

  it("custom isEqual suppresses re-render for structurally-equal selections", () => {
    const Handle = makeHandle();
    const renders = vi.fn();

    let api: ReturnType<typeof Handle.useStoreApi> | null = null;

    // Selector builds a FRESH object every call, so Object.is can never match.
    // A value-comparing isEqual must bail when the projected fields are equal.
    function ObjReader() {
      renders();
      Handle.useSelector(
        (s) => ({ c: s.count }),
        [],
        (a, b) => a.c === b.c,
      );
      return null;
    }
    function ApiGrabber() {
      api = Handle.useStoreApi();
      return null;
    }

    render(
      <Handle.Provider>
        <ApiGrabber />
        <ObjReader />
      </Handle.Provider>,
    );
    expect(renders).toHaveBeenCalledTimes(1);

    // New state object, but the selected `c` is unchanged → isEqual bails.
    act(() => api!.setState((s) => ({ ...s, other: s.other + 1 })));
    expect(renders).toHaveBeenCalledTimes(1);

    // `c` changes → re-render.
    act(() => api!.setState((s) => ({ ...s, count: s.count + 1 })));
    expect(renders).toHaveBeenCalledTimes(2);
  });

  it("useStoreApi().getState()/setState() imperative path + meta forwarded to subscribe", () => {
    const Handle = makeHandle();
    const seen: unknown[] = [];

    let api: ReturnType<typeof Handle.useStoreApi> | null = null;

    function Subscriber() {
      const store = Handle.useStoreApi();
      // Subscribe once on mount; record every meta the store forwards.
      const subscribed = useRef(false);
      if (!subscribed.current) {
        subscribed.current = true;
        store.subscribe((meta) => seen.push(meta));
      }
      api = store;
      return null;
    }

    render(
      <Handle.Provider>
        <Subscriber />
      </Handle.Provider>,
    );

    expect(api!.getState()).toEqual({ count: 0, other: 0 });

    act(() => api!.setState({ count: 1, other: 0 }, { meta: "seek" }));
    expect(api!.getState().count).toBe(1);
    expect(seen).toEqual(["seek"]);

    // No-meta write still notifies, forwarding undefined.
    act(() => api!.setState({ count: 2, other: 0 }));
    expect(seen).toEqual(["seek", undefined]);

    // Object.is-equal write bails: no notification.
    act(() => api!.setState((s) => s));
    expect(seen).toEqual(["seek", undefined]);
  });

  it("useStoreApi throws outside its <Provider>", () => {
    const Handle = makeHandle();
    function Bad(): ReactNode {
      Handle.useStoreApi();
      return null;
    }
    // Silence the expected React error log for the throwing render.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Bad />)).toThrow(
      "scoped-store: hook used outside its <Provider>",
    );
    spy.mockRestore();
  });
});
