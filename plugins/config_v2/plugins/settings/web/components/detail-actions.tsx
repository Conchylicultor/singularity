import { ConfigDetail } from "../internal/detail-action-slot";
import type { ConfigDetailActionContext } from "../internal/detail-action-slot";

/**
 * Renders every `ConfigDetail.Action` contribution with the editing context.
 *
 * Lives in its own file purely so the slot namespace (`ConfigDetail`) and the
 * pane component (`ConfigDetail` in config-detail.tsx) don't collide on a name
 * they both legitimately want.
 */
export function ConfigDetailActions(context: ConfigDetailActionContext) {
  return (
    <ConfigDetail.Action.Render>
      {(item) => <item.component {...context} />}
    </ConfigDetail.Action.Render>
  );
}
