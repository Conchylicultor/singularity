// `core/` here means RUNTIME-NEUTRAL NODE, not web-safe: the binding is
// `bun:ffi` (same as packages/flock). Never import it from `web/`.
export { createSleepMeter } from "./internal/sleep-clock";
export type { SleepMeter, SleepReading } from "./internal/sleep-clock";
