import { Pane, defineRoute } from "@plugins/primitives/plugins/pane/web";
import { chordApp } from "@plugins/apps/plugins/chord/plugins/shell/core";
import { SongIndexGate } from "@plugins/apps/plugins/chord/plugins/song-index/web";
import { TrainerScreen } from "./components/trainer-screen";

/**
 * The Chord app's index pane — what bare `/chord` shows, under the shell's
 * header. Opening it opens the song index (`SongIndexGate` shows the load's
 * progress on first use), then the trainer.
 */
export const trainerPane = Pane.define({
  route: defineRoute({ id: "chord-trainer", segment: "" }),
  app: chordApp,
  appIndex: true,
  component: TrainerPane,
});

function TrainerPane() {
  return (
    <SongIndexGate>
      <TrainerScreen />
    </SongIndexGate>
  );
}
