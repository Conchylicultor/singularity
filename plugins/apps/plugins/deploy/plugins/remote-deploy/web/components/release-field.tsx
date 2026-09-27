import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  FieldDef,
  FieldExtensionProps,
} from "@plugins/primitives/plugins/data-view/web";
import { matchResource } from "@plugins/primitives/plugins/live-state/web";
import { useLive } from "@plugins/network/plugins/live/web";
import { useServerHealthMap } from "@plugins/apps/plugins/deploy/plugins/health/web";
import {
  deployments,
  type Deployment,
} from "@plugins/apps/plugins/deploy/plugins/deployments/core";
import { useDeploymentsListServerId } from "@plugins/apps/plugins/deploy/plugins/deployments/web";
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
 * A field extension is handed no host rows, so it cannot simply read the
 * `deployments` collection's default window and hope that lines up with what
 * the host list shows — past the window's rank cutoff it wouldn't. Instead it
 * reads `useDeploymentsListServerId()` (published by `DeploymentsBody`) and
 * asks the SAME `useLive(deployments, { where: { serverId } })` query the host
 * list itself subscribes to, so the two share one subscription and can never
 * disagree about which rows exist.
 *
 * **Why the probes.** A field extension mounts once for the whole surface, but
 * the answer is per `(composition, platform)` — one query per row. Hooks cannot
 * be called in a loop, so each pair is asked by its own headless component and
 * folded back into one map. `value` then reads the map synchronously, which is
 * what makes filter/group/sort agree with the chips instead of trailing them.
 */
export function ReleaseField({
  render,
}: FieldExtensionProps<Deployment>): ReactNode {
  const serverId = useDeploymentsListServerId();
  const rows = useLive(deployments, { where: { serverId } });
  const [infos, setInfos] = useState<ReadonlyMap<string, ReleaseInfo>>(
    new Map(),
  );

  const onResolve = useCallback((deploymentId: string, info: ReleaseInfo) => {
    setInfos((prev) =>
      prev.get(deploymentId) === info
        ? prev
        : new Map(prev).set(deploymentId, info),
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
      {matchResource(rows, {
        // Nothing to probe until the rows land, and nothing to fake: the column
        // simply has no answers yet, which `value: null` already says.
        pending: () => null,
        error: () => null,
        ready: (loaded) => (
          <CandidateProbes rows={loaded} onResolve={onResolve} />
        ),
      })}
      {render(fields)}
    </>
  );
}

/**
 * One probe per row that has a platform to ask about. A server with no verified
 * platform has no candidate question at all — its rows carry no probe and their
 * cell renders nothing, the honest reading of "we have not discovered what this
 * box accepts". Until the verdicts load there is no question to ask yet either:
 * no probe, and the column still has no answers.
 */
function CandidateProbes({
  rows,
  onResolve,
}: {
  rows: readonly Deployment[];
  onResolve: (deploymentId: string, info: ReleaseInfo) => void;
}): ReactNode {
  // Exactly the servers these rows belong to (today, one — `rows` is already
  // scoped to a single server's list — but this asks the question generically
  // rather than assuming that scope).
  const serverIds = useMemo(
    () => Array.from(new Set(rows.map((d) => d.serverId))),
    [rows],
  );
  const health = useServerHealthMap(serverIds);
  if (health.pending) return null;
  return (
    <>
      {rows.map((d) => {
        const platform = health.data.get(d.serverId)?.platform ?? null;
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
