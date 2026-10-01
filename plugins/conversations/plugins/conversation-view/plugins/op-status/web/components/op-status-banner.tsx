import { useState } from "react";
import { ResourceErrorInline } from "@plugins/primitives/plugins/live-state/web";
import { Spinner } from "@plugins/primitives/plugins/css/plugins/spinner/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Clip } from "@plugins/primitives/plugins/css/plugins/clip/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { rigidClass } from "@plugins/primitives/plugins/css/plugins/rigid/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type { Conversation as ConversationRecord } from "@plugins/tasks/plugins/tasks-core/core";
import { useConversationTitleBySlug } from "@plugins/conversations/web";
import { WithTooltip } from "@plugins/primitives/plugins/overlay/plugins/tooltip/web";
import { WAIT_KINDS } from "@plugins/debug/plugins/profiling/plugins/op-log/core";
import {
  formatElapsed,
  useNow,
} from "@plugins/primitives/plugins/relative-time/web";
import { symbol } from "@plugins/ui/plugins/icons/core";
import { Icon } from "@plugins/ui/plugins/icons/web";
import {
  buildSections,
  opsOfSlug,
  phaseOf,
  slugOf,
  stateLine,
  timesOf,
  type QueueRow,
  type RowPhase,
} from "../internal/op-lines";
import { useOpsInFlight } from "../internal/use-worktree-op";

const keyboardArrowUpIcon = symbol("keyboard-arrow-up");
const keyboardArrowDownIcon = symbol("keyboard-arrow-down");
const hourglassEmptyIcon = symbol("hourglass-empty");
const queuedIcon = symbol("radio-button-unchecked");

// Parked in a wait → hourglass (warning tone); working → spinner.
function StateIcon({
  waiting,
  className,
}: {
  waiting: boolean;
  className?: string;
}) {
  return waiting ? (
    <Icon
      icon={hourglassEmptyIcon}
      className={cn("size-3.5", rigidClass(), className)}
    />
  ) : (
    <Spinner className={cn("size-3.5", rigidClass())} />
  );
}

// Glyph per phase: working spins, held is the warning hourglass, queued is a
// quiet hollow dot — waiting its turn is the expected case, not an alarm.
function PhaseIcon({ phase }: { phase: RowPhase }) {
  if (phase === "working")
    return <Spinner className={cn("size-3.5", rigidClass())} />;
  return (
    <Icon
      icon={phase === "held" ? hourglassEmptyIcon : queuedIcon}
      className={cn(
        "size-3.5",
        phase === "held" ? "text-warning" : "text-muted-foreground/60",
        rigidClass(),
      )}
    />
  );
}

const TIME_COL = "w-12 text-right font-mono tabular-nums";

/** A waited / worked cell: a faint dash under a second, dimmed when `dim`. */
function TimeCell({ ms, dim }: { ms: number; dim: boolean }) {
  if (ms < 1000)
    return (
      <span className={cn(TIME_COL, "text-muted-foreground/30", rigidClass())}>
        —
      </span>
    );
  return (
    <span
      className={cn(
        TIME_COL,
        dim ? "text-muted-foreground/70" : "text-foreground",
        rigidClass(),
      )}
    >
      {formatElapsed(ms)}
    </span>
  );
}

function RowTooltip({ item, now }: { item: QueueRow; now: number }) {
  const times = timesOf(item.row, now);
  return (
    <Stack gap="2xs">
      <span>{stateLine(item.row, now)}</span>
      <span className="text-muted-foreground">
        waited {formatElapsed(times.waitingMs)} · worked{" "}
        {formatElapsed(times.workingMs)}
      </span>
    </Stack>
  );
}

function QueueRowView({
  item,
  title,
  now,
}: {
  item: QueueRow;
  title: string | undefined;
  now: number;
}) {
  const { row, slug, queuePos, isSelf } = item;
  const times = timesOf(row, now);
  const phase = phaseOf(row);
  return (
    <WithTooltip content={<RowTooltip item={item} now={now} />} side="left">
      <div className={isSelf ? "bg-primary/5" : undefined}>
        <Stack direction="row" gap="sm" align="center" className="px-md py-2xs">
          <PhaseIcon phase={phase} />
          <span
            className={cn(
              "w-4 text-right font-mono tabular-nums text-muted-foreground",
              rigidClass(),
            )}
          >
            {queuePos}
          </span>
          <Fill
            as="span"
            className={cn(
              "truncate",
              isSelf ? "font-medium text-foreground" : "text-muted-foreground",
            )}
          >
            {title ? (
              <span className="truncate">{title}</span>
            ) : (
              <span className="font-mono">{slug}</span>
            )}
            {isSelf && (
              // eslint-disable-next-line spacing/no-adhoc-spacing -- inline left offset on a trailing label inside a truncating flex cell; not a sibling gap the parent can own
              <span className="ml-1.5 font-normal text-primary">
                this conversation
              </span>
            )}
          </Fill>
          {phase === "held" && row.openWait && (
            <span className={cn("truncate text-warning", rigidClass())}>
              {WAIT_KINDS[row.openWait.kind].sentence(null)}
            </span>
          )}
          <TimeCell ms={times.waitingMs} dim />
          <TimeCell ms={times.workingMs} dim={phase === "queued"} />
        </Stack>
      </div>
    </WithTooltip>
  );
}

/** A section's small caps header; the first carries the time columns' labels. */
function SectionHeader({
  title,
  withColumns,
}: {
  title: string;
  withColumns: boolean;
}) {
  return (
    <Stack
      direction="row"
      gap="sm"
      align="baseline"
      className="px-md pt-xs text-muted-foreground"
    >
      <Fill
        as="span"
        className="truncate text-2xs font-semibold uppercase tracking-wide"
      >
        {title}
      </Fill>
      {withColumns && (
        <>
          <span className={cn(TIME_COL, "font-sans", rigidClass())}>
            waited
          </span>
          <span className={cn(TIME_COL, "font-sans", rigidClass())}>
            worked
          </span>
        </>
      )}
    </Stack>
  );
}

/**
 * The worktree's in-flight op above the prompt input, off the one host-wide
 * `opsInFlight` read. The state line is the reducer's: the wait the op is
 * parked in (with its reason, requeue cycle and own clock) or the work it is
 * doing; the right side is the total elapsed and the waited / worked split. The
 * warning tone means "parked in a wait" — before the grant or after it.
 */
export function OpStatusBanner({
  conversation,
}: {
  conversation: ConversationRecord;
}) {
  const result = useOpsInFlight();
  const titleBySlug = useConversationTitleBySlug();
  // A presentational 1 s ticker for the clocks; the op state itself is pushed.
  const now = useNow(1000);
  const [expanded, setExpanded] = useState(false);

  const selfSlug = slugOf(conversation.worktreePath);

  if (result.status === "loading") return null;
  if (result.status === "error")
    return (
      <ResourceErrorInline
        variant="inline"
        subject="the in-flight ops"
        error={result.error}
        refetch={result.refetch}
      />
    );
  const mine = opsOfSlug(result.data, selfSlug);
  const op = mine[0];
  if (!op) return null;

  const sections = buildSections(result.data, selfSlug);
  const waiting = op.openWait !== null;
  const times = timesOf(op, now);
  const others = result.data.length - 1;

  return (
    <Text as="div" variant="caption">
      <Clip
        className={`rounded-md border ${
          waiting
            ? "border-warning/40 bg-warning/10 text-warning"
            : "border-border bg-muted/30 text-foreground"
        }`}
      >
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full text-left hover:bg-foreground/[0.03]"
        >
          <Stack
            direction="row"
            gap="sm"
            align="center"
            className="px-md py-sm"
          >
            <StateIcon waiting={waiting} />
            <Fill as="span" className="truncate">
              {stateLine(op, now)}
            </Fill>
            {others > 0 && (
              <span className={cn("text-muted-foreground", rigidClass())}>
                +{others} other{others === 1 ? "" : "s"}
              </span>
            )}
            <span
              className={cn(
                "font-mono tabular-nums text-muted-foreground",
                rigidClass(),
              )}
            >
              {formatElapsed(times.elapsedMs)}
            </span>
            <Icon
              icon={expanded ? keyboardArrowUpIcon : keyboardArrowDownIcon}
              className={cn("size-4 text-muted-foreground", rigidClass())}
            />
          </Stack>
        </button>
        {expanded && (
          <div className="border-t border-border/60 bg-background/40 py-xs text-foreground">
            {sections.map((section, i) => (
              <div key={section.kind}>
                <SectionHeader title={section.title} withColumns={i === 0} />
                {section.rows.map((item) => (
                  <QueueRowView
                    key={item.row.opId}
                    item={item}
                    title={titleBySlug[item.slug]}
                    now={now}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </Clip>
    </Text>
  );
}
