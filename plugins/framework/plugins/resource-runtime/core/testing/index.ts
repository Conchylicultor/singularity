// The server half of the keyed-delta wire contract, so the client merge's
// round-trip suite (live-state) can drive the real producer against its consumer.
export {
  buildSnapshot,
  diffKeyedFull,
  diffKeyedScoped,
  hashSnapEncoder,
} from "../keyed-diff";
export type { KeyedSnapshot } from "../keyed-diff";
// The faithful client simulator (sub-ack / update / delta / invalidate, the
// version guard and the keyed merge), for a suite driving a real runtime over
// a socket — network/live's differential oracle compares each view against a
// fresh FULL load.
export { makeClientView } from "../test-support";
export type { ClientView, RecordedFrame } from "../test-support";
