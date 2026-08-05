import type { ReactElement } from "react";
import { MdBolt, MdOpenInNew } from "react-icons/md";
import type { ItemActionProps } from "@plugins/primitives/plugins/data-view/web";
import { RowActionButton } from "@plugins/primitives/plugins/row-actions/web";
import { useManifestItems } from "@plugins/plugin-meta/plugins/composition/web";
import type { CompositionManifestItem } from "@plugins/plugin-meta/plugins/composition/core";
import {
  useServeComposition,
  useServeStatus,
} from "@plugins/build/plugins/serve-composition/web";
import type { Deployment } from "@plugins/apps/plugins/deploy/plugins/deployments/core";

/**
 * The **serve** shortcut on a deployments row: one button that opens the
 * composition's local namespace when it is live, and starts serving it when it
 * is not.
 *
 * One button rather than two, because from the row there is exactly one thing
 * anyone wants — *look at this app locally* — and whether that costs a build is
 * a fact the row already knows. It never links to a namespace that is not
 * actually served: the state comes from the `composition.json` marker, not from
 * the `autoBuild` intent.
 */
export function ServeAction({ row }: ItemActionProps<Deployment>): ReactElement {
  // Name → item, because deploy is name-keyed and the serve namespace is the
  // item's id (they diverge for UI-created compositions).
  const item = useManifestItems().find((i) => i.name === row.compositionId);

  if (!item) {
    return (
      <RowActionButton
        icon={MdBolt}
        label="Serve locally"
        tooltip={`No composition named "${row.compositionId}" in the compositions config.`}
        disabled
      />
    );
  }
  return <ServeRowAction item={item} />;
}

/**
 * Split out so the liveness read happens only once there is a composition to
 * read it for — a hook cannot be called after an early return.
 */
function ServeRowAction({ item }: { item: CompositionManifestItem }): ReactElement {
  const status = useServeStatus(item.id);
  const { serve } = useServeComposition();

  if (status.kind === "pending") {
    return (
      <RowActionButton
        icon={MdBolt}
        label="Serve locally"
        tooltip="Checking what is served locally…"
        disabled
      />
    );
  }
  if (status.kind === "error") {
    return (
      <RowActionButton
        icon={MdBolt}
        label="Serve locally"
        tooltip={`Could not read the serve state: ${status.message}`}
        disabled
      />
    );
  }

  if (status.live.served) {
    const { url } = status.live;
    return (
      <RowActionButton
        icon={MdOpenInNew}
        label="Open the local serve"
        tooltip={`Open ${url}`}
        onClick={(e) => {
          e.stopPropagation();
          window.open(url, "_blank", "noopener");
        }}
      />
    );
  }
  return (
    <RowActionButton
      icon={MdBolt}
      label="Serve locally"
      tooltip={
        status.canServe
          ? `Build & serve ${item.name} at http://${item.id}.localhost:9000`
          : "Serve builds run on the main instance only — open singularity.localhost:9000."
      }
      disabled={!status.canServe}
      onClick={(e) => {
        e.stopPropagation();
        // `serve` persists the intent, kicks the main build AND toasts that the
        // build is running — the row adds no toast of its own.
        serve(item.id);
      }}
    />
  );
}
