import { MdRestore } from "react-icons/md";
import {
  Button,
  ControlSizeProvider,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Surface } from "@plugins/primitives/plugins/css/plugins/surface/web";
import {
  Inset,
  Stack,
} from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { rigidClass } from "@plugins/primitives/plugins/css/plugins/rigid/web";
import { yieldClass } from "@plugins/primitives/plugins/css/plugins/yield/web";
import { confirmDialog } from "@plugins/primitives/plugins/overlay/plugins/imperative-dialog/plugins/confirm/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import {
  matchResource,
  useResource,
} from "@plugins/primitives/plugins/live-state/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { toast } from "@plugins/shell/plugins/notifications/web";
import {
  prototypeHistoryResource,
  restorePrototypeVersion,
  type PrototypeHistory,
  type PrototypeVersion,
} from "@plugins/apps/plugins/prototypes/plugins/files/core";
import { usePrototypeDetail } from "../context";
import { isPastStep, versionSteps } from "../internal/version-steps";

/**
 * "Viewing v3 · <request> · 2h ago   [Restore] [Back to latest]" — floated over
 * the stage while a recorded version is shown, in the corner the options picker
 * uses (which is hidden then, so the spot is free).
 *
 * It is over the STAGE, not in the header, on purpose. The header centres the
 * group before its spacer in the slack it shares with the title, so anything
 * appearing anywhere in the header — even past the spacer — takes slack and
 * slides the stepper's ‹ out from under the pointer. Over the stage it takes
 * nothing from the header, which keeps one width in every state. Being app DOM
 * over the stage, it is in no prototype's page and every stage gets it.
 *
 * Renders nothing unless the history says the stages are off the live folder;
 * the stepper shows the history's loading and error states.
 */
export function PastVersionPill() {
  const { name } = usePrototypeDetail();
  const history = useResource(prototypeHistoryResource, { name });
  return matchResource(history, {
    pending: () => null,
    error: () => null,
    ready: (h) => <ReadyPill history={h} />,
  });
}

function ReadyPill({ history }: { history: PrototypeHistory }) {
  const { name, shownVersion, showVersion } = usePrototypeDetail();
  const model = versionSteps(history, shownVersion);
  const current = model.current === null ? null : model.steps[model.current]!;
  // On the live folder there is nothing to say and nothing to offer.
  if (current !== null && !isPastStep(current)) return null;
  // A saved version the folder has moved past can be restored; a sha the
  // history no longer holds can only be left.
  const version = current?.kind === "version" ? current.version : null;

  return (
    <ControlSizeProvider size="sm">
      <Surface
        level="overlay"
        role="group"
        aria-label="Past version"
        className="max-w-[40rem]"
      >
        <Inset pad="xs">
          <Line>
            <Stack
              direction="row"
              gap="sm"
              align="center"
              className={yieldClass("x")}
            >
              {version ? (
                <>
                  <Text variant="caption" className={rigidClass()}>
                    Viewing v{version.n}
                  </Text>
                  {/* The one leaf that gives when the pill is tight. */}
                  <Text variant="caption" tone="muted">
                    {version.subject}
                  </Text>
                  <Text variant="caption" tone="muted" className={rigidClass()}>
                    <RelativeTime date={new Date(version.at)} />
                  </Text>
                  <Button
                    variant="outline"
                    className={rigidClass()}
                    onClick={() => confirmRestore(name, version, showVersion)}
                  >
                    <MdRestore />
                    Restore
                  </Button>
                </>
              ) : (
                <Text variant="caption" tone="muted">
                  This version is no longer in the prototype&apos;s history
                </Text>
              )}
              <Button
                variant="ghost"
                className={rigidClass()}
                onClick={() => showVersion(null)}
              >
                Back to latest
              </Button>
            </Stack>
          </Line>
        </Inset>
      </Surface>
    </ControlSizeProvider>
  );
}

/**
 * Restore `version`: confirm, then make it live again. The store saves the
 * current state first, so this loses nothing — which the dialog says, since
 * that is what makes it safe to click. On success the pane goes back to live,
 * where the restored design now is.
 */
function confirmRestore(
  name: string,
  version: PrototypeVersion,
  showVersion: (sha: string | null) => void,
) {
  void confirmDialog({
    title: `Restore v${version.n}?`,
    description:
      "Its files replace the live prototype. The current state is saved as a version first, so nothing is lost — you can step back to it.",
    confirmLabel: "Restore",
    onConfirm: async () => {
      const restored = await fetchEndpoint(restorePrototypeVersion, {
        name,
        sha: version.sha,
      });
      showVersion(null);
      toast({
        type: "prototype",
        title: `Restored v${version.n}`,
        description: `Recorded as v${restored.n}.`,
        variant: "success",
      });
    },
  });
}
