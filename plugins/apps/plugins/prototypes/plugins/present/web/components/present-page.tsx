import type { ReactElement, ReactNode } from "react";
import {
  matchResource,
  useResource,
} from "@plugins/primitives/plugins/live-state/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { hoverRevealGroup } from "@plugins/primitives/plugins/hover-reveal/web";
import { PortalHost } from "@plugins/primitives/plugins/overlay/plugins/portal-host/web";
import {
  prototypeHistoryResource,
  type PrototypeVersion,
  type StoredPicks,
} from "@plugins/apps/plugins/prototypes/plugins/files/core";
import { PrototypeDetailProvider } from "@plugins/apps/plugins/prototypes/plugins/canvas/web";
import { prototypePresentPane } from "../panes";
import { LIVE_VERSION, decodePicks } from "../internal/present-link";
import { PresentStage } from "./present-stage";

/**
 * One frame presented as a page of its own (a new app tab, or a chromeless new
 * browser tab): the frame filling the page, its chrome on hover. No Exit — the
 * tab itself is the presentation, and closing it is how you leave.
 *
 * It mounts a one-frame canvas: the URL's version (looked up in the history,
 * so the options pill offers the options THAT version declares) and, when the
 * URL carries them, the frame's own picks — else the shared record, as frame A.
 */
export function PresentPage(): ReactElement {
  const { name, version, picks } = prototypePresentPane.useParams();
  const own = picks === undefined ? undefined : decodePicks(picks);
  return version === LIVE_VERSION ? (
    <PresentPageBody name={name} version={null} picks={own} />
  ) : (
    <VersionPresentPage name={name} sha={version} picks={own} />
  );
}

function VersionPresentPage({
  name,
  sha,
  picks,
}: {
  name: string;
  sha: string;
  picks: StoredPicks | undefined;
}): ReactNode {
  const history = useResource(prototypeHistoryResource, { name });
  return matchResource(history, {
    pending: () => <Loading variant="block" />,
    ready: (h) => {
      const version = h.versions.find((v) => v.sha === sha);
      return version ? (
        <PresentPageBody name={name} version={version} picks={picks} />
      ) : (
        <Text as="div" variant="body" tone="muted" className="p-lg">
          This version is no longer in the prototype&apos;s history.
        </Text>
      );
    },
  });
}

function PresentPageBody({
  name,
  version,
  picks,
}: {
  name: string;
  version: PrototypeVersion | null;
  picks: StoredPicks | undefined;
}): ReactElement {
  return (
    <PrototypeDetailProvider
      name={name}
      initialVersion={version}
      {...(picks === undefined ? {} : { initialPicks: picks })}
    >
      <div className={cn("relative size-full bg-background", hoverRevealGroup)}>
        <PortalHost>
          <PresentStage name={name} />
        </PortalHost>
      </div>
    </PrototypeDetailProvider>
  );
}
