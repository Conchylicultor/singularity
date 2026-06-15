import { useCallback, useEffect, useMemo, useState } from "react";
import { MdAdd, MdDeleteOutline, MdSave } from "react-icons/md";
import { Button, Input } from "@plugins/primitives/plugins/ui-kit/web";
import { Stack, Inset } from "@plugins/primitives/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { SectionLabel } from "@plugins/primitives/plugins/section-label/web";
import { Badge } from "@plugins/primitives/plugins/badge/web";
import { Row } from "@plugins/primitives/plugins/row/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { SegmentedControl } from "@plugins/primitives/plugins/toggle-chip/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { explorerPane } from "@plugins/apps/plugins/studio/plugins/explorer/web";
import {
  useCompositionData,
  useManifestItems,
  useManifestActions,
  useActiveComposition,
  useActiveMembership,
  useCompareComposition,
  useDiffMap,
  useGraph,
  setActiveComposition,
  setCompareComposition,
  updateActiveDraft,
  clearActive,
} from "@plugins/plugin-meta/plugins/composition/web";
import {
  manifestItemToManifest,
  type CompositionManifestItem,
} from "@plugins/plugin-meta/plugins/composition/core";
import {
  resolveComposition,
  type CompositionManifest,
} from "@plugins/plugin-meta/plugins/closure/core";
import { MembershipSummary } from "./membership-summary";
import { ContributorEditor } from "./contributor-editor";
import { EntryEditor } from "./entry-editor";
import { DiffDelta } from "./diff-delta";

/** Default A / B for compare mode — the with/without self-improvement anchor demo. */
const DEFAULT_A = "agent-manager";
const DEFAULT_B = "agent-manager-lean";

type Mode = "draft" | "compare";

/**
 * Persistence action row for the active draft: an inline editable name plus
 * Save / Delete. `editingId` is the config item id when an existing manifest is
 * loaded, `null` for a brand-new draft (Delete is then hidden). Save persists
 * via the manifest config_v2 write; the list re-renders reactively over the
 * live-state socket.
 */
function DraftActions({
  draft,
  editingId,
  onDelete,
}: {
  draft: CompositionManifest;
  editingId: string | null;
  onDelete: () => void;
}) {
  const { save } = useManifestActions();
  const canSave = draft.name.trim().length > 0;
  return (
    <Stack gap="sm">
      <Input
        value={draft.name}
        onChange={(e) => updateActiveDraft({ name: e.target.value })}
        placeholder="Composition name"
        aria-label="Composition name"
      />
      <div className="flex items-center gap-xs">
        <Button
          variant="default"
          size="sm"
          disabled={!canSave}
          onClick={() => save(draft, editingId ?? undefined)}
        >
          <MdSave />
          Save
        </Button>
        {editingId !== null && (
          <Button variant="ghost" size="sm" onClick={onDelete}>
            <MdDeleteOutline />
            Delete
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => clearActive()}>
          Clear
        </Button>
      </div>
    </Stack>
  );
}

export function CompositionsView() {
  const { manifests, allIds, isLoading } = useCompositionData();
  const items = useManifestItems();
  const { remove } = useManifestActions();
  const active = useActiveComposition();
  const compare = useCompareComposition();
  const membership = useActiveMembership();
  const diff = useDiffMap();
  const graph = useGraph();
  const [mode, setMode] = useState<Mode>("draft");
  const [contributorQuery, setContributorQuery] = useState("");
  // The config item id of the manifest currently loaded into the draft store;
  // null when the draft is a brand-new (unsaved) composition.
  const [editingId, setEditingId] = useState<string | null>(null);

  // Open the tinted Explorer tree as a sibling column whenever a composition is
  // active or being compared, so the controls and the closure tint are visible
  // side-by-side. Uses caller-aware push (right of this pane); a no-op if the
  // Explorer is already in the route.
  const openPane = useOpenPane();
  const explorerEntry = explorerPane.useRouteEntry();
  const ensureExplorerBeside = useCallback(() => {
    if (explorerEntry === null) {
      openPane(explorerPane, {}, { mode: "push", side: "right" });
    }
  }, [openPane, explorerEntry]);

  const resolved = useMemo(() => {
    if (!active || !graph) return null;
    return resolveComposition(graph, active);
  }, [active, graph]);

  const byName = useCallback(
    (name: string): CompositionManifest | undefined =>
      manifests.find((m) => m.name === name),
    [manifests],
  );

  function selectDraft(item: CompositionManifestItem): void {
    setActiveComposition(structuredClone(manifestItemToManifest(item)));
    setEditingId(item.id);
    setCompareComposition(null);
    setContributorQuery("");
    ensureExplorerBeside();
  }

  function newDraft(): void {
    setActiveComposition({
      name: "Untitled composition",
      entryPoints: [],
      selectedContributors: [],
    });
    setEditingId(null);
    setCompareComposition(null);
    setContributorQuery("");
    ensureExplorerBeside();
  }

  function deleteDraft(): void {
    if (editingId === null) return;
    remove(editingId);
    setEditingId(null);
    clearActive();
  }

  // Entering compare mode seeds the default A/B pair (if present) and shows the
  // tinted tree beside the controls. Leaving compare drops the compare manifest,
  // returning to single-composition draft mode (active stays as-is).
  function enterCompare(): void {
    setMode("compare");
    const a = byName(DEFAULT_A) ?? manifests[0];
    const b = byName(DEFAULT_B) ?? manifests[1];
    if (a) setActiveComposition(structuredClone(a));
    if (b) setCompareComposition(structuredClone(b));
    ensureExplorerBeside();
  }

  function leaveCompare(): void {
    setMode("draft");
    setCompareComposition(null);
  }

  function setA(manifest: CompositionManifest): void {
    setActiveComposition(structuredClone(manifest));
    ensureExplorerBeside();
  }

  function setB(manifest: CompositionManifest): void {
    setCompareComposition(structuredClone(manifest));
    ensureExplorerBeside();
  }

  // Keep the explorer beside whenever something is active/comparing (e.g. after a
  // reload restored an active draft, or a programmatic select).
  useEffect(() => {
    if (active || compare) ensureExplorerBeside();
  }, [active, compare, ensureExplorerBeside]);

  // A cleared draft can never carry an editing id — drop it so a later Save
  // doesn't accidentally overwrite a no-longer-loaded manifest.
  useEffect(() => {
    if (!active && editingId !== null) setEditingId(null);
  }, [active, editingId]);

  return (
    <Inset pad="md">
      <Stack gap="lg">
        <SegmentedControl<Mode>
          options={[
            { id: "draft", label: "Draft" },
            { id: "compare", label: "Compare" },
          ]}
          value={mode}
          onChange={(v) => (v === "compare" ? enterCompare() : leaveCompare())}
        />

        {isLoading ? (
          <Loading variant="text" />
        ) : mode === "compare" ? (
          manifests.length === 0 ? (
            <Text variant="caption" tone="muted">
              No named compositions to compare.
            </Text>
          ) : (
            <CompareSection
              manifests={manifests}
              active={active}
              compare={compare}
              diff={diff}
              onSetA={setA}
              onSetB={setB}
            />
          )
        ) : (
          <DraftSection
            items={items}
            active={active}
            editingId={editingId}
            membership={membership}
            resolved={resolved}
            allIds={allIds}
            contributorQuery={contributorQuery}
            onContributorQuery={setContributorQuery}
            onSelect={selectDraft}
            onNew={newDraft}
            onDelete={deleteDraft}
          />
        )}
      </Stack>
    </Inset>
  );
}

// ── Draft mode (Increments 1 & 2, unchanged behavior) ──────────────────────

function DraftSection({
  items,
  active,
  editingId,
  membership,
  resolved,
  allIds,
  contributorQuery,
  onContributorQuery,
  onSelect,
  onNew,
  onDelete,
}: {
  items: CompositionManifestItem[];
  active: CompositionManifest | null;
  editingId: string | null;
  membership: ReturnType<typeof useActiveMembership>;
  resolved: ReturnType<typeof resolveComposition> | null;
  allIds: ReturnType<typeof useCompositionData>["allIds"];
  contributorQuery: string;
  onContributorQuery: (q: string) => void;
  onSelect: (item: CompositionManifestItem) => void;
  onNew: () => void;
  onDelete: () => void;
}) {
  return (
    <Stack gap="lg">
      <Stack gap="sm">
        <div className="flex items-center justify-between gap-sm">
          <SectionLabel>Compositions</SectionLabel>
          <Button variant="outline" size="sm" onClick={onNew}>
            <MdAdd />
            New
          </Button>
        </div>
        {items.length === 0 ? (
          <Text variant="caption" tone="muted">
            No named compositions yet. Create one with New.
          </Text>
        ) : (
          <Stack gap="2xs">
            {items.map((item) => (
              <Row
                key={item.id}
                selected={editingId === item.id}
                onClick={() => onSelect(item)}
                actions={
                  <Badge size="sm" variant="muted">
                    {item.entryPoints.length} entry ·{" "}
                    {item.selectedContributors.length} sel
                  </Badge>
                }
                actionsAlwaysVisible
              >
                <span className="truncate">{item.name}</span>
              </Row>
            ))}
          </Stack>
        )}
      </Stack>

      {!active ? (
        <Text variant="caption" tone="muted">
          Select a composition to make it the working draft and tint the Explorer
          tree by its closure.
        </Text>
      ) : (
        <Stack gap="lg">
          <DraftActions
            draft={active}
            editingId={editingId}
            onDelete={onDelete}
          />

          {membership && (
            <Stack gap="sm">
              <SectionLabel>Summary</SectionLabel>
              <MembershipSummary membership={membership} />
            </Stack>
          )}

          {resolved && (
            <ContributorEditor
              draft={active}
              resolved={resolved}
              query={contributorQuery}
              onQueryChange={onContributorQuery}
            />
          )}

          <EntryEditor draft={active} allIds={allIds} />
        </Stack>
      )}
    </Stack>
  );
}

// ── Compare mode (Increment 3) ─────────────────────────────────────────────

function CompareSection({
  manifests,
  active,
  compare,
  diff,
  onSetA,
  onSetB,
}: {
  manifests: CompositionManifest[];
  active: CompositionManifest | null;
  compare: CompositionManifest | null;
  diff: ReturnType<typeof useDiffMap>;
  onSetA: (m: CompositionManifest) => void;
  onSetB: (m: CompositionManifest) => void;
}) {
  return (
    <Stack gap="lg">
      <Text variant="caption" tone="muted">
        Pick two compositions; the Explorer tints each plugin by which bundle it
        lands in. The delta below is the symmetric difference of the two bundles.
      </Text>

      <CompositionPicker
        label="A"
        manifests={manifests}
        selected={active?.name ?? null}
        onSelect={onSetA}
      />
      <CompositionPicker
        label="B"
        manifests={manifests}
        selected={compare?.name ?? null}
        onSelect={onSetB}
      />

      {active && compare && diff ? (
        <DiffDelta diff={diff} nameA={active.name} nameB={compare.name} />
      ) : (
        <Text variant="caption" tone="muted">
          Select both A and B to see the delta.
        </Text>
      )}
    </Stack>
  );
}

function CompositionPicker({
  label,
  manifests,
  selected,
  onSelect,
}: {
  label: string;
  manifests: CompositionManifest[];
  selected: string | null;
  onSelect: (m: CompositionManifest) => void;
}) {
  return (
    <Stack gap="2xs">
      <SectionLabel>{label}</SectionLabel>
      <Stack gap="2xs">
        {manifests.map((m) => (
          <Row
            key={m.name}
            selected={selected === m.name}
            onClick={() => onSelect(m)}
          >
            <span className="truncate">{m.name}</span>
          </Row>
        ))}
      </Stack>
    </Stack>
  );
}
