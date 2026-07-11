import { compareTxWatermark } from "../core/watermark";

// Client-side registry of the newest commit watermark seen per (key, params) —
// the causal floor the optimistic-mutation primitive compares mutation ack
// tokens against (Rules A/B of
// research/2026-07-11-global-never-revert-optimistic-edits.md). Populated by
// `NotificationsClient` from every full frame that carries one (sub-ack /
// update / FULL keyed delta / HTTP body — Rule B′; scoped deltas never do) —
// ALWAYS immediately before the cache write the watermark describes, so a
// QueryCache listener reading the registry synchronously sees the floor of the
// value it was just handed.
//
// Deliberately MODULE-LEVEL (not per-NotificationsClient): the optimistic hook
// runs inside QueryCache callbacks and jsdom tests exercise the overlay machine
// without a NotificationsProvider, so the read path must not require a client
// instance. One browser tab has exactly one live-state pipeline; each tab
// parses the shared socket's frames itself and populates its own registry.
// Monotonic adopt: an older watermark (a joiner-adopted flight, an out-of-order
// HTTP response) never regresses the stored floor.

const watermarks = new Map<string, string>();

type ResourceParams = Record<string, string>;

// Canonical params serialization — byte-identical to `paramsKey` in
// notifications-client.ts (sorted-key JSON), so `${key}\0${paramsKey}` here
// names exactly the same subscription id.
function paramsKey(params: ResourceParams | undefined): string {
  if (!params) return "{}";
  const keys = Object.keys(params).sort();
  const obj: ResourceParams = {};
  for (const k of keys) obj[k] = params[k]!;
  return JSON.stringify(obj);
}

function registryId(key: string, params: ResourceParams | undefined): string {
  return `${key}\0${paramsKey(params)}`;
}

/**
 * Adopt a frame's commit watermark for (key, params), monotonically: an equal
 * or older watermark than the stored one is a no-op (compared causally via
 * `compareTxWatermark`, never as strings).
 */
export function noteResourceWatermark(
  key: string,
  params: ResourceParams | undefined,
  watermark: string,
): void {
  const id = registryId(key, params);
  const prev = watermarks.get(id);
  if (prev !== undefined && compareTxWatermark(watermark, prev) <= 0) return;
  watermarks.set(id, watermark);
}

/**
 * The newest commit watermark seen for (key, params), or undefined when no
 * watermark-carrying frame has arrived yet (a fresh sub, a central-origin
 * resource — the central runtime has no capture hook, or a pre-watermark
 * server). Undefined means "no causal floor": a consumer may confirm by
 * content but must never deny.
 */
export function getResourceWatermark(
  key: string,
  params: ResourceParams | undefined = {},
): string | undefined {
  return watermarks.get(registryId(key, params));
}
