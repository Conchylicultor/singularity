// Which boot mode THIS process is in — `serve` (the gateway-spawned, long-lived
// backend) or `exec` (a short-lived child that runs one registered piece of
// work and exits). See `../shared/boot-stages.ts` for the split.
//
// Both modes run the same `register` and `onReadyBlocking` phases, so a plugin
// whose hook in one of those phases makes a claim about the SERVING backend
// must ask. The case that forced this: boot-events wrote its `start` line from
// `register`, but its `ready` line from `onReady`, which exec skips — so every
// nightly backup child left an unpaired `start` in main's boot channel, and the
// boot watchdog reported main as wedged for as long as main then stayed up.
//
// Set once, by the shared boot sequence, before any plugin module loads — so
// every phase hook can read it, and a read before boot throws rather than
// guessing.
export type BootMode = "serve" | "exec";

let mode: BootMode | undefined;

export function setBootMode(next: BootMode): void {
  if (mode !== undefined && mode !== next) {
    throw new Error(
      `[boot] boot mode already set to "${mode}"; refusing to switch to "${next}"`,
    );
  }
  mode = next;
}

export function getBootMode(): BootMode {
  if (mode === undefined) {
    throw new Error(
      "[boot] getBootMode() read before the boot sequence set it — call it from a phase hook, not at module eval",
    );
  }
  return mode;
}
