import type { ReactElement } from "react";
import { Markdown } from "@plugins/primitives/plugins/markdown/web";
import { Expandable } from "@plugins/primitives/plugins/expandable/web";
import {
  Badge,
  type BadgeVariant,
} from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import type { OutcomeReport, ReportStanding } from "../../core";

const STANDING: Record<
  ReportStanding,
  { label: string; variant: BadgeVariant }
> = {
  landed: { label: "Pushed", variant: "success" },
  pending: { label: "Branch waiting for push", variant: "warning" },
  none: { label: "No changes", variant: "muted" },
};

/**
 * One outcome report: its standing at submit time, the markdown body (clamped,
 * Show more past 12rem) and its question. `answer` turns the question's labels
 * into buttons; without it they are listed as the options the agent offered.
 */
export function OutcomeReportView({
  report,
  answer,
}: {
  report: OutcomeReport;
  answer?: { choose: (label: string) => void; disabled: boolean };
}): ReactElement {
  const standing = STANDING[report.standing];
  return (
    <Stack gap="sm">
      <Stack direction="row" gap="sm" align="center">
        <Text variant="label">Outcome report</Text>
        <Badge variant={standing.variant}>{standing.label}</Badge>
        <Text variant="caption" tone="muted">
          <RelativeTime date={new Date(report.submittedAt)} />
        </Text>
      </Stack>
      <Expandable>
        <Markdown>{report.body}</Markdown>
      </Expandable>
      {report.question !== null ? (
        <Stack gap="xs">
          <Text as="p" variant="label">
            {report.question}
          </Text>
          {report.answers.length > 0 ? (
            <Stack direction="row" gap="xs" wrap>
              {report.answers.map((label) =>
                answer ? (
                  <Button
                    key={label}
                    variant="outline"
                    disabled={answer.disabled}
                    onClick={() => answer.choose(label)}
                  >
                    {label}
                  </Button>
                ) : (
                  <Badge key={label} variant="muted">
                    {label}
                  </Badge>
                ),
              )}
            </Stack>
          ) : null}
        </Stack>
      ) : null}
    </Stack>
  );
}
