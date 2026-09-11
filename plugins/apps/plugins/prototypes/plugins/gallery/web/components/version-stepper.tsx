import { useMemo, useState } from "react";
import { MdChevronLeft, MdChevronRight } from "react-icons/md";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { InlinePopover } from "@plugins/primitives/plugins/overlay/plugins/popover/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { useSurfaceShortcuts } from "@plugins/primitives/plugins/shortcuts/web";
import { useEventCallback } from "@plugins/primitives/plugins/latest-ref/web";
import {
  matchResource,
  useResource,
} from "@plugins/primitives/plugins/live-state/web";
import {
  prototypeHistoryResource,
  type PrototypeHistory,
} from "@plugins/apps/plugins/prototypes/plugins/files/core";
import { usePrototypeDetail } from "../context";
import {
  shaForStep,
  stepBy,
  stepLabel,
  versionSteps,
  type VersionStep,
} from "../internal/version-steps";
import { VersionList } from "./version-list";

/**
 * The label's width, the same in every state: a floor wide enough for the
 * longest form it takes ("Live · unsaved", "v12 · Latest", "Unknown version"),
 * with the text centred in it. The header shares its slack between the title
 * and the spacer, so the group before the spacer sits roughly centred: any
 * change in the header's width would slide the ‹ and › out from under the
 * pointer mid-click. For the same reason Restore and Back to latest are not in
 * the header at all — they float over the stage (`PastVersionPill`).
 */
const LABEL_WIDTH = "min-w-36";

/**
 * `‹  v3 of 7  ›` — step through the prototype's recorded versions. A zero-prop
 * contribution to `prototypeDetailPane.Actions`, beside the stage switcher.
 *
 * It moves the pane's `shownVersion` and nothing else: every frame of the open
 * prototype (Focus, Compare's mock half, Present, the new-tab link) reads its
 * URL from `usePrototypeSrc`, so they all follow without knowing a stepper
 * exists.
 *
 * While the history is not known yet the arrows are disabled over a loading
 * label — never "v0 of 0", which would be a claim about a prototype whose
 * history simply has not arrived.
 */
export function VersionStepper() {
  const { name } = usePrototypeDetail();
  const history = useResource(prototypeHistoryResource, { name });
  return matchResource(history, {
    pending: () => <PendingStepper />,
    error: (err) => (
      <Text variant="caption" tone="destructive" title={err.message}>
        Version history unavailable
      </Text>
    ),
    ready: (h) => <ReadyStepper history={h} />,
  });
}

function PendingStepper() {
  return (
    <Stack direction="row" gap="2xs" align="center">
      <IconButton icon={MdChevronLeft} label="Previous version" disabled />
      {/* The label's own box, so the arrows sit where they will once it loads. */}
      <Button variant="ghost" disabled className={LABEL_WIDTH}>
        <Loading variant="block" className="h-4 w-16" />
      </Button>
      <IconButton icon={MdChevronRight} label="Next version" disabled />
    </Stack>
  );
}

function ReadyStepper({ history }: { history: PrototypeHistory }) {
  const { shownVersion, showVersion } = usePrototypeDetail();
  const [listOpen, setListOpen] = useState(false);

  const model = versionSteps(history, shownVersion);
  const current = model.current === null ? null : model.steps[model.current]!;
  const prev = stepBy(model, -1);
  const next = stepBy(model, 1);

  const go = (step: VersionStep | null) => {
    if (step) showVersion(shaForStep(step));
  };
  const stepBack = useEventCallback(() => go(prev));
  const stepForward = useEventCallback(() => go(next));

  // Scoped to this surface, and — being plain keys — silent while a text field
  // has focus, so `[` still types. Stable identity (the handlers read the
  // latest model through `useEventCallback`), so they register once.
  const shortcuts = useMemo(
    () => [
      {
        id: "prototypes.version-back",
        keys: "[",
        label: "Previous version",
        group: "Prototypes",
        handler: stepBack,
      },
      {
        id: "prototypes.version-forward",
        keys: "]",
        label: "Next version",
        group: "Prototypes",
        handler: stepForward,
      },
    ],
    [stepBack, stepForward],
  );
  useSurfaceShortcuts(shortcuts);

  return (
    <Stack direction="row" gap="2xs" align="center">
      <IconButton
        icon={MdChevronLeft}
        label="Previous version"
        shortcut="["
        disabled={prev === null}
        onClick={stepBack}
      />
      <InlinePopover
        open={listOpen}
        onOpenChange={setListOpen}
        align="center"
        width="3xl"
        maxHeight="xl"
        tooltip={<StepTooltip step={current} />}
        trigger={
          <Button variant="ghost" className={LABEL_WIDTH}>
            <span className="tabular-nums">
              {current === null
                ? "Unknown version"
                : stepLabel(current, model.newestN)}
            </span>
          </Button>
        }
      >
        <VersionList
          history={history}
          selected={
            current?.kind === "version" ? current.version.sha : undefined
          }
          onPick={(version) => {
            const step = model.steps.find(
              (s) => s.kind === "version" && s.version.sha === version.sha,
            );
            go(step ?? null);
            setListOpen(false);
          }}
        />
      </InlinePopover>
      <IconButton
        icon={MdChevronRight}
        label="Next version"
        shortcut="]"
        disabled={next === null}
        onClick={stepForward}
      />
    </Stack>
  );
}

/**
 * What the label's tooltip says about the stop on screen: the request that made
 * it and when, or — for the unsaved stop — what "unsaved" means here.
 */
function StepTooltip({ step }: { step: VersionStep | null }) {
  if (step === null) {
    return "This version is no longer in the prototype's history.";
  }
  if (step.kind === "unsaved") {
    return (
      <Stack gap="2xs">
        <Text>Live · changes no version holds yet</Text>
        <Text variant="caption" tone="muted">
          The next agent turn that edits this prototype records them.
        </Text>
      </Stack>
    );
  }
  return (
    <Stack gap="2xs">
      <Text>{step.version.subject}</Text>
      <Text variant="caption" tone="muted">
        v{step.version.n} · <RelativeTime date={new Date(step.version.at)} />
      </Text>
    </Stack>
  );
}
