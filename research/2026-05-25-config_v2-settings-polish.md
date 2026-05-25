# config_v2 Settings UI Polish

## Context

The config_v2 settings UI has a working two-pane nav + detail surface, but lacks polish items identified during implementation: tier provenance per field, filtering, hierarchy grouping, bulk reset, and proactive conflict notifications. These five items round out the settings experience from "functional" to "production-ready."

## Feature 1: Tier Badges Per Field

### Problem

`getConfig()` returns plain values — there's no way to know whether a field's value comes from code defaults, a git-layer override, or a user override. The detail pane shows "modified" (differs from defaults) but doesn't distinguish _which_ layer modified it.

### Design

Add a new live-state resource `configV2TiersResource` that pushes `Record<string, "default" | "git" | "user">` per config, computed by comparing the three layers.

**Tier semantics per field:**
- `"user"` — user override file exists AND `overrideValue[key] !== originValue[key]` (deep equality)
- `"git"` — origin value differs from code defaults (deep equality)
- `"default"` — value unchanged through both layers

Fields using `FieldStorageProvider` (e.g. secrets) always show `"default"` since their values live outside JSONC.

### Changes

**`plugins/config_v2/core/internal/resource.ts`** — add:
```ts
export const configV2TiersSchema = z.record(z.enum(["default", "git", "user"]));
export type ConfigV2Tiers = z.infer<typeof configV2TiersSchema>;
export const configV2TiersResource = resourceDescriptor<ConfigV2Tiers, { path: string }>(
  "config-v2.tiers", configV2TiersSchema, {},
);
```

**`plugins/config_v2/core/index.ts`** — export `configV2TiersResource`, `configV2TiersSchema`, `ConfigV2Tiers`.

**`plugins/config_v2/server/internal/resource.ts`** — add `configV2TiersServerResource`:
- `defineResource` with key `"config-v2.tiers"`, mode `"push"`, keyed by `{ path }`.
- Loader reads `jsoncConfigProxy(originPath)` and `jsoncConfigProxy(overridePath)`, compares per-field against `descriptor.defaults` using `JSON.stringify` equality (matching existing `isFieldModified` approach).
- Skip `FieldStorageProvider` fields (always `"default"`).

**`plugins/config_v2/server/index.ts`** — add `Resource.Declare(configV2TiersServerResource)` to contributions.

**`plugins/config_v2/server/internal/registry.ts`** — in `onFileChange`, add `configV2TiersServerResource.notify({ path: storePath })`.

**NEW `plugins/config_v2/plugins/settings/web/internal/use-tiers.ts`**:
```ts
export function useTiers(storePath: string): ConfigV2Tiers {
  const result = useResource(configV2TiersResource, { path: storePath });
  return result.pending ? {} : result.data;
}
```

**`plugins/config_v2/plugins/settings/web/components/config-detail.tsx`** — call `useTiers(registration.storePath)`, pass `tier={tiers[key]}` to each `ConfigFieldRow`.

**`plugins/config_v2/plugins/settings/web/components/config-field-row.tsx`** — add `tier?: "default" | "git" | "user"` prop. Render a rounded-full pill badge next to the reset button when tier is `"git"` or `"user"`:

```tsx
const TIER_BADGE = {
  git:  { label: "git",  className: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  user: { label: "user", className: "bg-primary/10 text-primary" },
} as const;

// Only show for non-default tiers:
{tier && tier !== "default" && (
  <span className={cn("shrink-0 rounded-full px-1.5 py-px text-[10px] font-medium", TIER_BADGE[tier].className)}>
    {TIER_BADGE[tier].label}
  </span>
)}
```

---

## Feature 2: "Show Only Modified" Filter Toggle

### Problem

With many registered configs, finding the ones you've customized requires scrolling through the entire flat list.

### Design

Add a `FilterChip` toggle labeled "Modified" next to the SearchInput. When active, nav rows with zero modifications and no conflicts hide themselves.

The filter lives _inside_ each `ConfigNavRow` rather than the parent, because each row already calls `useConfig()` to compute `modifiedCount`. Lifting that into the parent would duplicate the hook calls. Instead, pass `hideIfUnmodified` down and let rows return `null` when unmodified.

### Changes

**`plugins/config_v2/plugins/settings/web/components/config-nav.tsx`**:
- Add `useState<boolean>(false)` for `showModifiedOnly`.
- Render `FilterChip` from `@plugins/primitives/plugins/filter-chips/web` next to `SearchInput`.
- Pass `hideIfUnmodified={showModifiedOnly}` to each `ConfigNavRow`.

**`plugins/config_v2/plugins/settings/web/components/config-nav-row.tsx`**:
- Add `hideIfUnmodified?: boolean` prop.
- When `hideIfUnmodified && modifiedCount === 0 && !hasConflict`, return `null`.

---

## Feature 3: Tree Hierarchy Grouping in Nav

### Problem

The nav pane is a flat list of all config registrations. With many plugins, this is hard to navigate. The `hierarchyPath` (e.g. `auth/plugins/google`, `backup/plugins/google-drive`) already encodes the plugin tree structure.

### Design

Build a lightweight tree from `hierarchyPath` segments. Use `Collapsible` for expand/collapse. When the text search is active (query non-empty), fall back to the flat filtered list — this avoids complex auto-expand logic.

**Tree structure:** Parse each `hierarchyPath` by splitting on `/`. Group registrations by their path prefix. Interior nodes are collapsible groups; leaf nodes are config registration rows.

Example: paths `auth/plugins/google`, `auth/plugins/notion`, `backup/plugins/google-drive` produce:
```
▸ auth
    ▸ google  (config row)
    ▸ notion  (config row)
▸ backup
    ▸ google-drive  (config row)
```

Strip `plugins/` segments from labels (they're structural noise). Group nodes only appear when they have 2+ children or contain nested groups.

### Changes

**NEW `plugins/config_v2/plugins/settings/web/internal/build-config-tree.ts`**:
- `buildConfigTree(registrations: ConfigRegistration[]): ConfigTreeGroup[]`
- `ConfigTreeGroup = { id: string, label: string, children: ConfigTreeGroup[], registrations: ConfigRegistration[] }`
- Groups by hierarchyPath prefix, stripping `plugins/` segments for display labels.

**NEW `plugins/config_v2/plugins/settings/web/components/config-nav-group.tsx`**:
- Recursive `ConfigNavGroup` component using `Collapsible` + `CollapsibleTrigger` + `CollapsibleContent` + `CollapsibleChevron`.
- Accepts `depth` for indentation (`style={{ paddingLeft: depth * 12 + 8 }}`).
- Renders children groups recursively, then leaf registration rows.

**`plugins/config_v2/plugins/settings/web/components/config-nav.tsx`**:
- When `query` is empty: render tree via `buildConfigTree(registrations)` + `ConfigNavGroup`.
- When `query` is non-empty: render flat filtered list (existing behavior).
- Manage expand state via `useState<Set<string>>` (all expanded by default).

**`plugins/config_v2/plugins/settings/web/components/config-nav-row.tsx`**:
- Add optional `depth?: number` prop for indentation in tree mode.
- When `depth` is provided, use `style={{ paddingLeft: depth * 12 + 8 }}` instead of `px-2`.

---

## Feature 4: Full Config Reset Button

### Problem

Users can reset individual fields but not all fields at once. The `deleteOverride` endpoint already exists and does the right thing (deletes the override file, causing all fields to revert to origin/defaults).

### Design

Add a "Reset all" button in the detail pane header (alongside the Fields/Raw toggle). Only visible when at least one field is modified. Uses an inline confirmation step (not a modal) matching the existing conflict resolution UX pattern.

### Changes

**`plugins/config_v2/plugins/settings/web/components/config-detail.tsx`**:
- Add `useState<boolean>(false)` for `confirmReset`.
- Compute `hasAnyModified` via `useMemo` over field values vs defaults.
- Clear `confirmReset` when `registration.storePath` changes (useEffect).
- Render in header row:
  - Default state: "Reset all" button (MdUndo icon + text, muted styling).
  - Confirm state: "Reset all fields?" label + "Reset" button (destructive styling) + "Cancel" button.
- "Reset" calls `fetchEndpoint(deleteOverride, ...)`.
- Only show when `hasAnyModified && !showRaw`.

---

## Feature 5: Conflict Detection Toast

### Problem

Conflicts (stale `@hash` in user override) are only `console.warn`'d at build time. The sidebar dot indicates ongoing conflicts but there's no proactive push notification when new conflicts appear.

### Design

A `ConflictWatcher` component (rendered via `Core.Root`) that tracks conflict count changes and fires a toast when the count increases. Follows the existing `MutationErrorWatcher` / `AutoLaunchWatcher` pattern: null-returning component with `useRef` to track previous state.

### Changes

**NEW `plugins/config_v2/plugins/settings/web/components/conflict-watcher.tsx`**:
```tsx
export function ConflictWatcher() {
  const conflicts = useConflicts();
  const initializedRef = useRef(false);
  const prevCountRef = useRef(0);

  useEffect(() => {
    const count = Object.keys(conflicts).length;
    if (!initializedRef.current) {
      initializedRef.current = true;
      prevCountRef.current = count;
      return;
    }
    if (count > prevCountRef.current) {
      const newCount = count - prevCountRef.current;
      toast({
        type: "config-conflict",
        title: "Config conflicts detected",
        description: `${newCount} config${newCount > 1 ? "s have" : " has"} upstream changes`,
        variant: "warning",
      });
    }
    prevCountRef.current = count;
  }, [conflicts]);

  return null;
}
```

**`plugins/config_v2/plugins/settings/web/index.ts`** — add `Core.Root({ component: ConflictWatcher })` to contributions.

---

## Implementation Order

```
1. Tier resource + badges     (server + web, most infrastructure)
2. Modified filter toggle     (web only, 2 files)
3. Tree hierarchy nav         (web only, 2 new + 2 modified files)
4. Full config reset          (web only, 1 file)
5. Conflict toast             (web only, 1 new + 1 modified file)
```

Features 2–5 are independent of each other. Only Feature 1 adds server-side changes; the rest are web-only.

## Files Summary

| File | F1 | F2 | F3 | F4 | F5 |
|------|----|----|----|----|-----|
| `config_v2/core/internal/resource.ts` | M | | | | |
| `config_v2/core/index.ts` | M | | | | |
| `config_v2/server/internal/resource.ts` | M | | | | |
| `config_v2/server/internal/registry.ts` | M | | | | |
| `config_v2/server/index.ts` | M | | | | |
| `settings/web/internal/use-tiers.ts` | **N** | | | | |
| `settings/web/internal/build-config-tree.ts` | | | **N** | | |
| `settings/web/components/config-nav-group.tsx` | | | **N** | | |
| `settings/web/components/conflict-watcher.tsx` | | | | | **N** |
| `settings/web/components/config-detail.tsx` | M | | | M | |
| `settings/web/components/config-nav.tsx` | | M | M | | |
| `settings/web/components/config-nav-row.tsx` | M | M | M | | |
| `settings/web/components/config-field-row.tsx` | M | | | | |
| `settings/web/index.ts` | | | | | M |

M = modified, **N** = new file

## Verification

1. **Tier badges**: Open config with defaults → no badges. Set a field → "user" badge appears. Reset → badge gone. With a git-layer override → "git" badge on changed fields. Badges update live on disk changes.
2. **Modified filter**: Toggle on with no modifications → all rows hidden. Toggle with some → only those shown. Works alongside text search. Toggle off → all restored.
3. **Tree nav**: Groups appear when search is empty. Expand/collapse works. Typing in search reverts to flat list. Clearing search restores tree. Selecting a row opens detail correctly.
4. **Reset all**: Button visible only when fields modified. Click → inline confirm. "Cancel" → back to button. "Reset" → all fields revert, button disappears. Navigating away clears confirm state.
5. **Conflict toast**: No toast on startup with pre-existing conflicts. Create a conflict (change origin while override has stale hash) → toast fires once. Acknowledge → no toast. Multiple new conflicts → single toast with count.
