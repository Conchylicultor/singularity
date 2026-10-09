import { Fragment } from "react";
import { useNow } from "@plugins/primitives/plugins/relative-time/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type { TerminalMenuOption } from "@plugins/conversations/plugins/terminal-menu/core";
import type { MenuVariantProps } from "@plugins/conversations/plugins/menu-relay/web";
import {
  formatCountdown,
  limitMenuOptions,
  parseResetTime,
} from "../internal/limit-menu";

const RESET_FORMAT = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Claude Code's usage-limit menu: when the limit resets, and the three ways on
 * — wait in the terminal and continue by itself, stop now, or spend usage
 * credits.
 */
export function UsageLimitMenu({ menu, choose, pending }: MenuVariantProps) {
  const now = useNow(60_000);
  const named = limitMenuOptions(menu);
  const resetAt = named.wait
    ? parseResetTime(named.wait.label, new Date(now))
    : null;

  const option = (
    o: TerminalMenuOption | null,
    label: string,
    primary = false,
  ) =>
    o && (
      <Button
        variant={primary ? "default" : "outline"}
        loading={pending === o.n}
        disabled={pending !== null}
        onClick={() => choose(o.n)}
      >
        {label}
      </Button>
    );

  return (
    <Stack gap="sm">
      <Stack gap="2xs">
        <Text as="p" variant="label">
          Usage limit reached
        </Text>
        <Text as="p" variant="caption" tone="muted">
          {resetAt
            ? `Resets ${RESET_FORMAT.format(resetAt)} · in ${formatCountdown(resetAt.getTime() - now)}`
            : (named.wait?.label ?? menu.title)}
        </Text>
      </Stack>
      <Stack direction="row" gap="sm" align="center" wrap>
        {option(named.wait, "Wait & continue automatically", true)}
        {option(named.stop, "Stop for now")}
        {option(named.credits, "Use usage credits")}
        {named.other.map((o) => (
          <Fragment key={o.n}>{option(o, o.label)}</Fragment>
        ))}
      </Stack>
      {named.wait && (
        <Text as="p" variant="caption" tone="muted">
          Waiting keeps this terminal session open until the reset; closing it
          ends the wait.
        </Text>
      )}
    </Stack>
  );
}
