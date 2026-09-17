import { MdChevronLeft, MdChevronRight } from "react-icons/md";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Cluster } from "@plugins/primitives/plugins/css/plugins/cluster/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import {
  matchResource,
  useResource,
} from "@plugins/primitives/plugins/live-state/web";
import {
  prototypeHistoryResource,
  type PrototypeHistory,
} from "@plugins/apps/plugins/prototypes/plugins/files/core";
import { usePrototypeDetail } from "../context";
import { isPastStep, stepLabel, versionSteps } from "../internal/version-steps";
import { useVersionStepping } from "../internal/use-version-stepping";

/**
 * The options picker's Version row: `‹ v3 of 7 ›`, plus Back to latest while a
 * past version is shown. For surfaces with no pane header to hold the
 * `VersionStepper` — a presentation — so the version can still be switched
 * there, fullscreen included.
 *
 * Arrows only, no version list: the list is a popover, which would render
 * outside the picker's hover box (closing the picker under the pointer) and,
 * portaled to `body`, be invisible under the Fullscreen API.
 */
export function VersionRow() {
  const { name } = usePrototypeDetail();
  const history = useResource(prototypeHistoryResource, { name });
  return (
    <Stack direction="col" gap="2xs">
      <Text variant="label">Version</Text>
      {matchResource(history, {
        pending: () => <Loading variant="block" className="h-8 w-40" />,
        error: (err) => (
          <Text variant="caption" tone="destructive" title={err.message}>
            Version history unavailable
          </Text>
        ),
        ready: (h) => <ReadyVersionRow history={h} />,
      })}
    </Stack>
  );
}

function ReadyVersionRow({ history }: { history: PrototypeHistory }) {
  const { model, current, prev, next, go, stepBack, stepForward } =
    useVersionStepping(history);
  // From a past version (or one the history lost) the latest is the last stop.
  const offLatest = current === null || isPastStep(current);
  return (
    <Cluster gap="xs" align="center" role="group" aria-label="Version">
      <IconButton
        icon={MdChevronLeft}
        label="Previous version"
        disabled={prev === null}
        onClick={stepBack}
      />
      <Text variant="caption" className="min-w-24 text-center tabular-nums">
        {current === null
          ? "Unknown version"
          : stepLabel(current, model.newestN)}
      </Text>
      <IconButton
        icon={MdChevronRight}
        label="Next version"
        disabled={next === null}
        onClick={stepForward}
      />
      {offLatest ? (
        <Button variant="ghost" onClick={() => go(model.steps.at(-1) ?? null)}>
          Back to latest
        </Button>
      ) : null}
    </Cluster>
  );
}

/**
 * The version on screen as the picker's pill names it ("v3 of 7"), so a
 * presentation always says which version it is showing. A short shimmer while
 * the history is not known — a guessed version would be a claim about the page.
 */
export function VersionSummary() {
  const { name, shownVersion } = usePrototypeDetail();
  const history = useResource(prototypeHistoryResource, { name });
  return matchResource(history, {
    pending: () => <Loading variant="block" className="h-3 w-12" />,
    error: () => (
      <Text variant="caption" tone="destructive">
        Unknown version
      </Text>
    ),
    ready: (h) => {
      const model = versionSteps(h, shownVersion?.sha ?? null);
      const current =
        model.current === null ? null : model.steps[model.current]!;
      return (
        <Text variant="caption" className="tabular-nums">
          {current === null
            ? "Unknown version"
            : stepLabel(current, model.newestN)}
        </Text>
      );
    },
  });
}
