import { getRoute } from "@plugins/primitives/plugins/pane/web";

const LS_PREFIX = "route.restore.";
const TTL = 30 * 24 * 60 * 60 * 1000;

type SavedSlot = { paneId: string; params: Record<string, string>; input?: Record<string, string> };
type Envelope = { v: SavedSlot[]; ts: number };

export function saveRouteForConversation(convId: string, slots: SavedSlot[]): void {
  try {
    const envelope: Envelope = { v: slots, ts: Date.now() };
    localStorage.setItem(LS_PREFIX + convId, JSON.stringify(envelope));
  } catch (err) {
    if (err instanceof DOMException && err.name === "QuotaExceededError") return;
    throw err;
  }
}

export function loadRouteForConversation(convId: string): SavedSlot[] | null {
  try {
    const raw = localStorage.getItem(LS_PREFIX + convId);
    if (!raw) return null;
    const envelope = JSON.parse(raw) as Envelope;
    if (Date.now() - envelope.ts > TTL) {
      localStorage.removeItem(LS_PREFIX + convId);
      return null;
    }
    return envelope.v;
  } catch {
    return null;
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function handleNavigation(): void {
  if (saveTimer !== null) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const route = getRoute();
    if (route.length === 0 || route[0]?.paneId !== "conversation") return;
    const convId = route[0]?.params.convId;
    if (!convId) return;
    const slots: SavedSlot[] = route.map((s) => ({ paneId: s.paneId, params: s.params, input: s.input }));
    saveRouteForConversation(convId, slots);
  }, 50);
}

if (typeof window !== "undefined") {
  window.addEventListener("popstate", handleNavigation);
  window.addEventListener("shell:navigate", handleNavigation);
}
