import {
  Button,
  ControlSizeProvider,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { useState, useEffect } from "react";
import {
  useResource,
  useNotificationsChannelStatuses,
} from "@plugins/primitives/plugins/live-state/web";
import { MdOpenInFull, MdRefresh, MdBuild } from "react-icons/md";
import { Spinner } from "@plugins/primitives/plugins/css/plugins/spinner/web";
import { WithTooltip } from "@plugins/primitives/plugins/tooltip/web";
import { navigate } from "@plugins/apps-core/plugins/tabs/web";
import { InlinePopover } from "@plugins/primitives/plugins/popover/web";
import { clientLog } from "@plugins/primitives/plugins/log-channels/web";
import { debugApp } from "@plugins/apps/plugins/debug/plugins/shell/core";
import { buildRoute } from "@plugins/build/core";
import { buildStatusOf } from "@plugins/build/plugins/build-status/core";
import {
  buildHistoryResource,
  isMainCompositionBuild,
  type BuildRun,
} from "../../shared";
import { useStaleFrontend } from "../hooks/use-stale-frontend";
import { BuildPopoverContent } from "./build-popover-content";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";

/** Inner component: receives settled history data so hooks run unconditionally with real values. */
function BuildButtonInner({
  open,
  setOpen,
  staleTab,
  wsStatus,
  historyData,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  staleTab: boolean;
  wsStatus: string;
  historyData: BuildRun[];
}) {
  const latestRun = historyData[0];
  const building = latestRun?.finishedAt === null;
  // Only a real verdict turns the toolbar red: a superseded / interrupted /
  // externally-killed run reports no defect, so it must not read "Build failed".
  const failed = latestRun != null && buildStatusOf(latestRun) === "failed";

  // Priority: a stale tab (new frontend already served) needs a reload regardless
  // of build state; otherwise reflect the active build, then the last outcome.
  const status: "idle" | "building" | "restarting" | "updated" | "failed" =
    staleTab
      ? "updated"
      : building && wsStatus !== "open"
        ? "restarting"
        : building
          ? "building"
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
    building: buildingComposition ? `Building ${targetsLabel}…` : "Building…",
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
        targets: targetsLabel,
        finishedAt: latestRun?.finishedAt,
      }),
    );
  }, [
    status,
    building,
    wsStatus,
    staleTab,
    targetsLabel,
    latestRun?.finishedAt,
  ]);

  return (
    <InlinePopover
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button
          variant="outline"
          className={status === "failed" ? "text-destructive" : undefined}
        >
          {spinning && <Spinner spinning className="size-4" />}
          {status === "idle" && <MdBuild className="size-4" />}
          {label}
          {status === "updated" && (
            <WithTooltip content="Server was rebuilt — click to reload this tab">
              <span
                role="button"
                tabIndex={0}
                // eslint-disable-next-line layout/no-adhoc-layout, spacing/no-adhoc-spacing -- nested interactive chip inside the build trigger button (a real button can't nest inside the Button trigger); inline-flex row + ml-0.5 inline offset from preceding button label, no flex parent to own a gap
                className="ml-0.5 inline-flex items-center gap-2xs rounded-md bg-info/15 px-xs py-2xs text-label text-info hover:bg-info/25"
                onClick={(e) => {
                  e.stopPropagation();
                  window.location.reload();
                }}
              >
                <MdRefresh className="size-3" />
                Reload
              </span>
            </WithTooltip>
          )}
        </Button>
      }
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
}

export function BuildButton() {
  const [open, setOpen] = useState(false);

  // --- Stale-tab detection (baked build id vs server's current build id) ---
  const { stale: staleTab } = useStaleFrontend();

  // --- Worktree live-state channel status (backend liveness) ---
  // During a build the `./singularity build` process restarts this very backend,
  // so the worktree channel drops to reconnecting/closed. Guarded by `building`,
  // that gap is what separates "Server restarting…" from "Building…".
  const { worktree: wsStatus } = useNotificationsChannelStatuses();

  // --- Build history ---
  const historyResult = useResource(buildHistoryResource);

  // Render a neutral "Builds" button while the history resource is still loading —
  // no fake "idle" status and no misleading useEffect trace before data arrives.
  if (historyResult.pending) {
    return (
      <Button variant="outline">
        <MdBuild className="size-4" />
        Builds
      </Button>
    );
  }

  return (
    <BuildButtonInner
      open={open}
      setOpen={setOpen}
      staleTab={staleTab}
      wsStatus={wsStatus}
      historyData={historyResult.data}
    />
  );
}
