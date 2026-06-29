import { MdRepeat } from "react-icons/md";
import { scoreEndBeat } from "@plugins/apps/plugins/sonata/plugins/score/core";
import {
  useSonata,
  useCursorApi,
} from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { toggleLoop } from "../loop-actions";

/**
 * Toolbar Loop toggle (`SonataToolbar.End`). One click toggles the A–B practice
 * loop: with a region set it flips `enabled` (active = filled `default` variant);
 * with none it creates the default region at the playhead and seeks to its start
 * (see `toggleLoop`). Disabled until a song is loaded.
 */
export function LoopToggle() {
  const { loop, setLoop, seekTo, score } = useSonata();
  const cursor = useCursorApi();
  const hasScore = scoreEndBeat(score) > 0;

  return (
    <IconButton
      icon={MdRepeat}
      label="Loop"
      tooltip="Loop"
      shortcut="l"
      variant={loop?.enabled ? "default" : "ghost"}
      disabled={!hasScore}
      onClick={() =>
        toggleLoop({ loop, setLoop, seekTo, score, beat: cursor.getBeat() })
      }
    />
  );
}
