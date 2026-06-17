import { useState } from "react";
import { MdAdd, MdClose } from "react-icons/md";
import { Button } from "@plugins/primitives/plugins/ui-kit/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { SectionLabel } from "@plugins/primitives/plugins/css/plugins/section-label/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { InlinePopover } from "@plugins/primitives/plugins/popover/web";
import { SearchInput } from "@plugins/primitives/plugins/search/web";
import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import { updateActiveDraft } from "@plugins/plugin-meta/plugins/composition/web";
import type { CompositionManifest } from "@plugins/plugin-meta/plugins/closure/core";
import type { PluginId } from "@plugins/framework/plugins/plugin-id/core";

function shortName(id: PluginId): string {
  const s = String(id);
  const dot = s.lastIndexOf(".");
  return dot === -1 ? s : s.slice(dot + 1);
}

/**
 * Secondary editor for the draft's entry points. Lists current entries with a
 * remove affordance and an add control (search over every known plugin id).
 * Each edit patches the draft via `updateActiveDraft`, re-resolving membership.
 */
export function EntryEditor({
  draft,
  allIds,
}: {
  draft: CompositionManifest;
  allIds: PluginId[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const current = new Set(draft.entryPoints);

  function remove(id: PluginId): void {
    updateActiveDraft({ entryPoints: draft.entryPoints.filter((x) => x !== id) });
  }
  function add(id: PluginId): void {
    if (current.has(id)) return;
    updateActiveDraft({ entryPoints: [...draft.entryPoints, id] });
    setOpen(false);
    setQuery("");
  }

  const q = query.trim().toLowerCase();
  const candidates = allIds
    .filter((id) => !current.has(id) && (!q || String(id).toLowerCase().includes(q)))
    .slice(0, 50);

  return (
    <Stack gap="sm">
      <div className="flex items-center justify-between gap-sm">
        <SectionLabel>Entry points</SectionLabel>
        <InlinePopover
          open={open}
          onOpenChange={setOpen}
          align="end"
          contentClassName="w-80"
          trigger={
            <Button variant="outline" size="sm">
              <MdAdd />
              Add
            </Button>
          }
        >
          <Stack gap="sm">
            <SearchInput
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search plugins…"
              autoFocus
            />
            <Stack gap="2xs" className="max-h-64 overflow-y-auto">
              {candidates.length === 0 ? (
                <Text variant="caption" tone="muted">
                  No matching plugins.
                </Text>
              ) : (
                candidates.map((id) => (
                  <Row
                    key={id}
                    size="sm"
                    hover="muted"
                    onClick={() => add(id)}
                    title={String(id)}
                  >
                    <span className="truncate font-mono">{String(id)}</span>
                  </Row>
                ))
              )}
            </Stack>
          </Stack>
        </InlinePopover>
      </div>
      {draft.entryPoints.length === 0 ? (
        <Text variant="caption" tone="muted">
          No entry points.
        </Text>
      ) : (
        <div className="flex flex-wrap gap-xs">
          {draft.entryPoints.map((id) => (
            <Badge
              key={id}
              variant="primary"
              title={String(id)}
              icon={
                <IconButton
                  icon={MdClose}
                  label="Remove entry point"
                  size="sm"
                  onClick={() => remove(id)}
                />
              }
            >
              <span className="font-mono">{shortName(id)}</span>
            </Badge>
          ))}
        </div>
      )}
    </Stack>
  );
}
