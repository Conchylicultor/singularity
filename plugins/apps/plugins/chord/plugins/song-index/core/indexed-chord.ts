import type {
  HookpadChord,
  HookpadKey,
} from "@plugins/integrations/plugins/hooktheory/core";
import type { ChordFeature } from "./features";
import type { ChordToken } from "./token";

/** One Hookpad chord of an indexed section, read. */
export type IndexedChord = {
  /** The chord as written, every Hookpad field kept. */
  chord: HookpadChord;
  /** The key in force at its beat (`hookpadKeyAt`): the key its token is relative to. */
  key: HookpadKey;
  /**
   * `sound` — its token and spelling features. `rest` — silent in the harmony
   * track (a rest, or a chord Sheet Sage does not sound: before beat 1).
   */
  reading:
    | { kind: "sound"; token: ChordToken; features: ChordFeature[] }
    | { kind: "rest" };
};
