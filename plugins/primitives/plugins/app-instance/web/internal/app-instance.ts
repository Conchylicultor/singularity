import { getTabId } from "@plugins/primitives/plugins/tab-id/web";

/**
 * The `PerformanceNavigationTiming.type` values, named locally so the union is
 * the primitive's own contract rather than whatever the ambient DOM lib calls
 * it (newer libs ship an unrelated global `NavigationType` for the Navigation
 * API, whose members are `push | replace | reload | traverse`).
 */
export type NavigationType = "navigate" | "reload" | "back_forward" | "prerender";

/** LRU registry of this browser tab's live instance generations, active last. */
const REGISTRY_PREFIX = "singularity.appInstances";

/**
 * How many generations stay restorable in one browser tab. This is a real UX
 * knob, not hygiene: Back into an older instance is a *cross-document* load
 * that re-boots from storage, so `N` is how many bookmark hops back can be
 * fully restored. Overflow evicts from the head and sweeps the payload keys.
 */
export const RETAINED_INSTANCES = 8;

let resolvedInstanceId: string | undefined;
let mintedInstance = false;
let pageshowListener: ((event: PageTransitionEvent) => void) | undefined;

/**
 * The ONE `getEntriesByType("navigation")` type read in the app.
 *
 * Returns `null` when the entry is genuinely unavailable (jsdom, older
 * engines) — an honest absence, not an absorbed failure: callers must decide
 * what "unknown" means, and {@link getAppInstanceId} deliberately reads it as
 * `reload` because unknown must never destroy state.
 */
export function getNavigationType(): NavigationType | null {
  if (typeof performance === "undefined" || typeof performance.getEntriesByType !== "function") {
    return null;
  }
  const entry = performance.getEntriesByType("navigation")[0] as
    | PerformanceNavigationTiming
    | undefined;
  return entry ? (entry.type as NavigationType) : null;
}

/**
 * This document's instance generation — which running SPA app-state (tab set,
 * routes, focus, surface mode, window geometry) it belongs to.
 *
 * Memoized at module level, resolved on first call:
 *
 * | `getNavigationType()`     | `history.state.appInstance` | Action                          |
 * |---------------------------|-----------------------------|---------------------------------|
 * | `navigate` / `prerender`  | anything                    | mint a fresh generation         |
 * | `reload` / `back_forward` | present                     | adopt it                        |
 * | `reload` / `back_forward` | absent                      | adopt last-active; mint if none |
 * | `null` (unavailable)      | —                           | exactly as `reload`             |
 *
 * Both the registry write and the eviction sweep live inside the memoized
 * resolver, so the StrictMode double-invoke of the first caller is idempotent.
 */
export function getAppInstanceId(): string {
  resolvedInstanceId ??= resolveInstanceId();
  return resolvedInstanceId;
}

/**
 * `true` iff this document **minted** its generation rather than adopting one —
 * i.e. it is a brand-new instance that must restore nothing.
 *
 * This is the resolved outcome, not a re-derivation from the navigation type:
 * the "preserving load, but the registry was empty" row also mints, and that is
 * just as fresh as a bookmark hop. Resolves the generation first, so it is
 * valid whatever order a consumer calls it in.
 */
export function isFreshAppInstance(): boolean {
  getAppInstanceId();
  return mintedInstance;
}

/** `${prefix}:${tabId}:${generation}` — the instance-scoped storage key. */
export function appInstanceKey(prefix: string): string {
  return `${prefix}:${getTabId()}:${getAppInstanceId()}`;
}

/**
 * Whether this document is allowed to inherit a pre-generations payload from
 * {@link legacyInstanceKey} — the ONE sanctioned home for that predicate, so
 * the reasoning below lives in one place rather than being re-derived (and
 * eventually drifting) in every consumer that persists instance state.
 *
 * Three cases, and getting any of them wrong fails *silently*:
 *
 * 1. **Adopting** an existing generation ⇒ yes. This is a preserving load
 *    continuing an instance; if the gen-scoped key is missing it is because
 *    this session predates the deploy.
 * 2. **Minting from a preserving load** (`reload` / `back_forward` / an
 *    unavailable nav type, with nothing to adopt) ⇒ **yes — this IS the
 *    migration.** A session that predates generations has no `appInstance` on
 *    its history entry *and* an empty registry, so it necessarily resolves to a
 *    mint. Gating on `!isFreshAppInstance()` alone therefore makes the
 *    migration unreachable and resets every live session's tabs on its next
 *    Cmd-R — which is why freshness is not sufficient on its own.
 * 3. **Minting from an external navigation** (`navigate` / `prerender`) ⇒
 *    **never.** A bookmark, address-bar entry or cross-app link must restore
 *    nothing; inheriting here resurrects the pre-deploy tab set on exactly the
 *    load whose whole purpose is to start clean — the original bug, one last
 *    time.
 *
 * So freshness alone cannot decide it; for a mint the deciding question is what
 * *kind* of load minted it, and `navigate` / `prerender` is that discriminator.
 * (`null` counts as preserving, consistent with the rest of the decision
 * table.) A preserving mint for a non-migration reason — an evicted or corrupt
 * registry — is harmless: post-deploy sessions write gen-scoped keys and
 * consume the legacy one, so there is nothing left to inherit.
 */
export function mayAdoptLegacyPayload(): boolean {
  if (!isFreshAppInstance()) return true;
  const navigationType = getNavigationType();
  return navigationType !== "navigate" && navigationType !== "prerender";
}

/**
 * `${prefix}:${tabId}` — the pre-instance key shape, kept alive only so the
 * first post-deploy load doesn't reset live sessions. **Migration only, and
 * only ever behind {@link mayAdoptLegacyPayload}:**
 *
 * ```ts
 * const key = appInstanceKey(p);
 * let raw = sessionStorage.getItem(key);
 * if (raw === null && mayAdoptLegacyPayload()) {
 *   const legacy = legacyInstanceKey(p);
 *   raw = sessionStorage.getItem(legacy); // consume…
 *   sessionStorage.removeItem(legacy);    // …exactly once, ever
 * }
 * ```
 *
 * Consuming the key closes the hole from the other side: without the
 * `removeItem` the blob outlives the migrating load and a later external
 * navigation in the same browser tab could still pick it up. Remove both sites
 * once deployed.
 */
export function legacyInstanceKey(prefix: string): string {
  return `${prefix}:${getTabId()}`;
}

/** Stamp this document's instance onto a history-entry snapshot. */
export function stampAppInstance<T extends object>(state: T): T & { appInstance: string } {
  return { ...state, appInstance: getAppInstanceId() };
}

/**
 * The instance a history entry names, or `undefined` when it names none.
 *
 * `undefined` is an honest absence, not a swallowed error: legacy entries and
 * entries clobbered by a `replaceState({})` legitimately carry no instance, and
 * that case is a *row of the decision table* rather than a failure.
 */
export function readAppInstance(state: unknown): string | undefined {
  if (typeof state !== "object" || state === null) return undefined;
  const value = (state as { appInstance?: unknown }).appInstance;
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Drop the memoized generation (and its `pageshow` listener) between tests. */
export function resetAppInstanceForTests(): void {
  resolvedInstanceId = undefined;
  mintedInstance = false;
  if (pageshowListener && typeof window !== "undefined") {
    window.removeEventListener("pageshow", pageshowListener);
  }
  pageshowListener = undefined;
}

function resolveInstanceId(): string {
  const navigationType = getNavigationType();
  // `null` (unavailable) falls through to the preserving branch on purpose.
  const isFreshLoad = navigationType === "navigate" || navigationType === "prerender";
  const registry = readRegistry();

  // On a preserving load the entry's own stamp wins; a missing stamp degrades
  // to the last-active generation rather than a mint. That direction matters:
  // minting when a generation merely *could not be read* destroys every tab the
  // user had, while adopting a stale pointer at worst restores one instance too
  // many. `apps-layout`'s redirect clobbers `history.state`, so the absent case
  // is routine, not exotic.
  const adopted = isFreshLoad
    ? undefined
    : (readAppInstance(readHistoryState()) ?? registry.at(-1));
  const instanceId = adopted ?? crypto.randomUUID();
  // The *resolved outcome*, not the nav type: row 3 with an empty registry is a
  // preserving load that still ends up minting, and for every consumer that is
  // a fresh instance in the only sense that matters.
  mintedInstance = adopted === undefined;

  commitRegistry(registry, instanceId);
  installBfcacheHardening(instanceId);
  return instanceId;
}

function readHistoryState(): unknown {
  return typeof window === "undefined" ? undefined : window.history.state;
}

/**
 * A bfcache restore re-shows a document without any boot, so nothing would
 * re-point the registry at this (still very much alive) instance. Re-promote it
 * so the last-active pointer can't go stale behind a restored document.
 */
function installBfcacheHardening(instanceId: string): void {
  if (typeof window === "undefined") return;
  pageshowListener = (event: PageTransitionEvent) => {
    if (!event.persisted) return;
    commitRegistry(readRegistry(), instanceId);
  };
  window.addEventListener("pageshow", pageshowListener);
}

function registryKey(): string {
  return `${REGISTRY_PREFIX}:${getTabId()}`;
}

function readRegistry(): string[] {
  try {
    const raw = sessionStorage.getItem(registryKey());
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === "string");
    // eslint-disable-next-line promise-safety/no-bare-catch, promise-safety/no-absorbed-failure -- boot-critical, and `[]` really IS the right answer rather than a swallowed error republished as data: "no readable registry" is indistinguishable in effect from "this browser tab has no instances yet", the exact value a genuine first load produces, and the sole consumer (resolveInstanceId) already branches on empty as a first-class case. A discriminated result has nowhere to go — the registry IS the pointer to the payload keys, so an unreadable one means there is nothing to restore either way — and throwing would brick the session permanently with no user recovery path. The catch is bare because there is no narrower class to match on: the getter, JSON.parse and quota failures are all opaque DOMExceptions/SyntaxErrors.
  } catch {
    return [];
  }
}

/** Append-or-promote `instanceId` to the tail, cap at N, sweep what falls off. */
function commitRegistry(registry: string[], instanceId: string): void {
  const promoted = [...registry.filter((entry) => entry !== instanceId), instanceId];
  const retained = promoted.slice(-RETAINED_INSTANCES);
  writeRegistry(retained);
  if (retained.length < promoted.length) sweepEvicted(retained);
}

function writeRegistry(registry: string[]): void {
  try {
    sessionStorage.setItem(registryKey(), JSON.stringify(registry));
    // eslint-disable-next-line promise-safety/no-bare-catch -- same policy as the read: a blocked or full sessionStorage must not brick boot. The generation is already resolved in memory, so this document keeps working; it simply won't be restorable later.
  } catch {
    // Intentionally unrecoverable-in-place: see the read's rationale.
  }
}

/**
 * Delete every payload key belonging to a no-longer-retained generation.
 *
 * The `^[^:]+:<tabId>:(.+)$` shape — with `<tabId>` pinned to position 2 —
 * makes it structurally impossible to touch `singularity.tabId` (no colon), the
 * 2-segment legacy keys, or this registry's own key (also 2 segments).
 */
function sweepEvicted(retained: string[]): void {
  const pattern = new RegExp(`^[^:]+:${escapeRegExp(getTabId())}:(.+)$`);
  try {
    const doomed: string[] = [];
    // `storage.length` / `storage.key(i)`, never `Object.keys(sessionStorage)`:
    // a Storage's entries are not own enumerable properties, and the vitest
    // suites install a class instance whose only own property is private state.
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key === null) continue;
      const generation = pattern.exec(key)?.[1];
      if (generation !== undefined && !retained.includes(generation)) doomed.push(key);
    }
    for (const key of doomed) sessionStorage.removeItem(key);
    // eslint-disable-next-line promise-safety/no-bare-catch -- eviction is pure housekeeping on a best-effort storage; failing to reclaim bytes must never take down a boot that has already resolved its generation.
  } catch {
    // Leaves stale generations on disk until the next successful sweep.
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
