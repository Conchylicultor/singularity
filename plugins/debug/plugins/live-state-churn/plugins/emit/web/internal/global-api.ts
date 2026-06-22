import { useEffect } from "react";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { LIVE_STATE_EMIT_GLOBAL } from "../../core";
import type { EmitStatus } from "../../shared/endpoints";
import { startEmit, stopEmit, getEmitStatus } from "../../shared/endpoints";

/** Options for the window-level imperative `start`. */
export interface EmitStartOptions {
  key: string;
  rate: number;
  durationMs?: number;
}

/** The window-level imperative emit API installed by this module. */
export interface LiveStateEmitGlobal {
  start: (opts: EmitStartOptions) => Promise<EmitStatus>;
  stop: () => Promise<EmitStatus>;
  status: () => Promise<EmitStatus>;
}

declare global {
  interface Window {
    __liveStateEmit?: LiveStateEmitGlobal;
  }
}

let installed = false;

/** Install the window-level imperative API. Idempotent. */
export function installGlobalApi(): void {
  if (installed) return;
  installed = true;
  window[LIVE_STATE_EMIT_GLOBAL] = {
    start: ({ key, rate, durationMs }) =>
      fetchEndpoint(startEmit, {}, { body: { key, rate, durationMs } }),
    stop: () => fetchEndpoint(stopEmit, {}),
    status: () => fetchEndpoint(getEmitStatus, {}),
  };
}

/** Invisible component mounted via Core.Root to install the global API once. */
export function EmitInstaller(): null {
  useEffect(() => {
    installGlobalApi();
  }, []);
  return null;
}
