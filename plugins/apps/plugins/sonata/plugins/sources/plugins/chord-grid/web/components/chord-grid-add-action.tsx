import { Button } from "@plugins/primitives/plugins/ui-kit/web";
import { useState } from "react";
import { MdGridView } from "react-icons/md";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import {
  beatToSeconds,
  scoreEndBeat,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import { useOpenSong } from "@plugins/apps/plugins/sonata/plugins/library/web";
import { compile, type ChordGridRaw } from "../compile";
import { DEFAULT_VOICING_ID } from "../voicings";
import { createChordGridSong } from "../../shared/endpoints";

/**
 * The chord-grid source's "add a song" affordance, contributed to `Library.Source`
 * and rendered in the library header next to MIDI's Import. Creates a new song
 * pre-filled with a starter progression (the grid is authored, not imported),
 * computes its metrics client-side via `compile`, persists it, then opens it
 * immediately (via the generic `useOpenSong`) so the user lands in the editor.
 */
const STARTER: ChordGridRaw = {
  text: "| C  G | Am  F |",
  voicingId: DEFAULT_VOICING_ID,
  octave: 4,
};

export function ChordGridAddAction() {
  const openSong = useOpenSong();
  const [creating, setCreating] = useState(false);

  async function create() {
    setCreating(true);
    try {
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
            voicingId: STARTER.voicingId,
            octave: STARTER.octave,
            durationSec: beatToSeconds(score, endBeat),
            endBeat,
          },
        },
      );
      openSong(song);
    } finally {
      setCreating(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={creating}
      onClick={() => void create()}
    >
      <MdGridView className="size-4" />
      {creating ? "Adding…" : "New Chord Grid"}
    </Button>
  );
}
