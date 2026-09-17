import {
  Button,
  ButtonGroup,
  ControlSizeProvider,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { useState, useEffect } from "react";
import {
  useResource,
  useNotificationsChannelStatuses,
} from "@plugins/primitives/plugins/live-state/web";
import { MdOpenInFull, MdBuild } from "react-icons/md";
import { Spinner } from "@plugins/primitives/plugins/css/plugins/spinner/web";
import { StatusDot } from "@plugins/primitives/plugins/css/plugins/status-dot/web";
import { ElapsedTime } from "@plugins/primitives/plugins/relative-time/web";
import { navigate } from "@plugins/apps-core/plugins/tabs/web";
import { InlinePopover } from "@plugins/primitives/plugins/overlay/plugins/popover/web";
import { clientLog } from "@plugins/primitives/plugins/log-channels/web";
import { debugApp } from "@plugins/apps/plugins/debug/plugins/shell/core";
import { buildRoute } from "@plugins/build/core";
import { buildStatusOf } from "@plugins/build/plugins/build-status/core";
import {
  buildHistoryResource,
  isMainCompositionBuild,
  type BuildRun,
} from "../../shared";
import { useReloadAdvice, type ReloadAdvice } from "../hooks/use-reload-advice";
import { ReloadSegment } from "./reload-segment";
import { BuildPopoverContent } from "./build-popover-content";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";

/** Inner component: receives settled history data so hooks run unconditionally with real values. */
function BuildButtonInner({
  open,
  setOpen,
  advice,
  wsStatus,
  historyData,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  advice: ReloadAdvice;
  wsStatus: string;
  historyData: BuildRun[];
}) {
  const latestRun = historyData[0];
  const building = latestRun?.finishedAt === null;
  // Only a real verdict turns the toolbar red: a superseded / interrupted /
  // externally-killed run reports no defect, so it must not read "Build failed".
  const failed = latestRun != null && buildStatusOf(latestRun) === "failed";
  const staleTab =
    advice.kind === "stale" || (advice.kind === "broken" && advice.stale);

  // The label and the Reload segment answer different questions. The label is
  // about the SERVER (what the build is doing); the segment is about THIS TAB
  // (whether it needs a reload), so a plugin that failed to load mid-build still
  // shows the red Reload beside "Building".
  //
  // Priority: an active build wins the label, since the Reload segment already
  // says the tab is stale — so a stale tab mid-build shows the spinner AND the
  // Reload segment side by side. With no build running, a stale tab reads
  // "Server updated"; otherwise the last outcome.
  const status: "idle" | "building" | "restarting" | "updated" | "failed" =
    building && wsStatus !== "open"
      ? "restarting"
      : building
        ? "building"
        : staleTab
          ? "updated"
          : failed
            ? "failed"
            : "idle";

  // A composition build names what it is building: "Building sonata…", or
  // "Building sonata, website…" for a multi-target invocation. A plain build of
  // this checkout's own app has nothing to name. Joined once, and read as a
  // STRING below: `targets` is a fresh array on every push, so depending on it
  // directly would re-fire the trace on every no-op recompute.
  const targetsLabel = latestRun ? latestRun.targets.join(", ") : null;
  const buildingComposition =
    building && latestRun != null && !isMainCompositionBuild(latestRun.targets);
  const label = {
    idle: "Builds",
    building: buildingComposition ? `Building ${targetsLabel}` : "Building",
    restarting: "Server restarting…",
    updated: "Server updated",
    failed: "Build failed",
  }[status];
  const spinning = status === "building" || status === "restarting";

  // Trace the client-side derivation an agent can read without a browser (see
  // plugins/debug/plugins/logs). Captures whether wsStatus ever leaves "open"
  // while building — the original "Server restarting…" investigation.
  useEffect(() => {
    clientLog(
      "build-btn",
      JSON.stringify({
        status,
        building,
        wsStatus,
        staleTab,
        advice: advice.kind,
        targets: targetsLabel,
        finishedAt: latestRun?.finishedAt,
      }),
    );
  }, [
    status,
    building,
    wsStatus,
    staleTab,
    advice.kind,
    targetsLabel,
    latestRun?.finishedAt,
  ]);

  // The look IS the state. At rest, with nothing to say, the control is one
  // quiet icon like the bar's other utilities. Anything to report — a build
  // running, the server updated under this tab, a failed build, a tab that
  // needs a reload — turns it into a framed pill that says it in words, and
  // a due reload joins it as the pill's own Reload segment.
  const quiet = status === "idle" && advice.kind === "none";
  const trigger = quiet ? (
    <IconButton icon={MdBuild} label="Builds" />
  ) : (
    <Button
      variant="frame"
      aspect={status === "idle" ? "icon" : "text"}
      aria-label={status === "idle" ? "Builds" : undefined}
      // A failed build tints the pill's frame; its words stay in the text colour.
      className={
        status === "failed"
          ? "border-destructive/50 dark:border-destructive/50"
          : undefined
      }
    >
      {spinning && <Spinner spinning className="size-4" />}
      {status === "failed" && <StatusDot colorClass="bg-destructive" />}
      {status === "idle" ? <MdBuild className="size-4" /> : label}
      {status === "building" && latestRun && (
        <ElapsedTime
          since={latestRun.startedAt}
          className="text-muted-foreground tabular-nums"
        />
      )}
    </Button>
  );

  const popover = (
    <InlinePopover
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      align="end"
      width="3xl"
      padding="none"
    >
      <Stack
        direction="row"
        align="center"
        justify="between"
        gap="none"
        className="border-b px-md py-sm"
      >
        <Text as="span" variant="label">
          Builds
        </Text>
        <ControlSizeProvider size="xs">
          <IconButton
            icon={MdOpenInFull}
            label="Open in pane"
            variant="ghost"
            onClick={() => {
              setOpen(false);
              navigate(buildRoute.link(debugApp, {}));
            }}
          />
        </ControlSizeProvider>
      </Stack>
      {/* WHERE a row goes is the arm's — a build row opens the build detail, a
          backup row opens the backup detail, and neither is something global
          chrome can name. All this button still owns is its own chrome: closing
          the popover so it does not hang over the pane the click just opened. */}
      <BuildPopoverContent
        variant="popover"
        onRowActivate={() => setOpen(false)}
      />
    </InlinePopover>
  );

  if (quiet) return popover;
  return (
    <ButtonGroup shape="pill" className="text-foreground">
      {popover}
      <ReloadSegment advice={advice} />
    </ButtonGroup>
  );
}

export function BuildButton() {
  const [open, setOpen] = useState(false);

  // --- Does this tab need a reload? (stale bundle, or a plugin failed to load) ---
  const advice = useReloadAdvice();

  // --- Worktree live-state channel status (backend liveness) ---
  // During a build the `./singularity build` process restarts this very backend,
  // so the worktree channel drops to reconnecting/closed. Guarded by `building`,
  // that gap is what separates "Server restarting…" from "Building…".
  const { worktree: wsStatus } = useNotificationsChannelStatuses();

  // --- Build history ---
  const historyResult = useResource(buildHistoryResource);

  // Render the neutral wrench, inert, while the history resource is still
  // loading — no fake "idle" status and no misleading useEffect trace before
  // data arrives. The popover needs the history, so it cannot open yet.
  if (historyResult.pending) {
    return <IconButton icon={MdBuild} label="Builds" disabled />;
  }

  return (
    <BuildButtonInner
      open={open}
      setOpen={setOpen}
      advice={advice}
      wsStatus={wsStatus}
      historyData={historyResult.data}
    />
  );
}
