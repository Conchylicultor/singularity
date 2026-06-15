import { useContext, useMemo } from "react";
import { MdCheck, MdClose } from "react-icons/md";
import { parse as parseJsonc } from "jsonc-parser";
import { PluginRuntimeContext } from "@plugins/framework/plugins/web-sdk/core";
import type { Contribution } from "@plugins/framework/plugins/web-sdk/core";
import { asPath, asPluginId } from "@plugins/framework/plugins/plugin-id/core";
import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { getConfigRawFile } from "@plugins/config_v2/plugins/settings/core";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { Placeholder } from "@plugins/primitives/plugins/placeholder/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { Card } from "@plugins/primitives/plugins/card/web";
import { Badge } from "@plugins/primitives/plugins/badge/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { Button } from "@plugins/primitives/plugins/ui-kit/web";
import type { ReorderTree } from "@plugins/fields/plugins/reorder-tree/core";
import {
  diffReorderTrees,
  type ReorderDiffEntry,
} from "@plugins/reorder/web";
import {
  stagedReorderDefaultsResource,
  useApplyReorderDefault,
  useApplyAllReorderDefaults,
  useDiscardReorderDefault,
  type StagedReorderDefault,
} from "@plugins/reorder/plugins/staging/web";
import type { Source } from "@plugins/review/web";

/**
 * The "Reorder Defaults" review section. Lists every staged "default for
 * everyone" reorder edit (worktree-global, so `conversationId`/`source` are
 * ignored for filtering) with a before→after diff and per-slot "Commit to main"
 * / Discard, plus an "Apply all" action when more than one slot is staged.
 *
 * Committing lands the override directly on `main` (a non-blocking job spins up
 * a throwaway worktree off main, writes the committed config, and pushes); the
 * row disappears from this list once the job drains it.
 */
export function ReorderDefaultsSection({
  conversationId: _conversationId,
  source: _source,
}: {
  conversationId: string;
  source: Source;
}) {
  const staged = useResource(stagedReorderDefaultsResource);
  const apply = useApplyReorderDefault();
  const applyAll = useApplyAllReorderDefaults();
  const discard = useDiscardReorderDefault();

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
        <Placeholder>No staged reorder defaults.</Placeholder>
      </Body>
    );
  }

  return (
    <div className="flex min-h-0 flex-col">
      <div className="sticky top-0 z-raised flex flex-col gap-2xs border-b border-border bg-background/95 px-lg py-sm backdrop-blur">
        <div className="flex items-center gap-md">
          <Text as="div" variant="label">
            {rows.length} staged {rows.length === 1 ? "slot" : "slots"}
          </Text>
          {rows.length > 1 && (
            <div className="flex flex-1 items-center justify-end">
              <Button
                variant="outline"
                size="sm"
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
      </div>
      <Body>
        <div className="flex flex-col gap-md p-md">
          {rows.map((row) => (
            <StagedSlotCard
              key={row.slotId}
              row={row}
              onApply={() => apply.mutate({ params: { slotId: row.slotId } })}
              onDiscard={() => discard.mutate({ params: { slotId: row.slotId } })}
            />
          ))}
        </div>
      </Body>
    </div>
  );
}

function StagedSlotCard({
  row,
  onApply,
  onDiscard,
}: {
  row: StagedReorderDefault;
  onApply: () => void;
  onDiscard: () => void;
}) {
  // The live contribution catalog for this slot, read from the same plugin
  // runtime context `useConfig`/`<Slot.Render>` use. `diffReorderTrees` resolves
  // both trees over it, so the diff reflects the real, visible layout.
  const ctx = useContext(PluginRuntimeContext);
  const contributions: Contribution[] = useMemo(
    () => ctx?.bySlot.get(row.slotId) ?? [],
    [ctx, row.slotId],
  );

  // "Before" = the current committed git-layer default. The staged row never
  // touches the user layer, so the committed `config/<plugin>/<slot>.jsonc`
  // (falling back to the generated origin when no override exists yet) is the
  // baseline we diff the staged tree against.
  const storePath = useMemo(
    () => `${asPath(asPluginId(row.pluginId))}/${row.slotId}.jsonc`,
    [row.pluginId, row.slotId],
  );
  const rawFile = useEndpoint(getConfigRawFile, {}, { query: { storePath } });

  const afterTree = row.items as ReorderTree;

  if (rawFile.isPending) {
    return (
      <Card>
        <CardHeader label={row.slotId} onApply={onApply} onDiscard={onDiscard} />
        <div className="px-md pb-md">
          <Loading />
        </div>
      </Card>
    );
  }

  const beforeTree = parseCommittedItems(
    rawFile.data?.gitOverride ?? rawFile.data?.gitOrigin ?? null,
  );

  const diff = diffReorderTrees(contributions, beforeTree, afterTree);
  const changed = diff.entries.filter((e) => e.status !== "unchanged");

  return (
    <Card>
      <CardHeader label={row.slotId} onApply={onApply} onDiscard={onDiscard} />
      <div className="flex flex-col gap-xs px-md pb-md">
        {changed.length === 0 ? (
          <Placeholder>No changes vs. the current default.</Placeholder>
        ) : (
          diff.entries.map((entry) => (
            <DiffRow key={entry.entryKey} entry={entry} />
          ))
        )}
      </div>
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
        {humanizeSlotId(label)}
      </Text>
      <Button variant="outline" size="sm" onClick={onApply}>
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

const STATUS_META: Record<
  ReorderDiffEntry["status"],
  { label: string; variant: "muted" | "primary" | "success" | "warning" }
> = {
  unchanged: { label: "unchanged", variant: "muted" },
  moved: { label: "moved", variant: "primary" },
  added: { label: "shown", variant: "success" },
  hidden: { label: "hidden", variant: "warning" },
};

function DiffRow({ entry }: { entry: ReorderDiffEntry }) {
  const meta = STATUS_META[entry.status];
  const muted = entry.status === "unchanged" || entry.status === "hidden";
  return (
    <div className="flex items-center gap-sm">
      {entry.status === "hidden" ? (
        <MdClose className="size-3.5 shrink-0 text-warning" />
      ) : (
        <MdCheck className="size-3.5 shrink-0 text-success" />
      )}
      <Text
        as="span"
        variant="caption"
        tone={muted ? "muted" : "default"}
        className="min-w-0 flex-1 truncate"
      >
        {entry.label}
      </Text>
      {entry.status !== "unchanged" && (
        <Badge size="sm" variant={meta.variant}>
          {meta.label}
        </Badge>
      )}
    </div>
  );
}

function Body({ children }: { children: React.ReactNode }) {
  return <div className="min-h-0 flex-1 overflow-auto isolate">{children}</div>;
}

/**
 * Parse the committed JSONC document's `items` into a `ReorderTree`. The raw
 * file carries a `// @hash` header comment, which `jsonc-parser` tolerates. A
 * missing/unparseable document or a non-array `items` resolves to an empty tree
 * — `applyTree` (inside `diffReorderTrees`) then renders the full natural-order
 * catalog as the baseline, so nothing is silently dropped.
 */
function parseCommittedItems(raw: string | null): ReorderTree {
  if (!raw) return [];
  const doc = parseJsonc(raw) as { items?: unknown } | undefined;
  const items = doc?.items;
  return Array.isArray(items) ? (items as ReorderTree) : [];
}

/**
 * Render a slot id (`conversations.conversation-view.action-bar`) as a compact,
 * readable label. We surface the last two dotted segments title-cased — enough
 * to disambiguate without the full path overflowing the card header.
 */
function humanizeSlotId(slotId: string): string {
  const segments = slotId.split(".");
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
