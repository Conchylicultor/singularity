import type React from "react";
import type { ChordToken } from "@plugins/apps/plugins/chord/plugins/song-index/core";
import { chordDegree } from "@plugins/apps/plugins/chord/plugins/vocabulary/core";
import { chordToneStyle as degreeToneStyle } from "@plugins/music/plugins/chord-box/web";

/**
 * The CSS custom properties that paint a chord token: its degree's colour and
 * tile depth (`music/chord-box`'s `chordToneStyle`), which the `.chord-tone`
 * paint reads.
 */
export function chordToneStyle(token: ChordToken): React.CSSProperties {
  return degreeToneStyle(chordDegree(token));
}
