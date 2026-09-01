import type { ReactNode } from "react";
import {
  MdCheckCircle,
  MdCloudUpload,
  MdError,
  MdFolder,
} from "react-icons/md";
import { GrantAccessButton } from "@plugins/auth/web";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import { rigidClass } from "@plugins/primitives/plugins/css/plugins/rigid/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type {
  BackupSourceReport,
  BackupTargetResult,
} from "@plugins/backup/core";
import type { UnionRun } from "@plugins/runs/core";
import { backupSources, backupTargetResults } from "../internal/payload";

/**
 * One storage target's outcome: the target's icon, its name, a tick or a cross,
 * its own words, and — on a failure the user can actually fix — the button that
 * fixes it.
 *
 * `GrantAccessButton` is the point of this line. It is the **only** in-app
 * repair path for a storage target whose OAuth token expired: without it, a
 * Google Drive backup that lost access reports the failure forever and offers
 * nothing to do about it. Its provider id and scope list come off the target's
 * own `consent` payload, because the grant has to be for the scopes that were
 * actually refused — not for whatever this plugin thinks Drive needs.
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

/** One source's report: what it is, and the items it contributed. */
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

/**
 * What actually went into the archive.
 *
 * The manifest's non-skipped source reports — the same subset the
 * `backup.sourceCount` column counts, because both read the filter from the one
 * decoder. A backup is the run someone audits after the fact, and "2 sources"
 * is not an answer to what was in it.
 */
export function BackupSourcesSection({ run }: { run: UnionRun }): ReactNode {
  return (
    <Stack gap="xs">
      {backupSources(run).map((source) => (
        <SourceReportLines key={source.id} source={source} />
      ))}
    </Stack>
  );
}

/**
 * Where the archive was dispatched to, and how each target went.
 *
 * A backup is the one kind of run that can half-succeed — the archive was built
 * and reached two of three targets — so the shared `outcome` alone is not an
 * answer to what happened. This is the per-target reading it stands for, and on
 * a refused OAuth token it is also where the repair lives.
 */
export function BackupTargetsSection({ run }: { run: UnionRun }): ReactNode {
  return (
    <Stack gap="xs">
      {backupTargetResults(run).map((result) => (
        <TargetResultLine key={result.targetId} result={result} />
      ))}
    </Stack>
  );
}
