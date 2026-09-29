import { useState } from "react";
import { ResourceErrorInline } from "@plugins/primitives/plugins/live-state/web";
import { Spinner } from "@plugins/primitives/plugins/css/plugins/spinner/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Clip } from "@plugins/primitives/plugins/css/plugins/clip/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import {
  Rigid,
  rigidClass,
} from "@plugins/primitives/plugins/css/plugins/rigid/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type { Conversation as ConversationRecord } from "@plugins/tasks/plugins/tasks-core/core";
import { useConversationTitleBySlug } from "@plugins/conversations/web";
import {
  formatElapsed,
  useNow,
} from "@plugins/primitives/plugins/relative-time/web";
import { symbol } from "@plugins/ui/plugins/icons/core";
import { Icon } from "@plugins/ui/plugins/icons/web";
import {
  buildQueue,
  opsOfSlug,
  slugOf,
  splitLine,
  stateLine,
  timesOf,
  type QueueRow,
} from "../internal/op-lines";
import { useOpsInFlight } from "../internal/use-worktree-op";

const keyboardArrowUpIcon = symbol("keyboard-arrow-up");
const keyboardArrowDownIcon = symbol("keyboard-arrow-down");
const hourglassEmptyIcon = symbol("hourglass-empty");

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
  const split = splitLine(times);
  return (
    <Text
      as="div"
      variant="caption"
      className={isSelf ? "bg-primary/5" : undefined}
    >
      <Stack direction="row" gap="sm" align="center" className="px-md py-xs">
        {queuePos !== null ? (
          <span
            className={cn(
              "w-6 text-center font-mono tabular-nums text-muted-foreground",
              rigidClass(),
            )}
          >
            #{queuePos}
          </span>
        ) : (
          <Rigid as="span" className="w-6" />
        )}
        <StateIcon waiting={row.openWait !== null} className="text-warning" />
        <Fill as="span" className="truncate">
          {title ? (
            <span className="truncate">{title}</span>
          ) : (
            <span className="font-mono">{slug}</span>
          )}
          {isSelf && (
            // eslint-disable-next-line spacing/no-adhoc-spacing -- inline left offset on a trailing label inside a truncating flex cell; not a sibling gap the parent can own
            <span className="ml-1.5 text-muted-foreground">
              (this conversation)
            </span>
          )}
        </Fill>
        <span className={cn("truncate text-muted-foreground", rigidClass())}>
          {stateLine(row, now)}
        </span>
        {split !== null && (
          <span className={cn("text-muted-foreground/70", rigidClass())}>
            {split}
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
      </Stack>
    </Text>
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

  const rows = buildQueue(result.data, selfSlug);
  const waiting = op.openWait !== null;
  const times = timesOf(op, now);
  const split = splitLine(times);
  const others = rows.length - 1;

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
            {split !== null && (
              <span className={cn("text-muted-foreground/70", rigidClass())}>
                {split}
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
            {rows.map((item) => (
              <QueueRowView
                key={item.row.opId}
                item={item}
                title={titleBySlug[item.slug]}
                now={now}
              />
            ))}
          </div>
        )}
      </Clip>
    </Text>
  );
}
