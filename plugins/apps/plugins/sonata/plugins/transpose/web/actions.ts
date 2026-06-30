import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { setTransposeEndpoint } from "../shared/endpoints";

// Fire-and-forget write: the UI never reads the response — state refreshes via
// the live-state push the upsert's `notify()` emits server-side. `void` keeps
// the no-floating-promises rule satisfied while a genuine network failure still
// surfaces loudly as an unhandled rejection (reported by the crashes plugin).
// Named `save*` (not `set*`) to stay distinct from the shell's in-memory
// per-surface store setter (`useSetTransposeSemitones()`), which the control
// sets optimistically alongside this persistence call.
export function saveTranspose(songId: string, semitones: number): void {
  void fetchEndpoint(setTransposeEndpoint, { id: songId }, { body: { semitones } });
}
