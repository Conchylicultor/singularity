import type { ReactNode } from "react";
import {
  MdCheckCircle,
  MdCloudUpload,
  MdError,
  MdFolder,
} from "react-icons/md";
import { GrantAccessButton } from "@plugins/auth/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Cluster } from "@plugins/primitives/plugins/css/plugins/cluster/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import { rigidClass } from "@plugins/primitives/plugins/css/plugins/rigid/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import {
  Collapsible,
  CollapsibleChevron,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@plugins/primitives/plugins/collapsible/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import { armNumber, formatDuration, type RunRowProps } from "@plugins/runs/web";
import type {
  BackupSourceReport,
  BackupTargetResult,
} from "@plugins/backup/core";
import {
  backupRunFields,
  backupSources,
  backupTargetResults,
} from "../../core";
import { formatBytes } from "../internal/format-bytes";

/**
 * One storage target's outcome — the backup card's `TargetResultRow`, moved
 * across intact: the target's icon, its name, a tick or a cross, its own words,
 * and — on a failure the user can actually fix — the button that fixes it.
 *
 * `GrantAccessButton` is the point of this line. It is the **only** in-app
 * repair path for a storage target whose OAuth token expired: without it, a
 * Google Drive backup that lost access reports the failure forever and offers
 * nothing to do about it. Its props are the card's verbatim — the provider id
 * and scope list come off the target's own `consent` payload, because the grant
 * has to be for the scopes that were actually refused.
 */
function TargetResultLine({
  result,
}: {
  result: BackupTargetResult;
}): ReactNode {
  const Icon = result.targetId === "google-drive" ? MdCloudUpload : MdFolder;
  return (
    <Text as="div" variant="body">
      <Inline gap="sm">
        <Icon className={cn("size-4 text-muted-foreground", rigidClass())} />
        <span className="font-medium capitalize">{result.targetId}</span>
        {result.ok ? (
          <MdCheckCircle className="size-3.5 text-success" />
        ) : (
          <MdError className="size-3.5 text-destructive" />
        )}
        {result.detail !== undefined && (
          <Text as="span" variant="caption" tone="muted">
            {result.detail}
          </Text>
        )}
        {!result.ok && result.consent !== undefined && (
          <GrantAccessButton
            providerId={result.consent.providerId}
            scopes={result.consent.scopes}
            label="Grant access"
            variant="outline"
          />
        )}
      </Inline>
    </Text>
  );
}

/** One source's report — the card's Sources block, moved. */
function SourceReportLines({
  source,
}: {
  source: BackupSourceReport;
}): ReactNode {
  return (
    <Stack gap="2xs">
      <Text as="p" variant="body" className="font-medium">
        {source.name}
      </Text>
      {source.items.map((item, i) => (
        <Text
          key={`${item.label}:${i}`}
          as="p"
          variant="caption"
          tone="muted"
          className="pl-md"
        >
          {item.label}
          {item.detail !== undefined ? ` — ${item.detail}` : ""}
        </Text>
      ))}
    </Stack>
  );
}

function SectionLabel({ children }: { children: ReactNode }): ReactNode {
  return (
    <Text
      as="p"
      variant="label"
      tone="muted"
      className="uppercase tracking-wide"
    >
      {children}
    </Text>
  );
}

const archiveSizeOf = armNumber(backupRunFields, "backup.archiveSize");
const sourceCountOf = armNumber(backupRunFields, "backup.sourceCount");

/**
 * A backup run in the merged list — the backup panel's expand/collapse card,
 * moved here rather than re-derived from the base columns.
 *
 * It carries what only this arm knows and no shared column can say: the
 * **per-target** outcome (with its remediation button), and what actually went
 * into the archive. A backup is the one kind of run that can half-succeed — the
 * archive was built and reached two of three targets — so "failed" alone is not
 * an answer to what happened.
 *
 * The collapsed line keeps the card's own subtitle verbatim: trigger, archive
 * size (or `in progress`), and `N sources`. It keeps the **absolute** start time
 * too, beside the relative one the mixed feed sorts on — a backup is the one run
 * someone audits after the fact, and "3 days ago" is not a date.
 *
 * The disclosure is an ordinary `Collapsible`, which is only legal because a
 * backup row does not activate: `Runs.Kind` contributes no opener for this kind,
 * the list resolves the row to a plain container rather than a `<button>`, and
 * the trigger and the Grant access button are therefore real buttons rather than
 * buttons nested inside one.
 */
export function BackupRunRow({ run }: RunRowProps): ReactNode {
  const archiveSize = archiveSizeOf(run);
  const sourceCount = sourceCountOf(run);
  const targets = backupTargetResults(run);
  const sources = backupSources(run);

  return (
    <Fill>
      <Collapsible>
        <CollapsibleTrigger>
          <Cluster gap="xs">
            <Text as="span" variant="body">
              {run.label}
            </Text>
            <Badge variant="muted">{run.kind}</Badge>
            {run.trigger !== null && (
              <Badge variant="muted">{run.trigger}</Badge>
            )}
            {/* Only when the column actually knows. The card this row came from
                read a null size as `in progress`, which conflated "no archive
                was ever written" with "still going" — 18 long-dead runs said
                "in progress · 238h" beside an outcome of `failed`. Lifecycle is
                the shared `outcome`'s to state, one line away; a missing size
                means only that the size is unknown. */}
            {archiveSize !== null && (
              <Badge variant="muted">{formatBytes(archiveSize)}</Badge>
            )}
            {sourceCount !== null && (
              <Badge variant="muted">{`${sourceCount} sources`}</Badge>
            )}
            <Text as="span" variant="caption" tone="muted">
              {formatDuration(run.duration)} ·{" "}
              <RelativeTime date={run.startedAt} /> ·{" "}
              {run.startedAt.toLocaleString()}
            </Text>
            <CollapsibleChevron />
          </Cluster>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <Stack gap="md">
            {sources.length > 0 && (
              <Stack gap="xs">
                <SectionLabel>Sources</SectionLabel>
                {sources.map((source) => (
                  <SourceReportLines key={source.id} source={source} />
                ))}
              </Stack>
            )}
            {targets.length > 0 && (
              <Stack gap="xs">
                <SectionLabel>Targets</SectionLabel>
                {targets.map((result) => (
                  <TargetResultLine key={result.targetId} result={result} />
                ))}
              </Stack>
            )}
          </Stack>
        </CollapsibleContent>
      </Collapsible>
    </Fill>
  );
}
