import type { ReactNode } from "react";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Frame } from "@plugins/primitives/plugins/css/plugins/frame/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { RowActions } from "../internal/event-action-context";

/**
 * The shared one-line grammar for ambient / lifecycle rows in the transcript —
 * queue operations, system lines, task completions. A leading indicator (a
 * status dot or a small icon) carries any semantic colour; the label is a
 * natural-case muted eyebrow (never all-caps — jsonl-viewer rule); trailing
 * content follows. Every tier-1 lifecycle renderer composes this so the rows
 * read as siblings instead of each inventing its own chrome.
 *
 * Colour lives ONLY in the leading indicator — never a filled badge — so the
 * timeline stays calm. Truncation is the caller's job: wrap a flexible leaf in
 * `truncate` so only that text ellipsizes while chips stay whole.
 */
export function EventLine({
  icon,
  label,
  children,
}: {
  icon?: ReactNode;
  label: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Text as="div" variant="caption" className="text-muted-foreground">
      <Frame
        gap="sm"
        className="px-xs py-xs"
        leading={
          <Stack
            direction="row"
            align="center"
            gap="xs"
            as="span"
            className="font-medium tracking-wide text-2xs"
          >
            {icon}
            {label}
          </Stack>
        }
        content={
          children != null ? (
            <Stack direction="row" align="center" gap="xs" as="span">
              {children}
            </Stack>
          ) : undefined
        }
        trailing={<RowActions />}
      />
    </Text>
  );
}
