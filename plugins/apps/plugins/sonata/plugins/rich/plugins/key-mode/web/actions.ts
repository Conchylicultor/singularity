import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { setKeyAutoDetectEndpoint } from "../shared/endpoints";

// Fire-and-forget write: the UI never reads the response — state refreshes via
// the live-state push the upsert's `notify()` emits server-side. `void` keeps
// the no-floating-promises rule satisfied while a genuine network failure still
// surfaces loudly as an unhandled rejection (reported by the crashes plugin).
// Named `save*` (not `set*`) to stay distinct from the shell's in-memory
// per-surface store setter (`useSetKeyAutoDetect()`), which a toggle handler
// sets optimistically alongside this persistence call.
export function saveKeyAutoDetect(songId: string, enabled: boolean): void {
  void fetchEndpoint(setKeyAutoDetectEndpoint, { id: songId }, { body: { enabled } });
}
