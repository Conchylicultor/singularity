import type { ReactNode } from "react";
import {
  NEVER_RECORDED,
  RECORDED_FIELDS,
} from "@plugins/apps/plugins/deploy/plugins/analytics/plugins/collect/core";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Card } from "@plugins/primitives/plugins/css/plugins/card/web";
import { Grid } from "@plugins/primitives/plugins/css/plugins/grid/web";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import {
  SectionLabel,
  Text,
} from "@plugins/primitives/plugins/css/plugins/text/web";

/**
 * "What one visit records", rendered from the same field list the collect
 * plugin's storage is type-checked against — so this panel cannot claim less
 * (or more) than the tables hold.
 */
export function RecordedFields(): ReactNode {
  return (
    <Card>
      <Stack gap="md">
        <Inline gap="sm" align="baseline">
          <Text as="h3" variant="subheading">
            What one visit records
          </Text>
          <Text variant="caption" tone="muted">
            {RECORDED_FIELDS.length} fields · no cookies
          </Text>
        </Inline>
        <Grid minCellWidth="18rem" gap="lg" align="start">
          <Stack gap="sm" as="dl">
            {RECORDED_FIELDS.map((field) => (
              <Stack key={field.name} gap="none">
                <Inline gap="xs" as="dt">
                  <Text variant="code">{field.name}</Text>
                  {"notCollectedYet" in field && field.notCollectedYet && (
                    <Badge variant="muted">not collected yet</Badge>
                  )}
                </Inline>
                <Text as="dd" variant="caption" tone="muted">
                  {field.description}
                </Text>
              </Stack>
            ))}
          </Stack>
          <Stack gap="xs">
            <SectionLabel>Never recorded</SectionLabel>
            <Stack gap="2xs" as="ul">
              {NEVER_RECORDED.map((line) => (
                <Text key={line} as="li" variant="body" tone="muted">
                  {line}
                </Text>
              ))}
            </Stack>
          </Stack>
        </Grid>
      </Stack>
    </Card>
  );
}
