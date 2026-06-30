import type { MouseEvent } from "react";
import { MdFlag, MdDelete, MdClose } from "react-icons/md";
import { ControlSizeProvider } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";

/**
 * Hover overlay for a step node: "Set as entry" (hidden when already entry) +
 * "Delete". Tiny (xs) so it tucks into the node's corner without overpowering it.
 * Each handler stops propagation so it never doubles as a node-select click.
 */
export function NodeActions({
  stepId,
  isEntry,
  onSetEntry,
  onDeleteStep,
}: {
  stepId: string;
  isEntry: boolean;
  onSetEntry: (stepId: string) => void;
  onDeleteStep: (stepId: string) => void;
}) {
  return (
    <ControlSizeProvider size="xs">
      <Stack direction="row" align="center" gap="2xs">
        {!isEntry && (
          <IconButton
            icon={MdFlag}
            label="Set as entry"
            onClick={(e: MouseEvent) => {
              e.stopPropagation();
              onSetEntry(stepId);
            }}
          />
        )}
        <IconButton
          icon={MdDelete}
          label="Delete step"
          onClick={(e: MouseEvent) => {
            e.stopPropagation();
            onDeleteStep(stepId);
          }}
        />
      </Stack>
    </ControlSizeProvider>
  );
}

/** Hover overlay for the default `next` edge: a single remove button. */
export function DefaultEdgeActions({
  stepId,
  onRemove,
}: {
  stepId: string;
  onRemove: (stepId: string) => void;
}) {
  return (
    <ControlSizeProvider size="xs">
      <IconButton
        icon={MdClose}
        label="Remove default route"
        onClick={(e: MouseEvent) => {
          e.stopPropagation();
          onRemove(stepId);
        }}
      />
    </ControlSizeProvider>
  );
}

/** Hover overlay for a conditional edge: the route key chip + a remove button. */
export function RouteEdgeActions({
  stepId,
  routeKey,
  onRemove,
}: {
  stepId: string;
  routeKey: string;
  onRemove: (stepId: string, key: string) => void;
}) {
  return (
    <ControlSizeProvider size="xs">
      <Stack direction="row" align="center" gap="2xs">
        <Badge mono>{routeKey}</Badge>
        <IconButton
          icon={MdClose}
          label="Remove route"
          onClick={(e: MouseEvent) => {
            e.stopPropagation();
            onRemove(stepId, routeKey);
          }}
        />
      </Stack>
    </ControlSizeProvider>
  );
}
