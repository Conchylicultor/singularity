// `core/` here is the FFI-FREE half: the record the native tap produces and the
// pure formatter for it. A surface that only renders a recorded `SignalOrigin`
// (the deploy receipt, a debug pane) imports from here and never pays a
// `bun:ffi` dependency. Arming and reading the tap live in `server/`.

export type { SignalOrigin, SignalOriginProc } from "./internal/types";
export { formatSignalOrigin, signalName } from "./internal/types";
