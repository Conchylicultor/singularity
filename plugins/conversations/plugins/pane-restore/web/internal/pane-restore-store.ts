import { getChain, getBasePath, stripBasePath } from "@plugins/primitives/plugins/pane/web";

const LS_PREFIX = "miller.chain.";
const TTL = 30 * 24 * 60 * 60 * 1000;

type SavedSlot = { paneId: string; params: Record<string, string> };
type Envelope = { v: SavedSlot[]; ts: number };

function convIdFromPathname(pathname: string): string | null {
  const m = pathname.match(/^\/c\/([^/]+)/);
  return m ? decodeURIComponent(m[1]!) : null;
}

export function saveChainForConversation(convId: string, slots: SavedSlot[]): void {
  try {
    const envelope: Envelope = { v: slots, ts: Date.now() };
    localStorage.setItem(LS_PREFIX + convId, JSON.stringify(envelope));
  } catch (err) {
    if (err instanceof DOMException && err.name === "QuotaExceededError") return;
    throw err;
  }
}

export function loadChainForConversation(convId: string): SavedSlot[] | null {
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
    const pathname = stripBasePath(window.location.pathname, getBasePath());
    const convId = convIdFromPathname(pathname);
    if (!convId) return;
    const chain = getChain();
    if (chain.length === 0 || chain[0]?.paneId !== "conversation") return;
    const slots: SavedSlot[] = chain.map((s) => ({ paneId: s.paneId, params: s.params }));
    saveChainForConversation(convId, slots);
  }, 50);
}

if (typeof window !== "undefined") {
  window.addEventListener("popstate", handleNavigation);
  window.addEventListener("shell:navigate", handleNavigation);
}
