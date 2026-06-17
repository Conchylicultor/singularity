import { useContext, useMemo } from "react";
import { MdCheck, MdClose } from "react-icons/md";
import { PluginRuntimeContext } from "@plugins/framework/plugins/web-sdk/core";
import type { Contribution } from "@plugins/framework/plugins/web-sdk/core";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { Badge } from "@plugins/primitives/plugins/badge/web";
import { Stack } from "@plugins/primitives/plugins/spacing/web";
import type { StagedDiffProps } from "@plugins/config_v2/plugins/staging/web";
import type { ReorderTree } from "@plugins/fields/plugins/reorder-tree/core";
import { diffReorderTrees, type ReorderDiffEntry } from "../internal/diff";

const STATUS_META: Record<
  ReorderDiffEntry["status"],
  { label: string; variant: "muted" | "primary" | "success" | "warning" }
> = {
  unchanged: { label: "unchanged", variant: "muted" },
  moved: { label: "moved", variant: "primary" },
  added: { label: "shown", variant: "success" },
  hidden: { label: "hidden", variant: "warning" },
};

/** Pull a reorder `items` tree out of a full config document. */
function itemsOf(doc: unknown): ReorderTree {
  const items = (doc as { items?: unknown } | null | undefined)?.items;
  return Array.isArray(items) ? (items as ReorderTree) : [];
}

/**
 * Reorder's rich `Staging.DiffRenderer`: resolves the staged ("after") and
 * committed ("before") `items` trees over the live contribution catalog for the
 * slot (`row.configName`), then renders the moved / shown / hidden contributions.
 *
 * The live catalog is read generically from `PluginRuntimeContext.bySlot` (the
 * same registry `useConfig` / `<Slot.Render>` use) — never by naming a slot owner.
 */
export function ReorderDiffRenderer({ row, before }: StagedDiffProps) {
  const ctx = useContext(PluginRuntimeContext);
  const contributions: Contribution[] = useMemo(
    () => ctx?.bySlot.get(row.configName) ?? [],
    [ctx, row.configName],
  );

  const diff = useMemo(
    () => diffReorderTrees(contributions, itemsOf(before), itemsOf(row.value)),
    [contributions, before, row.value],
  );
  const changed = diff.entries.filter((e) => e.status !== "unchanged");

  if (changed.length === 0) {
    return <Placeholder>No changes vs. the current default.</Placeholder>;
  }

  return (
    <Stack gap="xs">
      {diff.entries.map((entry) => (
        <DiffRow key={entry.entryKey} entry={entry} />
      ))}
    </Stack>
  );
}

function DiffRow({ entry }: { entry: ReorderDiffEntry }) {
  const meta = STATUS_META[entry.status];
  const muted = entry.status === "unchanged" || entry.status === "hidden";
  return (
    <Stack direction="row" gap="sm" align="center">
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
    </Stack>
  );
}
