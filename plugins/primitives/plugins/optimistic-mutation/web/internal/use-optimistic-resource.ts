import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useResource, queryKeyFor } from "@plugins/primitives/plugins/live-state/web";
import type { ResourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import {
  confirmPass,
  markResolved,
  removeOp,
  replay,
  type PendingOp,
} from "./overlay";

export interface UseOptimisticResourceArgs<
  Data,
  Vars,
  P extends Record<string, string> = Record<string, string>,
> {
  resource: ResourceDescriptor<Data, P>;
  params?: P;
  /** Pure predicted next state. Must not mutate `current`. */
  apply: (current: Data, vars: Vars) => Data;
  /** Network thunk; resolves on server 2xx (the op was accepted). */
  mutate: (vars: Vars) => Promise<void>;
  /**
   * Has this freshly-arrived server snapshot already reflected `vars`?
   * Default (coarse): clear a resolved op on the first push after it resolved.
   * Override for precise content checks (e.g. "row id X present").
   */
  isConfirmedBy?: (serverData: Data, vars: Vars) => boolean;
  onError?: (err: unknown, vars: Vars) => void;
}

export interface UseOptimisticResourceResult<Data, Vars> {
  /** Server truth with all pending ops replayed; never undefined. */
  data: Data;
  /** Forwarded from useResource (true until the first authoritative value). */
  pending: boolean;
  /** Enqueue an overlay op + fire `mutate`; returns the minted opId. */
  dispatch: (vars: Vars) => string;
  inFlight: ReadonlyArray<{ opId: string; vars: Vars }>;
}

export function useOptimisticResource<
  Data,
  Vars,
  P extends Record<string, string> = Record<string, string>,
>(
  args: UseOptimisticResourceArgs<Data, Vars, P>,
): UseOptimisticResourceResult<Data, Vars> {
  const { resource, params, apply, mutate, isConfirmedBy, onError } = args;
  const queryClient = useQueryClient();
  const result = useResource(resource, params);
  const base = result.pending ? resource.initialData : result.data;

  const [pending, setPending] = useState<ReadonlyArray<PendingOp<Vars>>>([]);

  // Latest-value refs so the QueryCache subscription effect can stay mounted for
  // the resource's lifetime without re-subscribing on every render.
  const applyRef = useRef(apply);
  applyRef.current = apply;
  const isConfirmedByRef = useRef(isConfirmedBy);
  isConfirmedByRef.current = isConfirmedBy;

  const targetKey = useMemo(
    () => JSON.stringify(queryKeyFor(resource.key, params)),
    [resource.key, params],
  );

  // Subscribe to the TanStack QueryCache: every authoritative push (the WS path
  // does setQueryData → an "updated" cache event for our exact key) runs the
  // confirmation pass and drops the resolved ops the server has absorbed.
  // No polling — this is push-driven by the cache itself.
  useEffect(() => {
    const cache = queryClient.getQueryCache();
    return cache.subscribe((event) => {
      if (event.type !== "updated") return;
      if (JSON.stringify(event.query.queryKey) !== targetKey) return;
      const serverData = event.query.state.data as Data | undefined;
      if (serverData === undefined) return;
      setPending((prev) => {
        const next = confirmPass(prev, serverData, isConfirmedByRef.current);
        return next.length === prev.length ? prev : next;
      });
    });
  }, [queryClient, targetKey]);

  const data = useMemo(
    // applyRef is read through a stable ref; recompute when base or pending change.
    () => replay(base, pending, applyRef.current),
    [base, pending],
  );

  const dispatch = useCallback(
    (vars: Vars): string => {
      const opId = crypto.randomUUID();
      setPending((prev) => [...prev, { opId, vars, resolved: false }]);
      void mutate(vars).then(
        () => setPending((prev) => markResolved(prev, opId)),
        (err: unknown) => {
          // Reject = rollback: removing the op recomputes the overlay without it.
          // The cache was never mutated, so there is nothing else to undo.
          setPending((prev) => removeOp(prev, opId));
          if (onError) onError(err, vars);
        },
      );
      return opId;
    },
    [mutate, onError],
  );

  const inFlight = useMemo(
    () => pending.map((op) => ({ opId: op.opId, vars: op.vars })),
    [pending],
  );

  return { data, pending: result.pending, dispatch, inFlight };
}
