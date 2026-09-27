import { createContext, useContext } from "react";
import { useLoadedSongIdentity } from "./loaded-song";
import { Sonata } from "./slots";

const MountedSongContext = createContext<string | null>(null);

/**
 * The id of the song a `Sonata.SongSetting` observer is mounted for — the
 * loaded song, non-null by construction: the slot mounts only while a song is
 * loaded, once per load of it. Throws anywhere else.
 */
export function useMountedSongId(): string {
  const songId = useContext(MountedSongContext);
  if (songId === null) {
    throw new Error(
      "useMountedSongId() must be called from a Sonata.SongSetting observer",
    );
  }
  return songId;
}

/**
 * Mounts every registered setting's observer for the LOADED song — the song
 * whose content the surface holds, and whose settings those are — keyed on the
 * load (`generation`), never on the song the player shows (`currentSongId`),
 * which can lag the content by a render or stay set to a song played in the
 * background.
 *
 * The key is what makes a stuck pending setting inexpressible: a song's
 * settings start empty exactly when a DIFFERENT song is loaded, which is
 * exactly when the generation moves — so its observers always mount afresh
 * then, and their mount effect settles what they read, however their later
 * effects are keyed. A reload of the same song keeps both the settings and the
 * observers.
 */
export function SongSettingsMount() {
  const loaded = useLoadedSongIdentity();
  if (loaded === null) return null;
  return (
    <MountedSongContext.Provider key={loaded.generation} value={loaded.songId}>
      <Sonata.SongSetting.Mount />
    </MountedSongContext.Provider>
  );
}
