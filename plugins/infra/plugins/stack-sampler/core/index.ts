// `core/` here means RUNTIME-NEUTRAL BUN, not web-safe: this barrel reaches
// `bun:jsc`. It lives in `core/` so a CLI process (the check runner, whose
// `core → core` isolation puts `server/` out of reach) and a server backend
// (health-monitor) share the ONE owner of the JSC sampler. This plugin must
// NEVER be imported from `web/`.

export type { StackFrame, StackSample, StackSampler } from "./internal/sampler";
export {
  claimStackSampler,
  frameKey,
  normalizeTraces,
} from "./internal/sampler";
