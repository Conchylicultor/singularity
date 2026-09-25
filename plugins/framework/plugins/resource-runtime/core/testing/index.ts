// The server half of the keyed-delta wire contract, so the client merge's
// round-trip suite (live-state) can drive the real producer against its consumer.
export {
  buildSnapshot,
  diffKeyedFull,
  diffKeyedScoped,
  hashSnapEncoder,
} from "../keyed-diff";
export type { KeyedSnapshot } from "../keyed-diff";
