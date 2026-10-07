import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import {
  PluginProvider,
  type LoadedPlugin,
} from "@plugins/framework/plugins/web-sdk/core";
import {
  emptyScore,
  type Score,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import { SonataSession } from "../slots";
import {
  CursorStoreProvider,
  useCursorApi,
  type CursorApi,
} from "../cursor-store";
import {
  PlaybackSession,
  useSession,
  type DriverState,
  type SessionValue,
  type TransportDriver,
} from "../session";

// Frames are run by hand: `frame()` fires every callback queued since the last.
let queued: FrameRequestCallback[] = [];
function frame() {
  const run = queued;
  queued = [];
  act(() => {
    for (const cb of run) cb(0);
  });
}
beforeEach(() => {
  queued = [];
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    queued.push(cb);
    return queued.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {
    queued = [];
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** 4/4 at 120 bpm (half a second per beat), one note per beat over `[0, beats)`. */
function song(beats: number): Score {
  return {
    ...emptyScore(),
    tracks: [{ id: "t" }],
    tempoMap: [{ beat: 0, bpm: 120 }],
    timeSigMap: [{ beat: 0, numerator: 4, denominator: 4 }],
    notes: Array.from({ length: beats }, (_, i) => ({
      id: `n${i}`,
      pitch: 60,
      start: i,
      duration: 1,
      velocity: 80,
      track: "t",
    })),
  };
}

/** YouTube's rates: a request lands on the nearest one. */
const RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

/** A medium the test moves by hand. */
class FakeDriver implements TransportDriver {
  media = 0;
  state: DriverState = { kind: "paused" };
  calls: string[] = [];
  seeks: number[] = [];
  private listeners = new Set<(s: DriverState) => void>();

  position(): number | null {
    return this.state.kind === "advancing" ? this.media : null;
  }
  play(): void {
    this.calls.push("play");
  }
  pause(): void {
    this.calls.push("pause");
  }
  seek(mediaSec: number): void {
    this.seeks.push(mediaSec);
    this.media = mediaSec;
  }
  setRate(rate: number): Promise<number> {
    this.calls.push(`rate ${rate}`);
    const taken = RATES.reduce((a, b) =>
      Math.abs(b - rate) < Math.abs(a - rate) ? b : a,
    );
    return Promise.resolve(taken);
  }
  subscribe(listener: (s: DriverState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }
  emit(state: DriverState): void {
    act(() => this.report(state));
  }
  /** Tell the listeners now, inside whatever act the caller is in. */
  report(state: DriverState): void {
    this.state = state;
    for (const l of this.listeners) l(state);
  }
}

const sessionPlugin: LoadedPlugin[] = [
  {
    id: "apps.sonata.session",
    description: "sonata session fixture",
    slots: SonataSession,
    contributions: [],
  } as unknown as LoadedPlugin,
];

function renderSession(score: Score) {
  let session: SessionValue | null = null;
  let cursor: CursorApi | null = null;
  function Probe() {
    session = useSession();
    cursor = useCursorApi();
    return null;
  }
  const content = { kind: "ready" as const, contentKey: {}, score };
  render(
    <PluginProvider plugins={sessionPlugin}>
      <CursorStoreProvider>
        <PlaybackSession content={content}>
          <Probe />
        </PlaybackSession>
      </CursorStoreProvider>
    </PluginProvider>,
  );
  const s = (): SessionValue => {
    if (session === null) throw new Error("session not rendered");
    return session;
  };
  const c = (): CursorApi => {
    if (cursor === null) throw new Error("session not rendered");
    return cursor;
  };
  return {
    session: s,
    beat: () => c().getBeat(),
    drive: (d: TransportDriver) => {
      let off: () => void = () => {};
      act(() => {
        off = s().registerTransportDriver(d);
      });
      return () => act(() => off());
    },
  };
}

describe("registerClock", () => {
  it("unregistering the active clock restores the previous one, not the wall clock", () => {
    const s = renderSession(song(16));
    act(() => {
      s.session().registerCountIn(() => 4);
      s.session().registerClock({ now: () => 10 });
    });
    let offB: () => void = () => {};
    act(() => {
      offB = s.session().registerClock({ now: () => 20 });
    });
    act(() => offB());
    act(() => s.session().playWithCountIn());
    expect(s.session().countIn?.startedAtClockSec).toBe(10);
  });
});

describe("a transport driver", () => {
  it("is sought to the cursor when it registers, and follows play / stop / seek", () => {
    const s = renderSession(song(16));
    act(() => s.session().seekTo(4));
    const d = new FakeDriver();
    s.drive(d);
    expect(s.session().driven).toBe(true);
    // Beat 4 at 120 bpm = media 2 s.
    expect(d.seeks.at(-1)).toBe(2);

    act(() => s.session().play());
    expect(d.calls.at(-1)).toBe("play");
    act(() => s.session().seekTo(8));
    expect(d.seeks.at(-1)).toBe(4);
    act(() => s.session().stop());
    expect(d.calls.at(-1)).toBe("pause");
  });

  it("drives the cursor from its position, freezing it while stalled", () => {
    const s = renderSession(song(16));
    const d = new FakeDriver();
    s.drive(d);
    act(() => s.session().play());
    d.media = 3;
    d.emit({ kind: "advancing" });
    frame();
    expect(s.beat()).toBe(6);

    const epoch = s.session().syncEpoch;
    d.emit({ kind: "stalled" });
    expect(s.session().syncEpoch).toBe(epoch + 1);
    expect(s.session().readDriver()).toEqual({ kind: "stalled" });
    d.media = 5;
    frame();
    expect(s.beat()).toBe(6);

    d.emit({ kind: "advancing" });
    expect(s.session().syncEpoch).toBe(epoch + 2);
    frame();
    expect(s.beat()).toBe(10);
    expect(s.session().readDriver()).toEqual({ kind: "advancing", beat: 10 });
    expect(s.session().isPlaying).toBe(true);
  });

  it("stops the transport on an external pause, and never lets the medium start it", () => {
    const s = renderSession(song(16));
    const d = new FakeDriver();
    s.drive(d);
    act(() => s.session().play());
    d.emit({ kind: "advancing" });
    d.emit({ kind: "paused" });
    expect(s.session().isPlaying).toBe(false);

    d.calls = [];
    d.emit({ kind: "advancing" });
    expect(s.session().isPlaying).toBe(false);
    expect(d.calls).toEqual(["pause"]);
  });

  it("wraps an A–B loop by seeking the medium back to A, once", () => {
    const s = renderSession(song(16));
    const d = new FakeDriver();
    s.drive(d);
    act(() => s.session().setLoop({ start: 4, end: 8, enabled: true }));
    act(() => s.session().play());
    d.emit({ kind: "advancing" });
    const epoch = s.session().syncEpoch;
    d.media = 4.1; // beat 8.2, past B
    frame();
    expect(d.seeks.at(-1)).toBe(2); // A = beat 4 = 2 s
    expect(s.beat()).toBe(4);
    expect(s.session().syncEpoch).toBe(epoch + 1);

    // The medium has not landed yet: no second wrap.
    const seeks = d.seeks.length;
    d.media = 4.15;
    frame();
    expect(d.seeks.length).toBe(seeks);
    d.media = 2.5;
    frame();
    expect(s.beat()).toBe(5);
  });

  it("adopts the rate the medium took as the tempo, and 0 pauses without asking it", async () => {
    const s = renderSession(song(16));
    const d = new FakeDriver();
    s.drive(d);
    await act(async () => s.session().setTempoScale(1.1));
    expect(s.session().tempoScale).toBe(1);
    await act(async () => s.session().setTempoScale(1.2));
    expect(s.session().tempoScale).toBe(1.25);

    act(() => s.session().play());
    d.calls = [];
    await act(async () => s.session().setTempoScale(0));
    expect(s.session().tempoScale).toBe(0);
    expect(s.session().isPlaying).toBe(false);
    expect(d.calls).toEqual(["pause"]);
  });

  it("plays without a count-in, and seeks the medium to a cursor a scrub moved", () => {
    const s = renderSession(song(16));
    act(() => {
      s.session().registerCountIn(() => 4);
    });
    const d = new FakeDriver();
    s.drive(d);
    act(() => s.session().seekTo(2));
    // A scrub steps the cursor on the wall clock, without telling the medium.
    vi.spyOn(performance, "now").mockReturnValue(0);
    act(() => s.session().startScrub(1));
    vi.spyOn(performance, "now").mockReturnValue(1000);
    frame();
    act(() => s.session().endScrub());
    expect(s.beat()).toBeGreaterThan(2);
    act(() => s.session().playWithCountIn());
    expect(s.session().countIn).toBeNull();
    expect(s.session().isPlaying).toBe(true);
    // The medium was brought to the cursor on play.
    expect(d.seeks.at(-1)).toBe(s.beat() / 2);
  });

  it("a medium tearing down after it unregistered does not stop the transport", () => {
    const s = renderSession(song(16));
    const d = new FakeDriver();
    const off = s.drive(d);
    act(() => s.session().play());
    d.media = 1;
    d.emit({ kind: "advancing" });
    frame();
    // Its element unmounts: the unregister runs first, then — in the same
    // commit, before the session re-renders — the dying player reports it
    // stopped. That is the medium going away, not a pause.
    act(() => {
      off();
      d.report({ kind: "paused" });
    });
    expect(s.session().isPlaying).toBe(true);
    expect(s.session().driven).toBe(false);
  });

  it("unregistering falls back to the previous driver, then to the clock, playing on", () => {
    const s = renderSession(song(16));
    const a = new FakeDriver();
    const b = new FakeDriver();
    const offA = s.drive(a);
    const offB = s.drive(b);
    act(() => s.session().play());
    b.media = 2;
    b.emit({ kind: "advancing" });
    frame();
    expect(s.beat()).toBe(4);
    offB();
    expect(s.session().driven).toBe(true);
    // A is brought to where the transport is.
    expect(a.seeks.at(-1)).toBe(2);
    expect(s.session().isPlaying).toBe(true);
    offA();
    expect(s.session().driven).toBe(false);
    expect(s.session().readDriver()).toEqual({ kind: "internal" });
    expect(s.session().isPlaying).toBe(true);
  });
});
