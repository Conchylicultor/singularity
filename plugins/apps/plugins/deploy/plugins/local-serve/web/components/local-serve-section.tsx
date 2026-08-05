import type { ReactNode } from "react";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { matchResource, useResource } from "@plugins/primitives/plugins/live-state/web";
import { useManifestItemByName } from "@plugins/plugin-meta/plugins/composition/web";
import type { CompositionManifestItem } from "@plugins/plugin-meta/plugins/composition/core";
import {
  ServeTargetPanel,
  useServeStatus,
} from "@plugins/build/plugins/serve-composition/web";
import { deploymentsResource } from "@plugins/apps/plugins/deploy/plugins/deployments/core";

/**
 * **Test locally** — the composition served on the shared gateway, next to the
 * button that ships it to a box.
 *
 * This is the rehearsal the four-step pipeline used to have a permanently inert
 * placeholder for, and it is honest about being a *partial* one: it runs the dev
 * build of the same closure, which is the only thing a macOS laptop can run when
 * the artifact is a `linux-x64` binary.
 */
export function LocalServeSection({ deploymentId }: { deploymentId: string }): ReactNode {
  const deployments = useResource(deploymentsResource);

  return matchResource(deployments, {
    pending: () => <Loading variant="rows" />,
    error: () => <Loading variant="rows" />,
    ready: (rows) => {
      const deployment = rows.find((d) => d.id === deploymentId);
      if (!deployment) {
        return <Placeholder tone="error">This deployment no longer exists.</Placeholder>;
      }
      return <LocalServe composition={deployment.compositionId} />;
    },
  });
}

function LocalServe({ composition }: { composition: string }): ReactNode {
  // Deploy is composition-NAME-keyed end to end (the row, the install dir, the
  // unit, `release --composition`), while the serve namespace is the manifest
  // item's `id` — so the lookup is by name and everything downstream takes the
  // item.
  const item = useManifestItemByName(composition);

  if (!item) {
    return (
      <Placeholder tone="error">
        No composition named “{composition}” in the compositions config, so there is
        nothing to serve. The deployment was created against a name that has since
        been renamed or removed.
      </Placeholder>
    );
  }
  return <ServeTarget item={item} />;
}

/**
 * A component of its own because the liveness read is asked for a composition
 * that exists — `useServeStatus` cannot be called before the lookup above has
 * settled the question of whether there is anything to ask about.
 */
function ServeTarget({ item }: { item: CompositionManifestItem }): ReactNode {
  const status = useServeStatus(item.id);

  return (
    <Stack gap="sm">
      {/* Up front, before any control: on a worktree backend the toggle writes
          an intent nothing here will act on, and the immediate build is refused
          by the server. Saying so first is cheaper than a refused POST. */}
      {status.kind === "ready" && !status.canServe && (
        <Text as="p" variant="caption" tone="destructive">
          Serve builds run on the main instance only — open singularity.localhost:9000.
        </Text>
      )}

      <ServeTargetPanel item={item} status={status} />

      <Text as="p" variant="caption" tone="muted">
        This is the dev build of the same closure, running on the shared gateway
        against its own empty database. It proves composition membership and
        closure completeness — that the app boots with exactly these plugins. It
        does <strong>not</strong> exercise packaging, config vendoring or
        first-boot migrations: those only happen in the packed artifact, and the
        first thing that runs them is the ship below.
      </Text>
    </Stack>
  );
}
