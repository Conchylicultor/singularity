import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { useEffect } from "react";

import {
  UndoRedoProvider,
  UndoRedoThunkError,
  usePendingFlush,
  useUndoRedo,
  type UndoRedoApi,
} from "../index";

// The incident these tests exist for: the page editor coalesces a typing run
// into ONE entry it records at the run's idle deadline. A ⌘Z 200 ms into the
// run used to pop the entry BELOW it (the run was not on the stack yet), and a
// flush attempted while an earlier undo's async thunk was still in flight had
// its `record` dropped by the replay guard.

afterEach(cleanup);

/** Publishes the api outward so the test drives the stack imperatively. */
function Api({ onApi }: { onApi: (api: UndoRedoApi) => void }) {
  const current = useUndoRedo();
  // Every commit, so `canUndo` / `canRedo` read back fresh after each flip.
  useEffect(() => {
    onApi(current);
  });
  return null;
}

interface ApiRef {
  current: UndoRedoApi | null;
  /** The probe's callback: a method, not a prop write from inside a component. */
  set: (api: UndoRedoApi) => void;
}

function apiRef(): ApiRef {
  const ref: ApiRef = {
    current: null,
    set: (next) => {
      ref.current = next;
    },
  };
  return ref;
}

function api(ref: { current: UndoRedoApi | null }): UndoRedoApi {
  if (ref.current === null) throw new Error("api not mounted");
  return ref.current;
}

/** A deferred thunk: the test decides when the replay settles. */
function deferred(): { thunk: () => Promise<void>; settle: () => void } {
  let settle!: () => void;
  const done = new Promise<void>((resolve) => {
    settle = resolve;
  });
  return { thunk: () => done, settle };
}

const flushMicrotasks = (): Promise<void> => act(async () => {});

describe("pending flush", () => {
  it("seals the producer's open entry so undo pops IT, not the entry below", () => {
    const ref = apiRef();
    const log: string[] = [];
    let open: string | null = null;

    function Producer() {
      // The producer holds an unrecorded entry ("typing run") until flushed.
      usePendingFlush(() => {
        if (open === null) return;
        const label = open;
        open = null;
        api(ref).record({
          label,
          undo: () => {
            log.push(`undo ${label}`);
          },
          redo: () => {
            log.push(`redo ${label}`);
          },
        });
      });
      return null;
    }

    render(
      <UndoRedoProvider>
        <Api onApi={ref.set} />
        <Producer />
      </UndoRedoProvider>,
    );

    act(() => {
      api(ref).record({
        label: "below",
        undo: () => {
          log.push("undo below");
        },
        redo: () => {
          log.push("redo below");
        },
      });
    });
    open = "run";
    act(() => api(ref).undo());

    expect(log).toEqual(["undo run"]);
    expect(api(ref).canUndo).toBe(true); // "below" is still there
  });

  it("registers imperatively and returns its unregister", () => {
    const ref = apiRef();
    render(
      <UndoRedoProvider>
        <Api onApi={ref.set} />
      </UndoRedoProvider>,
    );
    const flush = vi.fn();
    let unregister!: () => void;
    act(() => {
      unregister = api(ref).registerPendingFlush(flush);
    });
    act(() => api(ref).undo());
    expect(flush).toHaveBeenCalledTimes(1);
    act(() => api(ref).redo());
    expect(flush).toHaveBeenCalledTimes(2);

    act(() => unregister());
    act(() => api(ref).undo());
    expect(flush).toHaveBeenCalledTimes(2);
  });

  it("unregisters a hook-bound flush when its mount goes away", () => {
    const ref = apiRef();
    const flush = vi.fn();
    function Producer() {
      usePendingFlush(flush);
      return null;
    }
    const { rerender } = render(
      <UndoRedoProvider>
        <Api onApi={ref.set} />
        <Producer />
      </UndoRedoProvider>,
    );
    act(() => api(ref).undo());
    expect(flush).toHaveBeenCalledTimes(1);

    rerender(
      <UndoRedoProvider>
        <Api onApi={ref.set} />
      </UndoRedoProvider>,
    );
    act(() => api(ref).undo());
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("always calls the latest callback without re-registering", () => {
    const ref = apiRef();
    const calls: string[] = [];
    function Producer({ tag }: { tag: string }) {
      usePendingFlush(() => {
        calls.push(tag);
      });
      return null;
    }
    const { rerender } = render(
      <UndoRedoProvider>
        <Api onApi={ref.set} />
        <Producer tag="a" />
      </UndoRedoProvider>,
    );
    rerender(
      <UndoRedoProvider>
        <Api onApi={ref.set} />
        <Producer tag="b" />
      </UndoRedoProvider>,
    );
    act(() => api(ref).undo());
    expect(calls).toEqual(["b"]);
  });

  it("lands a flush registered while an async thunk is in flight (serialization)", async () => {
    const ref = apiRef();
    const log: string[] = [];
    render(
      <UndoRedoProvider>
        <Api onApi={ref.set} />
      </UndoRedoProvider>,
    );

    const first = deferred();
    act(() => {
      api(ref).record({
        label: "first",
        undo: async () => {
          log.push("undo first: start");
          await first.thunk();
          log.push("undo first: done");
        },
        redo: () => {
          log.push("redo first");
        },
      });
    });
    act(() => api(ref).undo());
    expect(log).toEqual(["undo first: start"]);

    // Mid-flight: a producer registers a flush holding an unrecorded run, and
    // the user hits ⌘Z again. Under the old boolean guard the flush's `record`
    // would have run with `replaying === true` and been dropped.
    let open = true;
    act(() => {
      api(ref).registerPendingFlush(() => {
        if (!open) return;
        open = false;
        api(ref).record({
          label: "run",
          undo: () => {
            log.push("undo run");
          },
          redo: () => {
            log.push("redo run");
          },
        });
      });
    });
    act(() => api(ref).undo());
    // Queued: nothing sealed, nothing popped yet.
    expect(open).toBe(true);
    expect(log).toEqual(["undo first: start"]);

    await act(async () => {
      first.settle();
    });
    await flushMicrotasks();

    expect(open).toBe(false);
    expect(log).toEqual(["undo first: start", "undo first: done", "undo run"]);
    // The sealed run was a fresh record, so it invalidated the redo of "first".
    expect(api(ref).canRedo).toBe(true); // "run" itself is now redoable
    expect(api(ref).canUndo).toBe(false);
  });

  it("does not see the replay guard: a flush's record lands, a thunk's does not", () => {
    const ref = apiRef();
    render(
      <UndoRedoProvider>
        <Api onApi={ref.set} />
      </UndoRedoProvider>,
    );
    const sealed = { undo: vi.fn(), redo: vi.fn() };
    act(() => {
      api(ref).record({
        label: "a",
        // A thunk whose patch flows back through `record` — must be ignored.
        undo: () =>
          api(ref).record({ label: "echo", undo: vi.fn(), redo: vi.fn() }),
        redo: vi.fn(),
      });
      api(ref).registerPendingFlush(() =>
        api(ref).record({ label: "sealed", ...sealed }),
      );
    });
    act(() => api(ref).undo());
    // The flush sealed "sealed" on top, and that is what got popped — "a" stays.
    expect(sealed.undo).toHaveBeenCalledTimes(1);
    expect(api(ref).canUndo).toBe(true);
    act(() => api(ref).clear());
  });
});

describe("the replay guard covers only the thunk's synchronous call", () => {
  it("a record during an AWAITING thunk lands as the top entry, not as the replay's echo", async () => {
    const ref = apiRef();
    const log: string[] = [];
    render(
      <UndoRedoProvider>
        <Api onApi={ref.set} />
      </UndoRedoProvider>,
    );

    const roundTrip = deferred();
    act(() => {
      api(ref).record({
        label: "replay",
        undo: async () => {
          log.push("undo replay: start");
          await roundTrip.thunk();
          log.push("undo replay: done");
        },
        redo: () => {
          log.push("redo replay");
        },
      });
    });
    act(() => api(ref).undo());
    expect(log).toEqual(["undo replay: start"]);
    expect(api(ref).canUndo).toBe(false);

    // Mid round trip, an unrelated producer records — the page editor's idle
    // timer closing a typing run while a stored-doc replay is in flight. Under
    // a guard held across the `await` this was silently dropped.
    act(() => {
      api(ref).record({
        label: "run",
        undo: () => {
          log.push("undo run");
        },
        redo: () => {
          log.push("redo run");
        },
      });
    });
    expect(api(ref).canUndo).toBe(true);
    // A fresh record invalidates the redo the in-flight undo was about to push.
    expect(api(ref).canRedo).toBe(false);

    await act(async () => {
      roundTrip.settle();
    });
    await flushMicrotasks();
    expect(log).toEqual(["undo replay: start", "undo replay: done"]);

    // The landed entry is on top: the next undo pops IT.
    act(() => api(ref).undo());
    expect(log).toEqual([
      "undo replay: start",
      "undo replay: done",
      "undo run",
    ]);
    expect(api(ref).canUndo).toBe(false);
  });

  it("a thunk's SYNCHRONOUS record is still its echo and is ignored — for an async thunk too", () => {
    const ref = apiRef();
    render(
      <UndoRedoProvider>
        <Api onApi={ref.set} />
      </UndoRedoProvider>,
    );
    const echo = vi.fn();
    act(() => {
      api(ref).record({
        label: "a",
        // The synchronous part dispatches a patch that flows back through
        // `record` before the first await: the guard is up.
        undo: async () => {
          api(ref).record({ label: "echo", undo: echo, redo: echo });
          await Promise.resolve();
        },
        redo: vi.fn(),
      });
    });
    act(() => api(ref).undo());
    expect(api(ref).canUndo).toBe(false);
    expect(echo).not.toHaveBeenCalled();
  });
});

describe("serialized turns", () => {
  it("runs a second undo after an in-flight one, in order", async () => {
    const ref = apiRef();
    const log: string[] = [];
    render(
      <UndoRedoProvider>
        <Api onApi={ref.set} />
      </UndoRedoProvider>,
    );

    const b = deferred();
    act(() => {
      api(ref).record({
        label: "a",
        undo: () => {
          log.push("undo a");
        },
        redo: () => {
          log.push("redo a");
        },
      });
      api(ref).record({
        label: "b",
        undo: async () => {
          log.push("undo b: start");
          await b.thunk();
          log.push("undo b: done");
        },
        redo: () => {
          log.push("redo b");
        },
      });
    });

    act(() => api(ref).undo());
    act(() => api(ref).undo());
    expect(log).toEqual(["undo b: start"]);
    // The queued turn has not popped: canUndo still reports "a".
    expect(api(ref).canUndo).toBe(true);

    await act(async () => {
      b.settle();
    });
    await flushMicrotasks();

    expect(log).toEqual(["undo b: start", "undo b: done", "undo a"]);
    expect(api(ref).canUndo).toBe(false);
    expect(api(ref).canRedo).toBe(true);
  });

  it("keeps a mixed undo/redo sequence FIFO", async () => {
    const ref = apiRef();
    const log: string[] = [];
    render(
      <UndoRedoProvider>
        <Api onApi={ref.set} />
      </UndoRedoProvider>,
    );
    const a = deferred();
    act(() => {
      api(ref).record({
        label: "a",
        undo: async () => {
          log.push("undo a");
          await a.thunk();
        },
        redo: () => {
          log.push("redo a");
        },
      });
    });
    act(() => api(ref).undo());
    act(() => api(ref).redo());
    act(() => api(ref).undo());
    expect(log).toEqual(["undo a"]);

    await act(async () => {
      a.settle();
    });
    await flushMicrotasks();
    expect(log).toEqual(["undo a", "redo a", "undo a"]);
  });

  it("makes a queued turn that finds nothing a no-op", async () => {
    const ref = apiRef();
    const log: string[] = [];
    render(
      <UndoRedoProvider>
        <Api onApi={ref.set} />
      </UndoRedoProvider>,
    );
    const a = deferred();
    act(() => {
      api(ref).record({
        label: "a",
        undo: async () => {
          log.push("undo a");
          await a.thunk();
        },
        redo: () => {
          log.push("redo a");
        },
      });
    });
    act(() => api(ref).undo());
    act(() => api(ref).undo());
    act(() => api(ref).undo());
    await act(async () => {
      a.settle();
    });
    await flushMicrotasks();
    expect(log).toEqual(["undo a"]);
    expect(api(ref).canRedo).toBe(true);
    // The queue drained: a fresh turn runs immediately again.
    act(() => api(ref).redo());
    expect(log).toEqual(["undo a", "redo a"]);
  });
});

describe("UndoRedoThunkError", () => {
  it("names the cause in its message and keeps it attached", () => {
    const cause = new Error("patch rejected by server");
    const err = new UndoRedoThunkError("undo", cause);
    expect(err.message).toBe(
      "undo-redo: undo thunk threw: patch rejected by server",
    );
    expect(err.cause).toBe(cause);
    expect(err.direction).toBe("undo");
    expect(err.name).toBe("UndoRedoThunkError");
  });

  it("stringifies a non-Error cause", () => {
    expect(new UndoRedoThunkError("redo", "nope").message).toBe(
      "undo-redo: redo thunk threw: nope",
    );
  });
});

describe("useUndoRedo outside a provider", () => {
  it("throws loudly", () => {
    function Bare() {
      useUndoRedo();
      return null;
    }
    const silence = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Bare />)).toThrow(/outside its <Provider>/);
    silence.mockRestore();
  });
});

// A hook whose only job is to exercise the effect-shaped registration under
// StrictMode's double-invoke: register → unregister → register must leave
// exactly one live flush.
describe("usePendingFlush under StrictMode", () => {
  it("leaves exactly one registration", () => {
    const ref = apiRef();
    const flush = vi.fn();
    function Producer() {
      usePendingFlush(flush);
      useEffect(() => {}, []);
      return null;
    }
    render(
      <UndoRedoProvider>
        <Api onApi={ref.set} />
        <Producer />
      </UndoRedoProvider>,
      { reactStrictMode: true },
    );
    act(() => api(ref).undo());
    expect(flush).toHaveBeenCalledTimes(1);
  });
});
