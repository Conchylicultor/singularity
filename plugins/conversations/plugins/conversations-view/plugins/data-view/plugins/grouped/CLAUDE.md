# grouped

The **Grouped** tab of the `dataview` sidebar variant: user-defined conversation
groups rendered through the DataView primitive's **tree** view. Duplicates
presentation, not data — the `conversation_groups` / `conversation_group_members`
tables, the `conversation-groups` resource, and the group CRUD endpoints stay in
`conversations-view/plugins/grouped/{core,server}` and are consumed here only
through that plugin's public `core` barrel.

## The row model is a union

The tree resolves `getParentId` against rows **in the same array**, so the groups
and buckets a conversation hangs under must themselves be rows. `GroupedRow` is a
discriminated union (`group | auto-group | bucket | conv | fork`) and every
`HierarchyConfig` accessor dispatches on `kind`. Sanctioned primitive usage, not a
workaround: `HierarchyConfig` is generic over one `TRow`.

Root order: user groups (by `group.rank`) → task auto-groups → `Ungrouped` →
`Closed`.

## Ranks are minted, so the consumer is endpoint-based

Only two things are truly ranked in storage: user groups, and the members within
one group. Every other row's rank (buckets, auto-groups, forks, the ungrouped
conversations) is **minted** at projection time with `Rank.nBetween` — the same
precedent the tree's own alias nodes set.

A minted rank is projection-local, so `onMove` **never** persists `dest.rank`: it
forwards `dest.targetId` / `dest.zone` to an endpoint and lets the server resolve
the rank against the complete sibling set. The one exception is **group reorder**,
where this consumer holds the complete unfiltered `groups` list and resolves the
rank itself via `computeFlatReorder` — exactly as the classic tab does.

## `onMove` — the tree owns the geometry, this owns the meaning

The tree reports a whole-row ("child") drop as `targetId: null` + the drop
target's id in `parentId`, and an edge drop with `targetId` set + `parentId` = the
target's parent. That one distinction reproduces classic's entire `DropTarget`
union:

| A conversation dropped onto | Action |
| --- | --- |
| a conv already in group G | join G |
| a conv in no group | create a group titled after the target, holding both |
| a group row | join it (no-op if the whole cluster is already in) |
| an auto-group row | promote the cluster to a real group, adding the dragged set |
| `Ungrouped` | detach every dragged conversation that is grouped |
| **between two members of a group** | `moveConversationGroupMember` (server-resolved rank) |
| the root, between containers | create a new group |
| *(dragging a group)* another group's edge | `patchConversationGroup { rank }` |

An edge drop into an **unordered** container (Ungrouped, an auto-group, beside a
fork) carries no order to persist, so it resolves to exactly what a whole-row drop
on that container means — never a silent no-op.

A dragged conversation carries its **auto-group cluster** with it (classic's "drag
one, move the cluster"). Classic captured that set at drag start;
`HierarchyConfig` exposes no drag-start seam, so it is read at drop time instead —
at worst fresher than the captured set.

## Show/hide system conversations is the filter pill

Classic had a bespoke eye toggle. Here `kind` is a typed **filter-only** `enum`
field and the committed config authors a default `kind is-none-of [system]` filter
plus `visibleFields: ["title"]` (so `kind` never renders as a row chip). The
DataView filter pill *is* the control — the duplication this migration exists to
remove. Group/bucket rows project `kind: null`, which `is-none-of` admits, so a
group never disappears for holding no matching conversation.

## Rename is gated per row

The primary `title` field declares `onEdit`, which would make **every** row's label
editable. `FieldDef.canEdit` withdraws it for `conv` / `fork` / `bucket` rows —
conversations have no rename endpoint, so an editor there would silently discard
writes. Renaming an `auto-group` *promotes* it to a real group.

## Deliberate drops vs the classic tab

- **No infinite pagination of `Closed`** — the bounded `recentGone` set only; the
  History tab covers full history (the Queue tab's ruling for its Done section).
- **No mid-drag collapse-to-headers, no drag-handle grip, no per-group empty-state
  copy** — the tree ships auto-scroll + re-measurement + whole-row drag instead.
- **Auto-focus rename fires on `onCreate` only** (the "New group" button), not on a
  drag-created group; drag-created groups inherit the target conversation's title.
- **The count badge is always visible**, not hover-revealed.

## Known primitive gap

Supplying `hierarchy.onCreate` makes the tree render a hover-revealed **"+"
(add-child) on every row**, because `TreeList.canCreate` is a single tree-wide
boolean — there is no per-row create gate. Here every create means "new group"
regardless of the row, so the affordance is redundant rather than broken. A
`HierarchyConfig.canCreateChild?(row)` (the twin of `FieldDef.canEdit`) would
remove it.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Contributes the user-defined conversation Groups (rebuilt on the official DataView primitive as a tree — group → conversations, both ranked, over the grouped plugin's live data/mutation layer) as the Grouped tab of the `dataview` sidebar variant.
- Web:
  - Contributes: `SidebarDataView.View` "Grouped" → `SidebarGroupedBody`, `conversations-sidebar-grouped-actions` "remove-from-group" → `RemoveFromGroupAction`, `conversations-sidebar-grouped-actions` "delete-group" → `DeleteGroupAction`, `conversations-sidebar-grouped-actions` "close" → `CloseAction`
  - Uses: `conversations.useConversations`, `conversations/conversation-ui/item.ConversationItem`, `conversations/conversations-view/data-view.SidebarDataView`, `infra/endpoints.fetchEndpoint`, `primitives/css/badge.Badge`, `primitives/css/inline.Inline`, `primitives/css/scroll.Scroll`, `primitives/css/text.Text`, `primitives/data-view.DataView`, `primitives/data-view.defineDataView`, `primitives/data-view.defineItemActions`, `primitives/live-state.useCombinedResources`, `primitives/live-state.useResource`, `primitives/persistent-draft.useDraft`, `primitives/row-actions.RowActionButton`

<!-- AUTOGENERATED:END -->
