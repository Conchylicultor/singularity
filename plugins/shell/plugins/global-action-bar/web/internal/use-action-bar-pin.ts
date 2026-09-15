import { useDraft } from "@plugins/primitives/plugins/persistent-draft/web";
import {
  getSurfaceMode,
  setSurfaceMode,
} from "@plugins/apps-core/plugins/tabs/web";

// Effectively permanent: the pin is a deliberate UI preference, not a transient
// draft, so it must outlive the persistent-draft primitive's default 7-day TTL.
const PIN_TTL = 10 * 365 * 24 * 60 * 60 * 1000;

/**
 * The bar's one persisted preference — whether it is pinned — read by both
 * hosts and by the gear popover's "Pin action bar" switch (every caller stays
 * in sync through persistent-draft). Pinned is the default: the preference
 * lives in per-origin localStorage, so every fresh worktree origin
 * (`<wt>.localhost:9000`) starts from it, and only an explicit unpin is ever
 * stored.
 * Turning the pin **on** while the focused tab is solo (fullscreen) snaps it
 * back to docked, since the pinned strip lives in the tab bar and must be
 * visible — "pinned ⇒ never solo".
 */
export function useActionBarPin() {
  const [pinned, setPinned] = useDraft<boolean>("action-bar-pinned", true, {
    ttl: PIN_TTL,
  });
  const togglePin = () => {
    const next = !pinned;
    if (next && getSurfaceMode() === "solo") {
      setSurfaceMode("docked");
    }
    setPinned(next);
  };
  return { pinned, togglePin };
}
