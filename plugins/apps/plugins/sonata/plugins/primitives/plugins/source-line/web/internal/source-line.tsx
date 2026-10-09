import type { ReactNode } from "react";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { rigidClass } from "@plugins/primitives/plugins/css/plugins/rigid/web";

export interface SourceLineProps {
  /** The source's name — one line, truncates first under pressure. */
  title: ReactNode;
  /** Optional chip inline right after the title; never shrinks. */
  badge?: ReactNode;
  /** Optional muted second line (artist, channel, key/capo…). */
  subtitle?: ReactNode;
  /** Trailing action (e.g. a ghost "Replace"), centred across both lines. */
  action: ReactNode;
  /** Optional expanded area rendered below the line (e.g. a URL row). */
  children?: ReactNode;
}

/**
 * A loaded source's identity line: `title [badge]` over a muted `subtitle` in
 * the one flexible cell, with a rigid trailing `action` centred across both —
 * the `minmax(0,1fr) auto` shape, composed from line primitives so the title
 * truncates while the badge and action keep their width.
 */
export function SourceLine({
  title,
  badge,
  subtitle,
  action,
  children,
}: SourceLineProps) {
  return (
    <Stack gap="sm">
      <Stack direction="row" align="center" gap="sm">
        <Fill>
          <Stack gap="2xs">
            <Line className="gap-sm">
              <Text variant="label">{title}</Text>
              {badge !== undefined ? (
                <span className={rigidClass()}>{badge}</span>
              ) : null}
            </Line>
            {subtitle !== undefined ? (
              <Line>
                <Text variant="caption" tone="muted">
                  {subtitle}
                </Text>
              </Line>
            ) : null}
          </Stack>
        </Fill>
        <span className={rigidClass()}>{action}</span>
      </Stack>
      {children}
    </Stack>
  );
}
