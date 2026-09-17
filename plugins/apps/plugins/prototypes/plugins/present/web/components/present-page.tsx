import {
  matchResource,
  useResource,
} from "@plugins/primitives/plugins/live-state/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { hoverRevealGroup } from "@plugins/primitives/plugins/hover-reveal/web";
import {
  prototypeHistoryResource,
  type PrototypeVersion,
} from "@plugins/apps/plugins/prototypes/plugins/files/core";
import {
  PrototypeDetailProvider,
  VersionStepShortcuts,
} from "@plugins/apps/plugins/prototypes/plugins/gallery/web";
import { prototypePresentPane } from "../panes";
import { PresentStage } from "./present-stage";

/**
 * The new-tab presentation: the prototype filling the page, with the options
 * picker floating over it. No header and no exit button — the tab itself is
 * the presentation, and closing it is how you leave.
 *
 * A `sha` in the URL opens that recorded version (the one the detail pane was
 * showing when the tab was opened); it is looked up in the history, so the
 * picker can offer the options THAT version declares.
 */
export function PresentPage() {
  const { name, sha } = prototypePresentPane.useParams();
  return sha === undefined ? (
    <PresentPageBody name={name} version={null} />
  ) : (
    <VersionPresentPage name={name} sha={sha} />
  );
}

function VersionPresentPage({ name, sha }: { name: string; sha: string }) {
  const history = useResource(prototypeHistoryResource, { name });
  return matchResource(history, {
    pending: () => <Loading variant="block" />,
    ready: (h) => {
      const version = h.versions.find((v) => v.sha === sha);
      return version ? (
        <PresentPageBody name={name} version={version} />
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
}: {
  name: string;
  version: PrototypeVersion | null;
}) {
  return (
    <PrototypeDetailProvider
      name={name}
      initialVersion={version}
      // No stage switcher on this page: it shows the presentation, never a
      // stage, so nothing asks to change one.
      stageId={undefined}
      onStageChange={noStageChange}
    >
      {/* No pane header here to hold the version stepper's `[` / `]`. */}
      <VersionStepShortcuts />
      <div className={cn("relative size-full bg-background", hoverRevealGroup)}>
        <PresentStage name={name} />
      </div>
    </PrototypeDetailProvider>
  );
}

function noStageChange(): void {
  throw new Error("The present page has no stages to switch.");
}
