import {
  Pane,
  PaneChrome,
  defineRoute,
} from "@plugins/primitives/plugins/pane/web";
import { chordApp } from "@plugins/apps/plugins/chord/plugins/shell/core";
import { SongIndexGate } from "@plugins/apps/plugins/chord/plugins/song-index/web";
import { TrainerScreen } from "./components/trainer-screen";

/**
 * The Chord app's index pane — what bare `/chord` shows. Its standard pane
 * header, titled with the app's name, is the surface's top chrome: the app
 * shell hands it the launcher icon at its leading edge. Opening it opens the
 * song index (`SongIndexGate` shows the load's progress on first use), then
 * the trainer.
 */
export const trainerPane = Pane.define({
  title: chordApp.name,
  route: defineRoute({ id: "chord-trainer", segment: "" }),
  app: chordApp,
  appIndex: true,
  component: TrainerPane,
});

function TrainerPane() {
  return (
    <PaneChrome pane={trainerPane}>
      <SongIndexGate>
        <TrainerScreen />
      </SongIndexGate>
    </PaneChrome>
  );
}
