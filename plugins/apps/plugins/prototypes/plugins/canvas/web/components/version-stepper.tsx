import { useMemo, useState, type ReactElement } from "react";
import { MdChevronLeft, MdChevronRight, MdRestore } from "react-icons/md";
import {
  Button,
  ControlSizeProvider,
  cn,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { InlinePopover } from "@plugins/primitives/plugins/overlay/plugins/popover/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { confirmDialog } from "@plugins/primitives/plugins/overlay/plugins/imperative-dialog/plugins/confirm/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { showToast } from "@plugins/shell/plugins/toast/web";
import {
  matchResource,
  useResource,
} from "@plugins/primitives/plugins/live-state/web";
import {
  prototypeHistoryResource,
  restorePrototypeVersion,
  type PrototypeHistory,
  type PrototypeVersion,
} from "@plugins/apps/plugins/prototypes/plugins/files/core";
import { isPastStep, type VersionStep } from "../internal/version-steps";
import { useVersionStepping } from "../internal/use-version-stepping";
import { VersionList, VersionListFrameContext } from "./version-list";

/** Which version a stepper moves: the pair, so every frame steps on its own. */
export interface VersionStepperProps {
  /** The prototype's id (its history is keyed by it). */
  name: string;
  /** The frame's letter, for the list's heading ("Versions of B"). */
  letter: string;
  /** The version on screen — `null` for the live folder. */
  shown: PrototypeVersion | null;
  show: (version: PrototypeVersion | null) => void;
  /** Open `version` in a new frame beside this one (a list row action). */
  compare?: (version: PrototypeVersion) => void;
}

/**
 * `‹ v14 · latest ›` — one frame's version. The arrows step; the label opens
 * the version list, which on a past version ends with **Make vN the latest**.
 *
 * The arrows never move: the label keeps one width in every state, so
 * stepping never slides the › out from under the pointer.
 *
 * Pending history renders disabled arrows over a loading label — never a "v0"
 * that is really "not loaded yet".
 */
export function VersionStepper(props: VersionStepperProps): ReactElement {
  const history = useResource(prototypeHistoryResource, { name: props.name });
  return (
    <ControlSizeProvider size="xs">
      {matchResource(history, {
        pending: () => <PendingStepper />,
        error: (err) => (
          <Text variant="caption" tone="destructive" title={err.message}>
            History unavailable
          </Text>
        ),
        ready: (h) => <ReadyStepper history={h} {...props} />,
      })}
    </ControlSizeProvider>
  );
}

/** The label's floor: wide enough for every form, so the arrows never move. */
const LABEL_WIDTH = "min-w-24";

function Pill({
  past,
  children,
}: {
  past: boolean;
  children: ReactElement | ReactElement[];
}): ReactElement {
  return (
    <Stack
      direction="row"
      gap="none"
      align="center"
      role="group"
      aria-label="Version"
      className={cn(
        "rounded-full border",
        past ? "border-warning/50" : "border-border",
      )}
    >
      {children}
    </Stack>
  );
}

function PendingStepper(): ReactElement {
  return (
    <Pill past={false}>
      <IconButton icon={MdChevronLeft} label="Previous version" disabled />
      <Button variant="ghost" disabled className={LABEL_WIDTH}>
        <Loading variant="block" className="h-3 w-12" />
      </Button>
      <IconButton icon={MdChevronRight} label="Next version" disabled />
    </Pill>
  );
}

function ReadyStepper({
  history,
  name,
  letter,
  shown,
  show,
  compare,
}: VersionStepperProps & { history: PrototypeHistory }): ReactElement {
  const [open, setOpen] = useState(false);
  const { model, current, prev, next, go, stepBack, stepForward } =
    useVersionStepping(history, { shown, show });
  const past = current === null || isPastStep(current);
  // The version a past stop shows — what "Make vN the latest" restores.
  const restorable =
    current?.kind === "version" && isPastStep(current) ? current.version : null;
  const shownSha =
    current?.kind === "version" ? current.version.sha : undefined;
  // What the list's row actions may do to this frame (Compare in a new frame).
  const listFrame = useMemo(
    () => ({
      shownSha,
      compare:
        compare === undefined
          ? undefined
          : (version: PrototypeVersion) => {
              setOpen(false);
              compare(version);
            },
    }),
    [shownSha, compare],
  );

  return (
    <Pill past={past}>
      <IconButton
        icon={MdChevronLeft}
        label="Previous version"
        disabled={prev === null}
        onClick={stepBack}
      />
      <InlinePopover
        open={open}
        onOpenChange={setOpen}
        align="start"
        width="lg"
        maxHeight="xl"
        tooltip={<StepTooltip step={current} />}
        trigger={
          <Button variant="ghost" className={cn(LABEL_WIDTH, "rounded-full")}>
            <StepLabel step={current} />
          </Button>
        }
      >
        <Stack gap="xs">
          <Text variant="eyebrow" tone="faint">
            Versions of {letter}
          </Text>
          <VersionListFrameContext value={listFrame}>
            <VersionList
              history={history}
              selected={shownSha}
              onPick={(version) => {
                const step = model.steps.find(
                  (s) => s.kind === "version" && s.version.sha === version.sha,
                );
                go(step ?? null);
                setOpen(false);
              }}
            />
          </VersionListFrameContext>
          {restorable !== null ? (
            <Button
              variant="secondary"
              className="text-warning"
              onClick={() => {
                setOpen(false);
                confirmRestore(name, restorable, show);
              }}
            >
              <MdRestore />
              Make v{restorable.n} the latest
            </Button>
          ) : null}
        </Stack>
      </InlinePopover>
      <IconButton
        icon={MdChevronRight}
        label="Next version"
        disabled={next === null}
        onClick={stepForward}
      />
    </Pill>
  );
}

/** `v14 · latest` (the suffix dimmed) — or `v11` in the past-version colour. */
function StepLabel({ step }: { step: VersionStep | null }): ReactElement {
  if (step === null) {
    return <span className="text-warning">Unknown</span>;
  }
  if (step.kind === "unsaved") {
    return (
      <Line>
        <span>Live</span>
        <span className="whitespace-pre text-muted-foreground"> · unsaved</span>
      </Line>
    );
  }
  if (step.live) {
    return (
      <Line>
        <span className="tabular-nums">v{step.version.n}</span>
        <span className="whitespace-pre text-muted-foreground"> · latest</span>
      </Line>
    );
  }
  return <span className="tabular-nums text-warning">v{step.version.n}</span>;
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

/**
 * Make `version` the latest: confirm, then restore it. The store saves the
 * current state first, so this loses nothing — which the dialog says, since
 * that is what makes it safe to click. On success the frame goes back to live,
 * where the restored design now is.
 */
function confirmRestore(
  name: string,
  version: PrototypeVersion,
  show: (version: PrototypeVersion | null) => void,
) {
  void confirmDialog({
    title: `Make v${String(version.n)} the latest?`,
    description:
      "Its files replace the live prototype. The current state is saved as a version first, so nothing is lost — you can step back to it.",
    confirmLabel: "Make it the latest",
    onConfirm: async () => {
      const restored = await fetchEndpoint(restorePrototypeVersion, {
        name,
        sha: version.sha,
      });
      show(null);
      showToast({
        title: `Restored v${String(version.n)}`,
        description: `Recorded as v${String(restored.n)}.`,
        variant: "success",
      });
    },
  });
}
