import { useMemo } from "react";
import { MdClose } from "react-icons/md";
import { parse as parseJsonc } from "jsonc-parser";
import { asPath, asPluginId } from "@plugins/framework/plugins/plugin-id/core";
import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { getConfigRawFile } from "@plugins/config_v2/plugins/settings/core";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Card } from "@plugins/primitives/plugins/css/plugins/card/web";
import { Stack, Inset } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { Sticky } from "@plugins/primitives/plugins/css/plugins/sticky/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import {
  stagedConfigDefaultsResource,
  useApplyConfigDefault,
  useApplyAllConfigDefaults,
  useDiscardConfigDefault,
  useStagingDiffRenderers,
  GenericConfigDiff,
  type StagedConfigDefault,
} from "@plugins/config_v2/plugins/staging/web";
import type { Source } from "@plugins/review/web";

/**
 * The generic "Default for everyone" review section. Lists every staged config
 * "default for everyone" edit (worktree-global, so `conversationId`/`source` are
 * ignored for filtering) with a per-config before→after diff and per-row "Commit
 * to main" / Discard, plus an "Apply all" action when more than one is staged.
 *
 * The diff is delegated to the first matching `Staging.DiffRenderer` contribution
 * (e.g. reorder's rich moved/shown/hidden renderer), falling back to the generic
 * structural diff. This plugin has NO knowledge of any specific config.
 *
 * Committing lands the override directly on `main` (a non-blocking job spins up
 * a throwaway worktree off main, writes the committed config, and pushes); the
 * row disappears from this list once the job drains it.
 */
export function ConfigDefaultsSection({
  conversationId: _conversationId,
  source: _source,
}: {
  conversationId: string;
  source: Source;
}) {
  const staged = useResource(stagedConfigDefaultsResource);
  const apply = useApplyConfigDefault();
  const applyAll = useApplyAllConfigDefaults();
  const discard = useDiscardConfigDefault();

  if (staged.pending) {
    return (
      <Body>
        <Loading />
      </Body>
    );
  }

  const rows = staged.data;

  if (rows.length === 0) {
    return (
      <Body>
        <Placeholder>No staged defaults.</Placeholder>
      </Body>
    );
  }

  return (
    <Stack gap="none" className="min-h-0">
      <Sticky edge="top">
        <Stack gap="2xs" className="border-b border-border bg-background/95 px-lg py-sm backdrop-blur">
          <div className="flex items-center gap-md">
            <Text as="div" variant="label">
              {rows.length} staged {rows.length === 1 ? "config" : "configs"}
            </Text>
            {rows.length > 1 && (
              <div className="flex flex-1 items-center justify-end">
                <Button
                  variant="outline"
                  onClick={() => applyAll.mutate({})}
                >
                  Apply all
                </Button>
              </div>
            )}
          </div>
          <Text as="div" variant="caption" tone="muted">
            Committing pushes the new default directly to{" "}
            <span className="font-medium">main</span>.
          </Text>
        </Stack>
      </Sticky>
      <Body>
        <Inset pad="md">
          <Stack gap="md">
          {rows.map((row) => (
            <StagedConfigCard
              key={`${row.pluginId} ${row.configName}`}
              row={row}
              onApply={() =>
                apply.mutate({
                  params: {
                    pluginId: row.pluginId,
                    configName: row.configName,
                  },
                })
              }
              onDiscard={() =>
                discard.mutate({
                  params: {
                    pluginId: row.pluginId,
                    configName: row.configName,
                  },
                })
              }
            />
          ))}
          </Stack>
        </Inset>
      </Body>
    </Stack>
  );
}

function StagedConfigCard({
  row,
  onApply,
  onDiscard,
}: {
  row: StagedConfigDefault;
  onApply: () => void;
  onDiscard: () => void;
}) {
  const renderers = useStagingDiffRenderers();

  // "Before" = the current committed git-layer default. The staged row never
  // touches the user layer, so the committed `config/<plugin>/<name>.jsonc`
  // (falling back to the generated origin when no override exists yet) is the
  // baseline we diff the staged value against.
  const storePath = useMemo(
    () => `${asPath(asPluginId(row.pluginId))}/${row.configName}.jsonc`,
    [row.pluginId, row.configName],
  );
  const rawFile = useEndpoint(getConfigRawFile, {}, { query: { storePath } });

  if (rawFile.isPending) {
    return (
      <Card>
        <CardHeader
          label={row.configName}
          onApply={onApply}
          onDiscard={onDiscard}
        />
        <div className="px-md pb-md">
          <Loading />
        </div>
      </Card>
    );
  }

  const before = parseDocument(
    rawFile.data?.gitOverride ?? rawFile.data?.gitOrigin ?? null,
  );

  // First contributed renderer that claims this (pluginId, configName), else the
  // generic structural diff.
  const renderer = renderers.find((r) =>
    r.match({ pluginId: row.pluginId, configName: row.configName }),
  );
  const Renderer = renderer?.component;

  return (
    <Card>
      <CardHeader
        label={row.configName}
        onApply={onApply}
        onDiscard={onDiscard}
      />
      <Inset x="md" b="md">
        <Stack gap="xs">
          {Renderer ? (
            <Renderer row={row} before={before} />
          ) : (
            <GenericConfigDiff before={before} after={row.value} />
          )}
        </Stack>
      </Inset>
    </Card>
  );
}

function CardHeader({
  label,
  onApply,
  onDiscard,
}: {
  label: string;
  onApply: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="flex items-center gap-sm px-md py-sm">
      <Text as="div" variant="label" className="min-w-0 flex-1 truncate">
        {humanizeConfigName(label)}
      </Text>
      <Button variant="outline" onClick={onApply}>
        Commit to main
      </Button>
      <IconButton
        icon={MdClose}
        label="Discard"
        tooltip="Discard staged default"
        onClick={onDiscard}
      />
    </div>
  );
}

function Body({ children }: { children: React.ReactNode }) {
  return <Scroll axis="both" fill isolate>{children}</Scroll>;
}

/**
 * Parse a committed JSONC config document into a plain object. The raw file
 * carries a `// @hash` header comment, which `jsonc-parser` tolerates. A
 * missing/unparseable document resolves to `null` (the diff renderer treats it
 * as an empty baseline).
 */
function parseDocument(raw: string | null): unknown {
  if (!raw) return null;
  return parseJsonc(raw) as unknown;
}

/**
 * Render a config name / slot id (`conversations.conversation-view.action-bar`)
 * as a compact, readable label. Surfaces the last two dotted segments
 * title-cased — enough to disambiguate without the full path overflowing.
 */
function humanizeConfigName(name: string): string {
  const segments = name.split(".");
  const tail = segments.slice(-2);
  return tail
    .map((s) =>
      s
        .split(/[-_]/)
        .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
        .join(" "),
    )
    .join(" · ");
}
