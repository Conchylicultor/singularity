import type { ReactNode } from "react";
import { Card } from "@plugins/primitives/plugins/css/plugins/card/web";
import { Cluster } from "@plugins/primitives/plugins/css/plugins/cluster/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

export interface CardFrameProps {
  title: string;
  description?: string;
  /** The card's controls, top right; they wrap under the title when narrow. */
  controls?: ReactNode;
  children: ReactNode;
  "data-metric-card"?: string;
}

/** A metrics card: title and description, controls top right, then the body. */
export function CardFrame({
  title,
  description,
  controls,
  children,
  ...rest
}: CardFrameProps): ReactNode {
  return (
    <Card as="section" aria-label={title} {...rest}>
      <Stack gap="md">
        <Stack direction="row" gap="md" align="start" wrap>
          <Fill>
            <Stack gap="2xs">
              <Text variant="heading" as="h3">
                {title}
              </Text>
              {description !== undefined && (
                <Text variant="caption" tone="muted">
                  {description}
                </Text>
              )}
            </Stack>
          </Fill>
          {controls !== undefined && <Cluster gap="sm">{controls}</Cluster>}
        </Stack>
        {children}
      </Stack>
    </Card>
  );
}
