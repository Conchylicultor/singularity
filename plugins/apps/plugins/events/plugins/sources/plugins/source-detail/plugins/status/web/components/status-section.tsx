import type { ReactNode } from "react";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import {
  SOURCE_STATUS_LABEL,
  SOURCE_STATUS_VARIANT,
  useEventSource,
} from "@plugins/apps/plugins/events/plugins/sources/web";

/** The status chip, also shown beside the title while the card is collapsed. */
export function SourceStatusSummary({
  sourceId,
}: {
  sourceId: string;
}): ReactNode {
  const lookup = useEventSource(sourceId);
  if (lookup.status !== "found") return null;
  return (
    <Badge variant={SOURCE_STATUS_VARIANT[lookup.source.status]}>
      {SOURCE_STATUS_LABEL[lookup.source.status]}
    </Badge>
  );
}

/** Open by default when the source is broken — that is when this card matters. */
export function useSourceStatusDefaultOpen({
  sourceId,
}: {
  sourceId: string;
}): boolean {
  const lookup = useEventSource(sourceId);
  return lookup.status === "found" && lookup.source.status === "error";
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Line className="gap-sm">
      <Text variant="label">{label}</Text>
      <Fill />
      <Text variant="caption" tone="muted">
        {children}
      </Text>
    </Line>
  );
}

export function SourceStatusSection({
  sourceId,
}: {
  sourceId: string;
}): ReactNode {
  const lookup = useEventSource(sourceId);

  if (lookup.status === "pending") return <Loading variant="rows" />;
  if (lookup.status === "error") {
    return <Placeholder tone="error">{lookup.error.message}</Placeholder>;
  }
  if (lookup.status === "missing") {
    return <Placeholder>This source no longer exists.</Placeholder>;
  }

  const source = lookup.source;

  return (
    <Stack gap="sm">
      <Field label="State">
        <Badge variant={SOURCE_STATUS_VARIANT[source.status]}>
          {SOURCE_STATUS_LABEL[source.status]}
        </Badge>
      </Field>
      <Field label="Last run">
        {source.lastRunAt ? (
          <RelativeTime date={source.lastRunAt} />
        ) : (
          "Never run"
        )}
      </Field>
      <Field label="Next run">
        {source.refresh === "manual"
          ? "Manual only"
          : source.nextRunAt
            ? source.nextRunAt.toLocaleString()
            : "Not scheduled"}
      </Field>
      <Field label="Fingerprint">
        {source.lastFingerprint
          ? `${source.lastFingerprint.slice(0, 12)}…`
          : "None yet"}
      </Field>

      {/* Only a TERMINAL failure lands on the row (a transient one stays on the
          run), so when this is set it is the classified reason the source is
          parked — rendered verbatim, never summarized away. */}
      {source.lastError && (
        <Stack gap="2xs">
          <Text as="p" variant="label" tone="destructive">
            {source.lastErrorCode
              ? `Last error (${source.lastErrorCode})`
              : "Last error"}
          </Text>
          <Text as="p" variant="caption" tone="destructive" className="break-words">
            {source.lastError}
          </Text>
        </Stack>
      )}
    </Stack>
  );
}
