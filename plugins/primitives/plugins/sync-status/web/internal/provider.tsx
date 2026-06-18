import type { ReactNode } from "react";
import { createElement, useMemo } from "react";
import { SyncStatusSinkContext, type RetryRef } from "./sink-context";
import { initialState, SyncStatusStore } from "./store";

/**
 * Bridges the scoped store's imperative handle (only reachable INSIDE the
 * store's own Provider) plus a stable retry registry onto
 * {@link SyncStatusSinkContext}, so reporters write through a context that
 * defaults to a no-op sink when no provider is mounted.
 */
function SinkBridge({ children }: { children: ReactNode }): ReactNode {
  const store = SyncStatusStore.useStoreApi();
  const sink = useMemo(
    () => ({ setState: store.setState, retries: new Map<string, RetryRef>() }),
    [store],
  );
  return createElement(SyncStatusSinkContext.Provider, { value: sink }, children);
}

/**
 * Provides a surface-scoped sync-status store to its subtree. Renders no visible
 * UI — it only mounts the scoped store (one independent status per mount, i.e.
 * per surface tab) and wires its write handle into the sink context. The
 * companion `<SyncStatusIndicator/>` renders the aggregate.
 */
export function SyncStatusProvider({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  return (
    <SyncStatusStore.Provider initial={() => initialState()}>
      <SinkBridge>{children}</SinkBridge>
    </SyncStatusStore.Provider>
  );
}
