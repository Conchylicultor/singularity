import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import {
  formatElapsed,
  useNow,
} from "@plugins/primitives/plugins/relative-time/web";
import {
  formatLastStep,
  type SubagentActivityRow,
  type SubagentRunState,
} from "../../core";

/** Below this, silence is just the gap between two writes and says nothing. */
const QUIET_AFTER_MS = 60_000;

const MUTED = "text-muted-foreground/70";

/**
 * How long it has been silent, stated as the observation it is.
 *
 * Deliberately NOT a verdict: a sub-agent that has written nothing for five
 * minutes may be inside one long tool call, so the surface says how long and
 * lets the reader judge. Its own component so the once-a-second clock ticks
 * only for a sub-agent that is actually running.
 */
function QuietFor({ since }: { since: Date }) {
  const now = useNow(1000);
  const ms = now - since.getTime();
  if (ms < QUIET_AFTER_MS) return null;
  return <> · no update in {formatElapsed(ms)}</>;
}

/**
 * The one thing a sub-agent most recently did, in words.
 *
 * Phrasing comes from `formatLastStep` in `core`, so every surface reading the
 * same step says the same sentence. A line container, so a long step ellipsizes
 * instead of wrapping the card's neighbour off its row.
 *
 * Takes the whole row union, not just the described arm: what it last did and
 * when it last wrote come from the FILESYSTEM, so they survive metadata nothing
 * could read — a sub-agent with an unreadable meta file can still say what it
 * is doing.
 */
export function SubagentLastStep({
  row,
  state,
  className,
}: {
  /** `undefined` = the meta file has not landed yet. */
  row: SubagentActivityRow | undefined;
  state: SubagentRunState;
  className?: string;
}) {
  if (row === undefined) {
    // No row and still going: the harness has not written its meta file yet.
    // No row and stopped: there is nothing to report, and the state says so.
    if (state.kind !== "running") return null;
    return (
      <Line className={className}>
        <Text variant="caption" className={MUTED}>
          Starting…
        </Text>
      </Line>
    );
  }

  const step = row.lastStep;
  return (
    <Line className={className}>
      <Text variant="caption" className={MUTED}>
        {step === null ? "Nothing written yet" : formatLastStep(step)}
        {state.kind === "running" && (
          <QuietFor since={new Date(row.lastActivityAt)} />
        )}
      </Text>
    </Line>
  );
}
