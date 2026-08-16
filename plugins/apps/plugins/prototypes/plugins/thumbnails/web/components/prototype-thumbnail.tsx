import type { ReactNode } from "react";
import { MdWarningAmber } from "react-icons/md";
import {
  matchResource,
  useResource,
} from "@plugins/primitives/plugins/live-state/web";
import { Overlay } from "@plugins/primitives/plugins/css/plugins/overlay/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { WithTooltip } from "@plugins/primitives/plugins/tooltip/web";
import {
  prototypeThumbnailsResource,
  prototypeThumbnailUrl,
  type ThumbnailState,
} from "../../core";

/**
 * A prototype's rendered preview, for use as a gallery card's cover.
 *
 * Three arms, because a render genuinely has three outcomes:
 *
 * - rendered → the cached PNG;
 * - not rendered yet (or still rendering) → the caller's `fallback`;
 * - failed → the `fallback` plus a visible marker saying so, with the reason on
 *   hover. Nothing was cached, so the next edit retries on its own.
 *
 * The `fallback` is the caller's art, not this plugin's: the gallery already
 * owns a cover for a prototype with no picture, and there is no reason for two
 * plugins to have an opinion about what that looks like.
 */
export function PrototypeThumbnail({
  name,
  fallback,
}: {
  name: string;
  fallback: ReactNode;
}) {
  const result = useResource(prototypeThumbnailsResource);

  return matchResource(result, {
    pending: () => <>{fallback}</>,
    error: () => <>{fallback}</>,
    ready: (states) => (
      <ThumbnailCover state={states[name]} fallback={fallback} />
    ),
  });
}

function ThumbnailCover({
  state,
  fallback,
}: {
  state: ThumbnailState | undefined;
  fallback: ReactNode;
}) {
  if (state?.status === "ready") {
    return (
      <img
        src={prototypeThumbnailUrl(state.key)}
        alt=""
        className="h-full w-full object-cover"
      />
    );
  }

  if (state?.status === "failed") {
    return (
      // Two non-obvious choices, both load-bearing:
      //
      // `behind`, not `above`: an `above` layer is click-through by design,
      // which would swallow the hover the marker's tooltip needs.
      //
      // `fill`: without it the children wrapper is in-flow, and a wrapper whose
      // only child is absolutely positioned collapses to zero height — so the
      // marker pins to the TOP edge of a zero-height box and lands above the
      // card, present in the DOM and invisible on screen.
      <Overlay behind={fallback} fill className="h-full w-full">
        <Pin to="bottom-right" offset="xs">
          <WithTooltip content={state.message} className="max-w-md">
            <Badge variant="warning" icon={<MdWarningAmber />}>
              Preview failed
            </Badge>
          </WithTooltip>
        </Pin>
      </Overlay>
    );
  }

  return <>{fallback}</>;
}
