import type { ReactNode } from "react";
import {
  Loading,
  type LoadingVariant,
} from "@plugins/primitives/plugins/loading/web";
import { ResourceErrorInline } from "@plugins/primitives/plugins/live-state/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { FilterError } from "@plugins/network/plugins/live/plugins/filter/core";
import type { BodyState } from "../internal/body-state";
import {
  UnavailableFilterRuleError,
  UnavailableSortRuleError,
} from "../internal/live-filter";

/**
 * What the body renders in place of the active view (`resolveBodyState`'s
 * non-view arms) — the ONE rendering of each, whichever origin produced it:
 *
 * - `server-error`: the query that could not be formed or paged, in words;
 * - `error`: a failed read — the host's `errorState`, else the read's own
 *   failure with Retry (or Reload for an out-of-date tab);
 * - `field-error`: a field the view is laid out by failed to load its values
 *   — the host's `errorState`, else that failure, naming the field;
 * - `loading`: the host's `loadingState`, else the view type's skeleton.
 */
export function BodyFallback(props: {
  state: Exclude<BodyState, { kind: "view" }>;
  errorState: ReactNode | undefined;
  loadingState: ReactNode | undefined;
  loadingVariant: LoadingVariant | undefined;
  loadingCount: number | undefined;
}): ReactNode {
  const { state } = props;
  switch (state.kind) {
    case "server-error":
      return (
        <Placeholder tone="error">
          {state.error instanceof FilterError
            ? `This filter is too large to run: ${state.error.message}`
            : state.error instanceof UnavailableFilterRuleError ||
                state.error instanceof UnavailableSortRuleError
              ? state.error.message
              : `Couldn't load: ${state.error.message}`}
        </Placeholder>
      );
    case "error":
      return (
        props.errorState ?? (
          <ResourceErrorInline
            error={state.error.error}
            refetch={state.error.refetch}
            variant="block"
          />
        )
      );
    case "field-error":
      return (
        props.errorState ?? (
          <ResourceErrorInline
            error={state.error}
            refetch={state.refetch}
            subject={state.field}
            variant="block"
          />
        )
      );
    case "loading":
      return (
        props.loadingState ?? (
          <Loading
            variant={props.loadingVariant ?? "rows"}
            count={props.loadingCount}
          />
        )
      );
  }
}
