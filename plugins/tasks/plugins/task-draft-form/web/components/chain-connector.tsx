import { Icon } from "@plugins/ui/plugins/icons/web";
import {
  cn,
  ControlSizeProvider,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { symbol } from "@plugins/ui/plugins/icons/core";

const addIcon = symbol("add");
const arrowDownwardIcon = symbol("arrow-downward");
const closeIcon = symbol("close");
const linkIcon = symbol("link");
const linkOffIcon = symbol("link-off");
const pauseIcon = symbol("pause");

export interface ChainConnectorProps {
  /** Whether the task below waits for the task above. */
  linked: boolean;
  /** The 1-based number of the task above; the task below is `prevNumber + 1`. */
  prevNumber: number;
  onToggle: () => void;
  onInsert: () => void;
  /** Removes the task BELOW this connector — the one it belongs to. */
  onRemove: () => void;
  disabled?: boolean;
}

/**
 * The row between two cards. It says, in words, whether the task below waits
 * for the one above, and carries the three things you can do at that spot:
 * flip the link, insert a task here, remove the task below. The buttons are
 * always visible — a connector whose actions only appear on hover reads as a
 * decoration.
 *
 * It owns the task below's ×, so every card but the first has exactly one; the
 * first card's is the form header's.
 */
export function ChainConnector({
  linked,
  prevNumber,
  onToggle,
  onInsert,
  onRemove,
  disabled,
}: ChainConnectorProps) {
  const LeadIcon = linked ? arrowDownwardIcon : pauseIcon;
  return (
    <Line className="gap-sm py-2xs text-muted-foreground">
      <Icon icon={LeadIcon} aria-hidden className="size-3" />
      <Text variant="caption" tone="muted">
        {linked
          ? `Then, once task ${prevNumber} is done`
          : `In parallel — doesn't wait for task ${prevNumber}`}
      </Text>
      {/* The hairline takes the row's slack, pushing the actions flush-right. */}
      <Fill>
        <div
          aria-hidden
          className={cn(
            "border-t",
            linked
              ? "border-border"
              : "border-dashed border-muted-foreground/40",
          )}
        />
      </Fill>
      <ControlSizeProvider size="xs">
        {linked ? (
          <IconButton
            icon={linkOffIcon}
            label="Unlink tasks (run in parallel)"
            onClick={onToggle}
            disabled={disabled}
          />
        ) : (
          <IconButton
            icon={linkIcon}
            label="Link tasks (run sequentially)"
            onClick={onToggle}
            disabled={disabled}
          />
        )}
        <IconButton
          icon={addIcon}
          label="Insert a task here"
          onClick={onInsert}
          disabled={disabled}
        />
        <IconButton
          icon={closeIcon}
          label={`Remove task ${prevNumber + 1}`}
          onClick={onRemove}
          disabled={disabled}
        />
      </ControlSizeProvider>
    </Line>
  );
}
