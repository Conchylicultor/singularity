import { useContext, useEffect, useState } from "react";
import { MdCloudDone, MdCloudOff } from "react-icons/md";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import { Spinner } from "@plugins/primitives/plugins/css/plugins/spinner/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import { WithTooltip } from "@plugins/primitives/plugins/tooltip/web";
import { SyncStatusSinkContext } from "../internal/sink-context";
import { aggregate, SyncStatusStore, type SyncAggregate } from "../internal/store";

/** Time the `syncing` state must persist before the spinner shows, so fast saves
 *  never flash (mirrors the `loading` primitive's ~120ms delay-before-show). */
const SYNCING_SHOW_DELAY_MS = 120;

/**
 * The universal per-surface sync-status cloud. Mounted once in `TabSurface`
 * (inside `SyncStatusProvider`), it reads the surface's aggregate and renders a
 * Google-Keep-style status pinned to the surface's bottom-right corner. No app
 * opts in or owns indicator code — reporting (via `useReportSync`) and rendering
 * (here) are both outside any consumer's control.
 */
export function SyncStatusIndicator() {
  const agg = SyncStatusStore.useSelector(
    (s) => aggregate(s),
    [],
    aggregateEqual,
  );
  const showSyncing = useDelayed(agg.kind === "syncing", SYNCING_SHOW_DELAY_MS);

  // Hide the spinner during its show-delay window; everything else is immediate.
  if (agg.kind === "idle") return null;
  if (agg.kind === "syncing" && !showSyncing) return null;

  return (
    <Pin to="bottom-right" offset="md" layer="float">
      <Body agg={agg} />
    </Pin>
  );
}

function Body({ agg }: { agg: Exclude<SyncAggregate, { kind: "idle" }> }) {
  const sink = useContext(SyncStatusSinkContext);

  if (agg.kind === "syncing") {
    return (
      <WithTooltip content="Saving…">
        <Spinner className="icon-auto text-muted-foreground" />
      </WithTooltip>
    );
  }

  if (agg.kind === "saved") {
    return (
      <WithTooltip
        content={
          <>
            Saved <RelativeTime date={new Date(agg.at)} />
          </>
        }
      >
        <MdCloudDone className="icon-auto text-muted-foreground" />
      </WithTooltip>
    );
  }

  // error — the cloud-off icon doubles as the retry button.
  const labels = agg.labels;
  const what = labels.length > 0 ? ` ${labels.join(", ")}` : "";
  return (
    <IconButton
      icon={MdCloudOff}
      label="Retry"
      tooltip={`Couldn't save${what} — click to retry`}
      className="text-destructive"
      onClick={() => {
        // Pull every registered retry imperatively and run it.
        for (const ref of sink.retries.values()) ref.current?.();
      }}
    />
  );
}

/**
 * Returns `value` only after it has stayed `true` for `delayMs`; flips back to
 * `false` immediately. Used to suppress the spinner flash on fast saves.
 */
function useDelayed(value: boolean, delayMs: number): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!value) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- animation-temporal-machine: delay-before-show timer (rising/falling edge). The falling-edge setShown(false) and the deferred rising-edge setShown(true) (via setTimeout) are the intended temporal transition that must cause a re-render; the value is not derivable from props at render time (it depends on how long `value` has stayed true) and there is no external store to subscribe to
      setShown(false);
      return;
    }
    const id = setTimeout(() => setShown(true), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return shown;
}

/** Value-compare the aggregate so the selector bails on equal snapshots. */
function aggregateEqual(a: SyncAggregate, b: SyncAggregate): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "saved" && b.kind === "saved") return a.at === b.at;
  if (a.kind === "error" && b.kind === "error") {
    return (
      a.labels.length === b.labels.length &&
      a.labels.every((l, i) => l === b.labels[i])
    );
  }
  return true;
}
