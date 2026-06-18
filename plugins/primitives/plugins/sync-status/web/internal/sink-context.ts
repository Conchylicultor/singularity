import { createContext } from "react";
import type { ScopedStore } from "@plugins/primitives/plugins/scoped-store/web";
import type { SyncStatusState } from "./store";

/** A retry thunk held in a ref so its identity never thrashes the store. */
export type RetryRef = { current: (() => void) | undefined };

/**
 * The per-surface write + retry handle reporters talk to. `setState` mutates the
 * scoped store; the `retries` map holds each error source's retry thunk ref,
 * which the indicator pulls imperatively to drive its "Retry" button (kept out
 * of store state so a fresh closure each render never re-renders consumers).
 */
export interface SyncStatusSink {
  setState: ScopedStore<SyncStatusState>["setState"];
  retries: Map<string, RetryRef>;
}

/** No-op sink: the context default, so `useReportSync` is a harmless no-op when
 *  no `<SyncStatusProvider>` is above it (unit tests / non-surface mounts). */
export const noopSink: SyncStatusSink = {
  setState: () => {},
  retries: new Map(),
};

/**
 * Carries the surface's sink down to reporters via plain React context, separate
 * from the scoped-store's own context (whose `useStoreApi` throws when no
 * Provider is above). We only need the write side here and it must tolerate
 * absence — hence the no-op default.
 */
export const SyncStatusSinkContext = createContext<SyncStatusSink>(noopSink);
