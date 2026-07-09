import { getRoute, type PaneInput } from "@plugins/primitives/plugins/pane/web";
import { report } from "@plugins/reports/web";

const LS_PREFIX = "route.restore.";
const TTL = 30 * 24 * 60 * 60 * 1000;

// `input` mirrors PaneSlot.input. Persisted via JSON (localStorage), which
// round-trips booleans/numbers/nested objects — so it is the structured
// PaneInput bag, not a string map.
type SavedSlot = { paneId: string; params: Record<string, string>; input?: PaneInput };
type Envelope = { v: SavedSlot[]; ts: number };

// Tri-state so a genuine storage-read failure can never be mistaken for a
// legitimate "nothing to restore" (absorbable-failure guardrail, inventory #12).
// `restored` carries the saved layout; `none` means there is genuinely nothing
// to restore (absent key, expired TTL, or a storage backend that is simply
// unavailable — an environment condition, not our bug); `corrupt` means the
// bytes we wrote are now unreadable (parse failure, or an unrecognized shape —
// e.g. after a future Envelope schema change reads an old entry) — a real fault
// the caller must surface, never silently swallow into a fresh pane.
export type RouteRestore =
  | { kind: "restored"; slots: SavedSlot[] }
  | { kind: "none" }
  | { kind: "corrupt"; reason: string };

export function saveRouteForConversation(convId: string, slots: SavedSlot[]): void {
  try {
    const envelope: Envelope = { v: slots, ts: Date.now() };
    localStorage.setItem(LS_PREFIX + convId, JSON.stringify(envelope));
  } catch (err) {
    if (err instanceof DOMException && err.name === "QuotaExceededError") return;
    throw err;
  }
}

function isSavedSlot(value: unknown): value is SavedSlot {
  if (typeof value !== "object" || value === null) return false;
  const slot = value as Record<string, unknown>;
  return typeof slot.paneId === "string" && typeof slot.params === "object" && slot.params !== null;
}

function isEnvelope(value: unknown): value is Envelope {
  if (typeof value !== "object" || value === null) return false;
  const env = value as Record<string, unknown>;
  if (typeof env.ts !== "number" || !Number.isFinite(env.ts)) return false;
  if (!Array.isArray(env.v)) return false;
  return env.v.every(isSavedSlot);
}

export function loadRouteForConversation(convId: string): RouteRestore {
  let raw: string | null;
  try {
    raw = localStorage.getItem(LS_PREFIX + convId);
  } catch (err) {
    // Storage unavailable (private mode / blocked) is an environment condition,
    // not corruption of our data — degrade to "nothing to restore" so the user
    // is never locked out; a fault report here would be noise they can't act on.
    if (err instanceof DOMException) return { kind: "none" };
    throw err;
  }
  if (!raw) return { kind: "none" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    if (err instanceof SyntaxError) {
      localStorage.removeItem(LS_PREFIX + convId); // self-heal: drop the poison
      return { kind: "corrupt", reason: "malformed JSON" };
    }
    throw err;
  }

  if (!isEnvelope(parsed)) {
    localStorage.removeItem(LS_PREFIX + convId); // self-heal: drop the poison
    return { kind: "corrupt", reason: "unrecognized shape" };
  }

  if (Date.now() - parsed.ts > TTL) {
    localStorage.removeItem(LS_PREFIX + convId);
    return { kind: "none" };
  }
  return { kind: "restored", slots: parsed.v };
}

// Surface a corrupt saved-route entry as a deduped crash task (Reports pane +
// notification bell) via the generic client report channel. A stable errorType
// with no per-conversation detail means a schema-drift burst across many
// conversations collapses to a single task (crashFingerprint keys on
// errorType + stack). Fire-and-forget: report() never throws — it is the error
// path — and navigation must not depend on it.
export function reportCorruptSavedRoute(reason: string): void {
  void report({
    kind: "crash",
    source: "client-storage",
    message: `pane-restore: saved route unreadable (${reason})`,
    url: window.location.href,
    userAgent: navigator.userAgent,
    data: { errorType: "PaneRestoreCorrupt", stack: null },
  });
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
