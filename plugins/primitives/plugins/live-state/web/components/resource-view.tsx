import type { ReactNode } from "react";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import type { GateDataOf, GateInput } from "../resource-utils";

export interface MatchResourceHandlers<R extends GateInput> {
  /** Rendered while loading. Default: `<Loading/>` (delayed — no flash on fast loads). */
  pending?: () => ReactNode;
  /** Rendered when the initial load failed (pending with an error). Default: an error Placeholder. */
  error?: (err: Error) => ReactNode;
  /** The only way to reach the data — called once settled. */
  ready: (data: GateDataOf<R>) => ReactNode;
}

/**
 * Exhaustive render-match over a resource result. There is no way to reach
 * `ready`'s data while pending and no way to skip the pending branch — the
 * structural replacement for `r.pending ? <default> : r.data`.
 */
export function matchResource<R extends GateInput>(
  result: R,
  handlers: MatchResourceHandlers<R>,
): ReactNode {
  if (!result.pending) {
    return handlers.ready((result as unknown as { data: GateDataOf<R> }).data);
  }
  const error = (result as { error?: Error | null }).error ?? null;
  if (error) {
    return handlers.error ? (
      handlers.error(error)
    ) : (
      <Placeholder tone="error">{error.message}</Placeholder>
    );
  }
  return handlers.pending ? handlers.pending() : <Loading />;
}

export interface ResourceViewProps<R extends GateInput> {
  resource: R;
  /** Only ever called with settled data. */
  children: (data: GateDataOf<R>) => ReactNode;
  /** Rendered while loading. Default: `<Loading/>` (delayed — no flash on fast loads). */
  fallback?: ReactNode;
  /** Rendered when the initial load failed. Default: an error Placeholder. */
  errorFallback?: (err: Error) => ReactNode;
}

/** Component sugar over `matchResource` for the common JSX case. */
export function ResourceView<R extends GateInput>({
  resource,
  children,
  fallback,
  errorFallback,
}: ResourceViewProps<R>): ReactNode {
  return matchResource(resource, {
    ready: children,
    pending: fallback === undefined ? undefined : () => fallback,
    error: errorFallback,
  });
}
