import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { useEffect, useMemo } from "react";

import { defineInstallSink } from "../index";

afterEach(cleanup);

// The sink payload throughout: a navigator-shaped function, matching the real
// consumers (a cross-app navigator, a history adapter).
type Nav = (url: string) => void;

const makeSink = () =>
  defineInstallSink<Nav>({
    name: "test.nav",
    what: "the test navigator (installed by the test provider at mount)",
  });

describe("defineInstallSink", () => {
  // REGRESSION — the pane Expand incident. A pane mounted in the SAME commit as
  // the tab provider asked "is there anywhere to go?" before the provider's
  // effect had installed the navigator, was told no, and cached that answer for
  // its whole life. `useInstalled()` subscribes, so the late install re-renders
  // it; a one-shot sample in the same commit does not, which is the bug.
  it("a late install re-renders a reader that mounted in the same commit", () => {
    const sink = makeSink();
    const nav: Nav = () => {};

    const seen: boolean[] = [];
    let sampledInRender: Nav | null | "unset" = "unset";

    function Consumer() {
      seen.push(sink.useInstalled());
      // The WRONG read, kept here to show what the hook exists to avoid: a
      // one-shot sample taken during render, with the sink in no dependency
      // array, so nothing ever re-runs it.
      // eslint-disable-next-line install-sink/no-render-phase-peek -- deliberate: this suite asserts that a render-phase sample goes stale, which is the failure useInstalled() removes
      sampledInRender = useMemo(() => sink.peek(), []);
      return null;
    }

    function Installer() {
      // Installation is late by construction — an effect, i.e. the commit AFTER
      // Consumer's first render.
      useEffect(() => sink.install(nav), []);
      return null;
    }

    render(
      <>
        <Consumer />
        <Installer />
      </>,
    );

    // First render: nothing installed yet. After effects flush: installed, and
    // the subscribed reader re-rendered to say so.
    expect(seen[0]).toBe(false);
    expect(seen.at(-1)).toBe(true);

    // The memoized sample, however, is frozen at the pre-install answer — the
    // stale read the primitive's naming + lint rule exist to make unwritable.
    expect(sampledInRender).toBeNull();
    expect(sink.peek()).toBe(nav);
  });

  it("a disposer restores the previous occupant; a superseded one is a no-op", () => {
    const sink = makeSink();
    const first: Nav = () => {};
    const second: Nav = () => {};

    const disposeFirst = sink.install(first);
    expect(sink.peek()).toBe(first);

    const disposeSecond = sink.install(second);
    expect(sink.peek()).toBe(second);

    // `first` was superseded, so its teardown must not empty the slot someone
    // else has since filled (StrictMode double-mount / provider swap).
    disposeFirst();
    expect(sink.peek()).toBe(second);

    // The sitting occupant's disposer restores what it displaced.
    disposeSecond();
    expect(sink.peek()).toBe(first);
  });

  it("installing an equal value does not notify subscribers", () => {
    const sink = makeSink();
    const nav: Nav = () => {};
    const other: Nav = () => {};
    const renders = vi.fn();

    function Reader() {
      renders();
      sink.useValue();
      return null;
    }

    render(<Reader />);
    expect(renders).toHaveBeenCalledTimes(1);

    act(() => void sink.install(nav));
    expect(renders).toHaveBeenCalledTimes(2);

    // Same value again: the write bails, so nobody re-renders.
    act(() => void sink.install(nav));
    expect(renders).toHaveBeenCalledTimes(2);

    // A genuinely different value still notifies.
    act(() => void sink.install(other));
    expect(renders).toHaveBeenCalledTimes(3);
  });

  it("a fallback sink holds the fallback before the first install and after the last disposer", () => {
    const fallback: Nav = () => {};
    const installed: Nav = () => {};
    const sink = defineInstallSink<Nav>({
      name: "test.nav-with-fallback",
      what: "the test navigator",
      fallback,
    });

    expect(sink.peek()).toBe(fallback);

    let observed: Nav | null = null;
    function Reader() {
      observed = sink.useValue();
      return null;
    }
    render(<Reader />);
    expect(observed).toBe(fallback);

    let dispose: (() => void) | null = null;
    act(() => {
      dispose = sink.install(installed);
    });
    expect(sink.peek()).toBe(installed);
    expect(observed).toBe(installed);

    // The disposer restores the fallback — the teardown does not have to
    // remember what the default was.
    act(() => dispose!());
    expect(sink.peek()).toBe(fallback);
    expect(observed).toBe(fallback);
  });

  it("peekOrThrow throws a message naming the sink and what is missing", () => {
    const sink = makeSink();

    expect(() => sink.peekOrThrow()).toThrow(/install-sink "test\.nav"/);
    expect(() => sink.peekOrThrow()).toThrow(/the test navigator/);

    const nav: Nav = () => {};
    sink.install(nav);
    expect(sink.peekOrThrow()).toBe(nav);
  });
});
