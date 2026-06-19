import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useState } from "react";
import {
  MdBackup,
  MdCheckCircle,
  MdError,
  MdWarning,
  MdExpandMore,
  MdExpandLess,
  MdCloudUpload,
  MdFolder,
} from "react-icons/md";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Frame } from "@plugins/primitives/plugins/css/plugins/frame/web";
import { Clip } from "@plugins/primitives/plugins/css/plugins/clip/web";
import { TruncatingText } from "@plugins/primitives/plugins/css/plugins/truncating-text/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { useEndpoint, useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import { GrantAccessButton } from "@plugins/auth/web";
import type { BackupTargetResult, BackupSourceReport } from "@plugins/backup/core";
import { listBackupRuns, runBackup, type BackupRun } from "../../shared/endpoints";
import { ConfigGearButton } from "@plugins/config_v2/plugins/config-link/web";
import { backupConfig } from "../../shared/config";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "ok":
      return <MdCheckCircle className="size-4 text-success" />;
    case "partial":
      return <MdWarning className="size-4 text-warning" />;
    case "failed":
      return <MdError className="size-4 text-destructive" />;
    default:
      return (
        <div className="size-4 rounded-full border-2 border-muted-foreground border-t-transparent animate-spin" />
      );
  }
}

function TargetResultRow({ result }: { result: BackupTargetResult }) {
  const Icon = result.targetId === "google-drive" ? MdCloudUpload : MdFolder;
  return (
    <Frame
      gap="sm"
      leading={
        <>
          <Icon className="size-4 text-muted-foreground" />
          <Text as="span" variant="body" className="font-medium capitalize">
            {result.targetId}
          </Text>
          {result.ok ? (
            <MdCheckCircle className="size-3.5 text-success" />
          ) : (
            <MdError className="size-3.5 text-destructive" />
          )}
        </>
      }
      meta={
        result.detail ? (
          <TruncatingText className="text-caption text-muted-foreground">
            {result.detail}
          </TruncatingText>
        ) : undefined
      }
      trailing={
        !result.ok && result.consent ? (
          <GrantAccessButton
            providerId={result.consent.providerId}
            scopes={result.consent.scopes}
            label="Grant access"
            variant="outline"
            size="sm"
          />
        ) : undefined
      }
    />
  );
}

function BackupRunRow({ run }: { run: BackupRun }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Clip className="rounded-md border">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-lg py-md hover:bg-muted/50 transition-colors text-left"
      >
        <Frame
          gap="md"
          content={
            <Frame
              gap="md"
              leading={<StatusIcon status={run.status} />}
              content={
                <div>
                  <Text as="p" variant="label" className="truncate">
                    {new Date(run.startedAt).toLocaleString()}
                  </Text>
                  <Text as="p" variant="caption" className="text-muted-foreground">
                    {run.trigger} ·{" "}
                    {run.archiveSizeBytes
                      ? formatSize(run.archiveSizeBytes)
                      : "in progress"}
                    {Array.isArray(run.manifest?.sources)
                      ? ` · ${run.manifest.sources.filter((s) => !s.skipped).length} sources`
                      : ""}
                  </Text>
                </div>
              }
            />
          }
          trailing={
            expanded ? (
              <MdExpandLess className="size-4 text-muted-foreground" />
            ) : (
              <MdExpandMore className="size-4 text-muted-foreground" />
            )
          }
        />
      </button>

      {expanded && (
        <Stack gap="md" className="border-t px-lg py-md">
          {Array.isArray(run.manifest?.sources) && (
            <Stack gap="xs">
              <Text as="p" variant="label" className="text-muted-foreground uppercase tracking-wide">
                Sources
              </Text>
              {(run.manifest.sources as BackupSourceReport[])
                .filter((s) => !s.skipped)
                .map((s) => (
                  <Stack key={s.id} gap="2xs">
                    <Text as="p" variant="body" className="font-medium">
                      {s.name}
                    </Text>
                    {s.items.map((item, i) => (
                      <Text
                        key={i}
                        as="p"
                        variant="caption"
                        className="text-muted-foreground pl-md"
                      >
                        {item.label}
                        {item.detail ? ` — ${item.detail}` : ""}
                      </Text>
                    ))}
                  </Stack>
                ))}
            </Stack>
          )}
          {run.targetResults && (
            <Stack gap="xs">
              <Text as="p" variant="label" className="text-muted-foreground uppercase tracking-wide">
                Targets
              </Text>
              {run.targetResults.map((r) => (
                <TargetResultRow key={r.targetId} result={r} />
              ))}
            </Stack>
          )}
        </Stack>
      )}
    </Clip>
  );
}

export function BackupPanel() {
  const { data: runs, isLoading } = useEndpoint(listBackupRuns, {});
  const { mutate: triggerBackup, isPending } = useEndpointMutation(runBackup, {
    invalidates: [listBackupRuns],
  });

  return (
    <Stack gap="xl" className="p-xl max-w-2xl">
        <Stack gap="xs">
          <Frame
            gap="md"
            content={<Text as="h2" variant="heading">Backup</Text>}
            trailing={<ConfigGearButton descriptor={backupConfig} label="Backup settings" />}
          />
          <Text as="p" variant="body" className="text-muted-foreground">
            Archives enabled sources and dispatches to all enabled storage targets.
          </Text>
        </Stack>

        <Button onClick={() => triggerBackup({})} loading={isPending}>
          {/* eslint-disable-next-line spacing/no-adhoc-spacing -- leading-icon offset inside button label */}
          <MdBackup className="size-4 mr-2" />
          Run Backup Now
        </Button>

        <Stack gap="md">
          <Text
            as="h3"
            variant="label"
            className="font-semibold text-muted-foreground uppercase tracking-wide"
          >
            Backup History
          </Text>
          {isLoading ? (
            <Loading variant="rows" />
          ) : !runs || runs.length === 0 ? (
            <Text as="p" variant="body" className="text-muted-foreground">
              No backups yet. Click above to create one.
            </Text>
          ) : (
            <Stack gap="sm">
              {runs.map((run) => (
                <BackupRunRow key={run.id} run={run} />
              ))}
            </Stack>
          )}
        </Stack>
    </Stack>
  );
}
