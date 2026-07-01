import os from "node:os";

/**
 * Load-adaptive timeout, mirroring the gateway's `adaptiveTimeout` formula
 * (`gateway/loadavg.go`). Boot latency scales with host contention, so the
 * timeouts that gate boot must scale with the 1-minute load average relative to
 * the CPU count:
 *
 *   factor = 1 + max(0, load1 - numCPU) / numCPU
 *   result = clamp(base * factor, base, max)
 *
 * Below saturation (`load1 <= numCPU`) the factor is 1 → `base`. As load climbs
 * past the core count the window stretches linearly, capped at `max`.
 *
 * Two-arg form reads the real host (`os.loadavg()[0]` / `os.cpus().length`);
 * four-arg form is the pure, testable core.
 */
export function adaptiveTimeoutMs(base: number, max: number): number;
export function adaptiveTimeoutMs(base: number, max: number, load1: number, numCPU: number): number;
export function adaptiveTimeoutMs(base: number, max: number, load1?: number, numCPU?: number): number {
  const load = load1 ?? os.loadavg()[0] ?? 0;
  const cpus = numCPU ?? os.cpus().length;
  // Fail-safe: an unusable CPU count (0 or non-finite) → no scaling.
  if (!Number.isFinite(load) || !Number.isFinite(cpus) || cpus <= 0) {
    return Math.min(base, max);
  }
  const overload = Math.max(0, load - cpus);
  const factor = 1 + overload / cpus;
  const scaled = base * factor;
  return Math.min(Math.max(scaled, base), max);
}
