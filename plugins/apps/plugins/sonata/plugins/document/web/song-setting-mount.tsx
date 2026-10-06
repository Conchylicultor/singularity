import { createContext, useContext } from "react";
import { useLoadedDocument } from "./loaded-song";
import { SonataDocument } from "./slots";

const MountedSongContext = createContext<string | null>(null);

/**
 * The id of the library song a `SonataDocument.SongSetting` observer is
 * mounted for — the loaded song, non-null by construction: the slot mounts
 * only while a library song is loaded, once per load of it. Throws anywhere
 * else.
 */
export function useMountedSongId(): string {
  const songId = useContext(MountedSongContext);
  if (songId === null) {
    throw new Error(
      "useMountedSongId() must be called from a SonataDocument.SongSetting observer",
    );
  }
  return songId;
}

/**
 * Mounts every registered setting's observer for the LOADED library song — the
 * song whose content the surface holds, and whose settings those are — keyed
 * on the load (`generation`), never on the song the app shows as open, which
 * can lag the content by a render or stay set to a song played in the
 * background. A file document mounts none: its settings are its defaults.
 *
 * The key is what makes a stuck pending setting inexpressible: a song's
 * settings start empty exactly when a DIFFERENT document is loaded, which is
 * exactly when the generation moves — so its observers always mount afresh
 * then, and their mount effect settles what they read, however their later
 * effects are keyed. A reload of the same song keeps both the settings and the
 * observers.
 */
export function SongSettingsMount() {
  const loaded = useLoadedDocument();
  if (loaded === null || loaded.identity.kind !== "library") return null;
  return (
    <MountedSongContext.Provider
      key={loaded.generation}
      value={loaded.identity.songId}
    >
      <SonataDocument.SongSetting.Mount />
    </MountedSongContext.Provider>
  );
}
