import { MdGridView } from "react-icons/md";
import type { CreateOption } from "@plugins/primitives/plugins/data-view/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import {
  beatToSeconds,
  scoreEndBeat,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import { openSongImperative } from "@plugins/apps/plugins/sonata/plugins/library/web";
import { compile, type ChordGridRaw } from "../compile";
import { createChordGridSong } from "../../shared/endpoints";

/**
 * The chord-grid source's create affordance, contributed to `Library.Source`
 * and mapped by the library into the data-view `creators` "+" menu. Creates a
 * new song pre-filled with a starter progression (the grid is authored, not
 * imported), computes its metrics client-side via `compile`, persists it, then
 * opens it immediately (via the imperative `openSongImperative`) so the user
 * lands in the editor. Fully imperative — no React hooks.
 */
const STARTER: ChordGridRaw = {
  text: "| C  G | Am  F |",
};

export const chordGridCreateOption: CreateOption = {
  id: "chord-grid",
  label: "New Chord Grid",
  icon: <MdGridView className="size-4" />,
  onSelect: async () => {
    const score = compile(STARTER);
    const endBeat = scoreEndBeat(score);
    const song = await fetchEndpoint(
      createChordGridSong,
      {},
      {
        body: {
          title: "New Chord Grid",
          composer: null,
          chordText: STARTER.text,
          durationSec: beatToSeconds(score, endBeat),
          endBeat,
        },
      },
    );
    openSongImperative(song);
  },
};
