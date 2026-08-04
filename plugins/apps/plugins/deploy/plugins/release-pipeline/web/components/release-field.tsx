import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type {
  FieldDef,
  FieldExtensionProps,
} from "@plugins/primitives/plugins/data-view/web";
import { matchResource, useResource } from "@plugins/primitives/plugins/live-state/web";
import { useServerHealthMap } from "@plugins/apps/plugins/deploy/plugins/health/web";
import {
  deploymentsResource,
  type Deployment,
} from "@plugins/apps/plugins/deploy/plugins/deployments/core";
import type { PlatformTag } from "@plugins/release/core";
import { RELEASE_STATE_OPTIONS } from "../../core";
import { useReleaseInfo, type ReleaseInfo } from "../internal/use-release-info";
import { ReleaseChip } from "./release-chip";

/**
 * The `Release` column of the deployments list, contributed through
 * `Deployments.Fields` so the list plugin never names the release feature.
 *
 * It is an `enum` field with a custom `cell`, which is what buys the filter chip
 * and group-by for free — *what on this box is stale?* is then a question the
 * generic DataView chrome already answers.
 *
 * **Why the probes.** A field extension mounts once for the whole surface, but
 * the answer is per `(composition, platform)` — one query per row. Hooks cannot
 * be called in a loop, so each pair is asked by its own headless component and
 * folded back into one map. `value` then reads the map synchronously, which is
 * what makes filter/group/sort agree with the chips instead of trailing them.
 */
export function ReleaseField({ render }: FieldExtensionProps<Deployment>): ReactNode {
  const deployments = useResource(deploymentsResource);
  const [infos, setInfos] = useState<ReadonlyMap<string, ReleaseInfo>>(new Map());

  const onResolve = useCallback((deploymentId: string, info: ReleaseInfo) => {
    setInfos((prev) =>
      prev.get(deploymentId) === info ? prev : new Map(prev).set(deploymentId, info),
    );
  }, []);

  const fields = useMemo<FieldDef<Deployment>[]>(
    () => [
      {
        id: "release",
        label: "Release",
        type: "enum",
        align: "end",
        options: RELEASE_STATE_OPTIONS,
        value: (d) => infos.get(d.id)?.state ?? null,
        cell: (d) => <ReleaseChip info={infos.get(d.id)} />,
      },
    ],
    [infos],
  );

  return (
    <>
      {matchResource(deployments, {
        // Nothing to probe until the rows land, and nothing to fake: the column
        // simply has no answers yet, which `value: null` already says.
        pending: () => null,
        error: () => null,
        ready: (rows) => <CandidateProbes rows={rows} onResolve={onResolve} />,
      })}
      {render(fields)}
    </>
  );
}

/**
 * One probe per row that has a platform to ask about. A server with no verified
 * platform has no candidate question at all — its rows carry no probe and their
 * cell renders nothing, the honest reading of "we have not discovered what this
 * box accepts".
 */
function CandidateProbes({
  rows,
  onResolve,
}: {
  rows: readonly Deployment[];
  onResolve: (deploymentId: string, info: ReleaseInfo) => void;
}): ReactNode {
  const healthMap = useServerHealthMap();
  return (
    <>
      {rows.map((d) => {
        const platform = healthMap.get(d.serverId)?.platform ?? null;
        if (!platform) return null;
        return (
          <CandidateProbe
            key={d.id}
            deploymentId={d.id}
            composition={d.compositionId}
            platform={platform}
            onResolve={onResolve}
          />
        );
      })}
    </>
  );
}

/**
 * One `(composition, platform)` question, mounted as its own component so its
 * hooks are stable while the set of rows changes. Renders nothing — it exists to
 * hold a subscription and report its answer upward.
 */
function CandidateProbe({
  deploymentId,
  composition,
  platform,
  onResolve,
}: {
  deploymentId: string;
  composition: string;
  platform: PlatformTag;
  onResolve: (deploymentId: string, info: ReleaseInfo) => void;
}): null {
  const info = useReleaseInfo(composition, platform);
  // `info` is memoized and `onResolve` is stable, so this fires only when the
  // answer actually changes; the parent's setter bails out on an identical
  // value, so there is no update loop.
  useEffect(() => {
    onResolve(deploymentId, info);
  }, [deploymentId, info, onResolve]);
  return null;
}
