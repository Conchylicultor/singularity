import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { useEffect, useState } from "react";
import {
  PluginProvider,
  type LoadedPlugin,
} from "@plugins/framework/plugins/web-sdk/core";
import { SonataPlayer } from "../slots";
import { ShownEffects } from "../scope";
import { PlayerViewProvider, useMarkPlayerShown, usePlayerView } from "../view";

afterEach(cleanup);

/**
 * `SonataPlayer.Effect` mounts once per player while at least one display
 * marks it shown — never per display (two seek listeners on one session would
 * double-seek), and never while nothing shows the player (the library's
 * now-playing bar).
 */

function setup() {
  const mounts = { live: 0, total: 0 };
  function ProbeEffect() {
    useEffect(() => {
      mounts.live++;
      mounts.total++;
      return () => {
        mounts.live--;
      };
    }, []);
    return null;
  }
  const plugins = [
    {
      id: "apps.sonata.player",
      description: "sonata player fixture",
      slots: SonataPlayer,
      contributions: [
        SonataPlayer.Effect({ id: "probe", component: ProbeEffect }),
      ],
    } as unknown as LoadedPlugin,
  ];

  /** Stands in for `PlayerDisplay`, which marks the player shown the same way. */
  function Display() {
    useMarkPlayerShown();
    return null;
  }
  let shown: boolean | null = null;
  function ShownProbe() {
    shown = usePlayerView().shown;
    return null;
  }
  let setDisplays: ((n: number) => void) | null = null;
  function Harness() {
    const [n, set] = useState(0);
    setDisplays = set;
    return (
      <PlayerViewProvider>
        {Array.from({ length: n }, (_, i) => (
          <Display key={i} />
        ))}
        <ShownProbe />
        <ShownEffects />
      </PlayerViewProvider>
    );
  }
  render(
    <PluginProvider plugins={plugins}>
      <Harness />
    </PluginProvider>,
  );
  return {
    mounts,
    shown: () => shown,
    displays: (n: number) =>
      act(() => {
        if (!setDisplays) throw new Error("harness not rendered");
        setDisplays(n);
      }),
  };
}

describe("player shown effects", () => {
  it("are not mounted while no display shows the player", () => {
    const s = setup();
    expect(s.shown()).toBe(false);
    expect(s.mounts.total).toBe(0);
  });

  it("mount once however many displays show the player, and unmount with the last", () => {
    const s = setup();
    s.displays(1);
    expect(s.shown()).toBe(true);
    expect(s.mounts).toEqual({ live: 1, total: 1 });

    s.displays(2);
    expect(s.mounts).toEqual({ live: 1, total: 1 });

    s.displays(1);
    expect(s.mounts).toEqual({ live: 1, total: 1 });

    s.displays(0);
    expect(s.shown()).toBe(false);
    expect(s.mounts.live).toBe(0);
  });
});
