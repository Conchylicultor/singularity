/**
 * The DataView's viewport signal, the half a paged read pages by:
 *
 * - `useVisibleRowKeys` watches every `[data-row-key]` row under its container
 *   (one IntersectionObserver, rows mounted later enrolled through a
 *   MutationObserver) and publishes the keys on screen once they have held
 *   still for the settle window — or the max wait, for rows that never do —
 *   `measuring` before the first, again for a new epoch until a settle after
 *   it, and while no row is drawn at all;
 * - `visibleRowsOf` reads one paged read's first and last row on screen, in
 *   its own order;
 * - `usePagesViewport` mints the `VisibleRange` a read takes from what the
 *   DataView reports to its sink (`measuring` until the first report).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, renderHook } from "@testing-library/react";
import { useState } from "react";
import {
  useVisibleRowKeys,
  visibleRowsOf,
} from "../internal/use-visible-row-keys";
import { usePagesViewport } from "../internal/pages-viewport";

class FakeIntersectionObserver {
  static live: FakeIntersectionObserver | null = null;
  observed = new Set<Element>();
  constructor(public cb: IntersectionObserverCallback) {
    FakeIntersectionObserver.live = this;
  }
  observe(el: Element): void {
    this.observed.add(el);
  }
  unobserve(el: Element): void {
    this.observed.delete(el);
  }
  disconnect(): void {
    this.observed.clear();
  }
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  /** Deliver one entry per row, as observe() does: on screen or not. */
  deliver(els: Iterable<Element>, keys: readonly string[]): void {
    const entries = [...els].map(
      (target) =>
        ({
          target,
          isIntersecting: keys.includes(target.getAttribute("data-row-key")!),
        }) as unknown as IntersectionObserverEntry,
    );
    this.cb(entries, this as unknown as IntersectionObserver);
  }
  /** Deliver: these rows are on screen, the others not. */
  show(keys: readonly string[]): void {
    const entries = [...this.observed].map(
      (target) =>
        ({
          target,
          isIntersecting: keys.includes(target.getAttribute("data-row-key")!),
        }) as unknown as IntersectionObserverEntry,
    );
    this.cb(entries, this as unknown as IntersectionObserver);
  }
}

function Rows(props: {
  keys: readonly string[];
  /** The reads the measurement is matched against; default: the rows drawn, as one read. */
  reads?: readonly (readonly string[])[];
  onKeys: (k: ReturnType<typeof useVisibleRowKeys>["keys"]) => void;
  onSizes?: (s: ReturnType<typeof useVisibleRowKeys>) => void;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const onScreen = useVisibleRowKeys(host, props.reads ?? [props.keys]);
  props.onKeys(onScreen.keys);
  props.onSizes?.(onScreen);
  return (
    <div ref={setHost} style={{ display: "contents" }}>
      {props.keys.map((k) => (
        <div key={k} data-row-key={k}>
          {k}
        </div>
      ))}
    </div>
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("useVisibleRowKeys", () => {
  it("is measuring until the rows on screen settle, then names them", async () => {
    let seen = "measuring" as ReturnType<typeof useVisibleRowKeys>["keys"];
    render(<Rows keys={["a", "b", "c"]} onKeys={(k) => (seen = k)} />);
    const io = FakeIntersectionObserver.live!;
    expect(io.observed.size).toBe(3);
    act(() => io.show(["a", "b"]));
    expect(seen).toBe("measuring");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(seen).not.toBe("measuring");
    expect([...(seen as ReadonlySet<string>)].sort()).toEqual(["a", "b"]);
  });

  it("a fling settles once: changes inside the window publish only the last", async () => {
    const published: string[][] = [];
    render(
      <Rows
        keys={["a", "b", "c", "d"]}
        onKeys={(k) => {
          if (k === "measuring") return;
          const ks = [...k].sort();
          if (JSON.stringify(published.at(-1)) !== JSON.stringify(ks)) {
            published.push(ks);
          }
        }}
      />,
    );
    const io = FakeIntersectionObserver.live!;
    act(() => io.show(["a"]));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    act(() => io.show(["b"]));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    act(() => io.show(["c", "d"]));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(published).toEqual([["c", "d"]]);
  });

  it("rows mounted later are watched too, and an unmounted row leaves the set", async () => {
    let seen = "measuring" as ReturnType<typeof useVisibleRowKeys>["keys"];
    const view = render(<Rows keys={["a"]} onKeys={(k) => (seen = k)} />);
    view.rerender(<Rows keys={["a", "b"]} onKeys={(k) => (seen = k)} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const io = FakeIntersectionObserver.live!;
    expect(
      [...io.observed].map((el) => el.getAttribute("data-row-key")).sort(),
    ).toEqual(["a", "b"]);
    act(() => io.show(["a", "b"]));
    view.rerender(<Rows keys={["b"]} onKeys={(k) => (seen = k)} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect([...(seen as ReadonlySet<string>)]).toEqual(["b"]);
  });
});

describe("useVisibleRowKeys — a measurement vouches only for the rows it saw", () => {
  it("a new epoch is measuring until a settle after it — the old rows' measurement is not handed out", async () => {
    let seen = "measuring" as ReturnType<typeof useVisibleRowKeys>["keys"];
    const view = render(<Rows keys={["a", "b"]} onKeys={(k) => (seen = k)} />);
    const io = FakeIntersectionObserver.live!;
    act(() => io.show(["a", "b"]));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect([...(seen as ReadonlySet<string>)].sort()).toEqual(["a", "b"]);
    // New rows drawn: nothing to say about them yet.
    view.rerender(<Rows keys={["x", "y"]} onKeys={(k) => (seen = k)} />);
    expect(seen).toBe("measuring");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const fresh = [...io.observed].filter((el) =>
      ["x", "y"].includes(el.getAttribute("data-row-key")!),
    );
    act(() => io.deliver(fresh, ["x"]));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect([...(seen as ReadonlySet<string>)]).toEqual(["x"]);
  });

  it("a settle waits for a row that has had no entry yet", async () => {
    let seen = "measuring" as ReturnType<typeof useVisibleRowKeys>["keys"];
    render(<Rows keys={["a", "b"]} onKeys={(k) => (seen = k)} />);
    const io = FakeIntersectionObserver.live!;
    const [a, b] = [...io.observed];
    act(() => io.deliver([a!], ["a"]));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(seen).toBe("measuring");
    act(() => io.deliver([b!], ["a"]));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect([...(seen as ReadonlySet<string>)]).toEqual(["a"]);
  });

  it("with no row drawn there is nothing to measure: measuring, never an empty set", async () => {
    let seen = "measuring" as ReturnType<typeof useVisibleRowKeys>["keys"];
    render(
      <Rows keys={[]} reads={[["skeleton"]]} onKeys={(k) => (seen = k)} />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(seen).toBe("measuring");
  });

  it("rows that never hold still still publish, at the max wait", async () => {
    const published: string[][] = [];
    render(
      <Rows
        keys={["a", "b", "c"]}
        onKeys={(k) => {
          if (k === "measuring") return;
          const ks = [...k].sort();
          if (JSON.stringify(published.at(-1)) !== JSON.stringify(ks)) {
            published.push(ks);
          }
        }}
      />,
    );
    const io = FakeIntersectionObserver.live!;
    act(() => io.show(["a"]));
    // A crossing every 200 ms — inside every settle window.
    for (let i = 0; i < 6; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });
      act(() => io.show(i % 2 === 0 ? ["b"] : ["c"]));
    }
    expect(published.length).toBeGreaterThan(0);
  });
});

describe("useVisibleRowKeys — the room each row takes", () => {
  /** Lays the rows out top to bottom at these heights (a row not listed: 20px). */
  function layOut(heights: Record<string, number>) {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
      function (this: Element) {
        const key = this.getAttribute("data-row-key");
        if (key === null) return new DOMRect(0, 0, 0, 0);
        let top = 0;
        for (const el of document.querySelectorAll("[data-row-key]")) {
          const k = el.getAttribute("data-row-key")!;
          const h = heights[k] ?? 20;
          if (el === this) return new DOMRect(0, top, 100, h);
          top += h;
        }
        return new DOMRect(0, 0, 0, 0);
      },
    );
  }

  it("each drawn row's advance is the distance to the next entry of its read; one never drawn beside its next keeps the last measured", async () => {
    layOut({ a: 30, b: 45 });
    let sizes: ReturnType<typeof useVisibleRowKeys> | null = null;
    const view = render(
      <Rows
        keys={["a", "b", "c"]}
        onKeys={() => {}}
        onSizes={(s) => (sizes = s)}
      />,
    );
    const io = FakeIntersectionObserver.live!;
    act(() => io.show(["a", "b", "c"]));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    // c is the read's last entry: no next, no advance.
    expect([...sizes!.advances]).toEqual([
      ["a", 30],
      ["b", 45],
    ]);
    expect(sizes!.rowPitch).toBe(37.5);

    // a leaves the DOM (windowed out) but stays in the read: it keeps its
    // advance; a row released from the read is forgotten.
    view.rerender(
      <Rows
        keys={["b", "c", "d"]}
        reads={[["a", "b", "c", "d"]]}
        onKeys={() => {}}
        onSizes={(s) => (sizes = s)}
      />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    act(() => io.show(["b", "c", "d"]));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(Object.fromEntries(sizes!.advances)).toEqual({
      a: 30,
      b: 45,
      c: 20,
    });
  });
});

describe("visibleRowsOf", () => {
  it("the first and last of the read's rows on screen, in the read's order", () => {
    const visible = new Set(["c", "x", "a"]);
    expect(visibleRowsOf(["a", "b", "c", "d"], visible)).toEqual({
      kind: "rows",
      first: "a",
      last: "c",
    });
    expect(visibleRowsOf(["d", "e"], visible)).toEqual({ kind: "none" });
  });
});

describe("usePagesViewport", () => {
  it("measuring until the DataView reports; an equal report keeps the range", () => {
    const { result } = renderHook(() => usePagesViewport());
    expect(result.current.viewport.kind).toBe("measuring");
    const sink = result.current.sink;
    act(() => sink.report({ kind: "rows", first: "a", last: "b" }));
    const first = result.current.viewport;
    expect(first).toEqual({ kind: "rows", first: "a", last: "b" });
    act(() => sink.report({ kind: "rows", first: "a", last: "b" }));
    expect(result.current.viewport).toBe(first);
    expect(result.current.sink).toBe(sink);
    act(() => sink.report({ kind: "none" }));
    expect(result.current.viewport.kind).toBe("none");
  });
});
